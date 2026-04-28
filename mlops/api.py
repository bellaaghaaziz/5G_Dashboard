"""
api.py — 5G Handover AI: FastAPI Inference Server
===================================================
Exposes the v9 four-stage DSO pipeline as a REST API.

Endpoints:
    GET  /health         → enhanced liveness probe + stats
    GET  /models/info    → loaded model metadata
    POST /predict        → full 4-stage pipeline
    POST /predict/dso1   → DSO1 only (signal risk)
    POST /predict/dso3   → DSO3 only (network cluster)
    POST /predict/dso4   → DSO4 only (handover decision)
    GET  /dataset/info   → dataset metadata for time slider
    GET  /dataset/slice/{ts_index} → predictions for a time slice
    GET  /dataset/ue-types → UE scenario types in the dataset
    POST /retrain        → start model retraining
    GET  /retrain/status → training progress
    GET  /drift/status   → feature drift analysis
    GET  /metrics        → real model metrics from metrics.json

Run:
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload
    make api
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

# ── App setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="5G Handover AI",
    description="v9 Two-Stage DSO inference pipeline: DSO3 → DSO1 → DSO4 (gate + calibrated)",
    version="2.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model loading ────────────────────────────────────────────────────────────
_artifacts: dict | None = None


def get_artifacts() -> dict:
    global _artifacts
    if _artifacts is None:
        from src.model_pipeline import load_artifacts
        _artifacts = load_artifacts()
        log.info("Models loaded and ready")
    return _artifacts


@app.on_event("startup")
async def startup_event():
    get_artifacts()
    # Initialize drift baseline if not exists
    try:
        from src.drift_detector import get_drift_detector, BASELINE_PATH
        dd = get_drift_detector()
        if not BASELINE_PATH.exists():
            info = _load_dataset_info()
            if info:
                dd.set_baseline_from_dataframe(info["df"])
    except Exception as e:
        log.warning("Could not init drift baseline: %s", e)


# ── ELK logging (optional) ──────────────────────────────────────────────────
_elk_logger = None

def _get_elk():
    global _elk_logger
    if _elk_logger is None:
        try:
            from elk_logger import log_prediction
            _elk_logger = log_prediction
        except Exception:
            _elk_logger = lambda *a, **k: None
    return _elk_logger


# ── Pydantic schemas ────────────────────────────────────────────────────────

class TelemetryInput(BaseModel):
    """All features the pipeline may need. Unknown features default to 0."""

    # Core radio
    rsrp: float = Field(-95.0, description="Reference Signal Received Power (dBm)")
    rsrq: float = Field(-12.0, description="Reference Signal Received Quality (dB)")
    sinr: float = Field(10.0, description="Signal to Interference + Noise Ratio")
    cqi: float = Field(9.0, description="Channel Quality Indicator [0-15]")
    tx_power: float = Field(15.0, description="UE transmit power (dBm)")
    ta: float = Field(5.0, description="Timing Advance")

    # Mobility
    velocity: float = Field(5.0, description="Device speed (m/s)")

    # Neighbours
    num_neighbors: float = Field(2.0, description="Number of visible neighbour cells")
    mean_neighbor_rsrp: float = Field(-90.0, description="Mean RSRP of neighbours (dBm)")
    best_neighbor_rsrp: float = Field(-88.0, description="Best neighbour RSRP (dBm)")

    # Temporal
    hour_of_day: float = Field(12.0, ge=0, le=23)
    day_of_week: float = Field(2.0, ge=0, le=6)

    # Signal history
    rsrp_delta_3: float = Field(0.0, description="RSRP change over last 3 steps")
    sinr_delta_3: float = Field(0.0, description="SINR change over last 3 steps")
    sinr_delta_5: float = Field(0.0, description="SINR change over last 5 steps")
    rsrp_lag_1: float = Field(-95.0, description="Previous RSRP value")
    rsrp_vs_rolling: float = Field(0.0, description="RSRP vs rolling average")
    rsrp_rolling_std_10: float = Field(1.0, description="RSRP rolling std over 10 steps")

    # Cell history
    cell_hist_datarate_mean: float = Field(25.0, description="Historical avg throughput (Mbps)")
    cell_hist_congestion_rate: float = Field(0.1, description="Historical congestion rate")
    cell_load_drop_flag: float = Field(0.0, description="1 if historically congested hour")
    rsrp_vs_hist_delta: float = Field(0.0, description="RSRP vs historical average")
    datarate_vs_hist_ratio: float = Field(1.0, description="Datarate vs historical ratio")

    # Current throughput
    datarate: float = Field(40.0, description="Current measured throughput (Mbps)")

    # Handover temporal features
    ho_count_60s: float = Field(0.0, description="Handover count in last 60s")
    time_since_last_ho: float = Field(100.0, description="Time since last handover (s)")
    serving_cell_age: float = Field(50.0, description="Time on current cell (s)")
    num_neighbors_delta: float = Field(0.0, description="Change in num_neighbors")
    neighbor_diversity: float = Field(0.5, description="Neighbour RSRP diversity")

    # DSO2 outputs (pre-computed or defaults)
    dso2_target_rsrp: float = Field(-90.0, description="DSO2 predicted target RSRP")
    dso2_num_candidates: float = Field(1.0, description="DSO2 viable candidate count")

    # Optional
    is_ho: float = Field(0.0)
    latency_is_imputed: float = Field(0.0)
    latitude: float = Field(0.0)
    longitude: float = Field(0.0)

    # City simulator UE metadata (optional, passed through to logs)
    physical_cellid: float = Field(0.0, description="Serving cell ID")
    master_id: str = Field("", description="UE device identifier")
    scenario: str = Field("", description="UE scenario type (car/pedestrian/hbahn/static)")
    ue_lat: float | None = Field(None, description="UE GPS latitude")
    ue_lng: float | None = Field(None, description="UE GPS longitude")
    delta_rsrp: float = Field(0.0, description="RSRP delta to best neighbor")

    class Config:
        json_schema_extra = {
            "example": {
                "rsrp": -95, "rsrq": -12, "sinr": 10, "cqi": 9,
                "velocity": 5.0, "num_neighbors": 2, "datarate": 40.0,
                "ho_count_60s": 1, "time_since_last_ho": 30,
            }
        }


class PredictionResponse(BaseModel):
    dso1_risk_score: float
    dso3_cluster: int
    dso3_label: str
    dso4_probability: float
    dso4_threshold: float
    handover_recommended: bool
    decision_source: str
    latency_ms: float


# ── Counters ─────────────────────────────────────────────────────────────────
_server_start = time.time()
_predictions_served = 0

# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/models/info", tags=["System"])
def models_info():
    """Return feature list metadata for every DSO."""
    a = get_artifacts()
    fl = a["feature_lists"]
    return {
        "dso1": {"features": fl.get("dso1_features", []), "n_features": len(fl.get("dso1_features", []))},
        "dso3": {"features": fl.get("dso3_features", []), "n_features": len(fl.get("dso3_features", []))},
        "dso4": {"features": fl.get("dso4_features", []), "n_features": len(fl.get("dso4_features", []))},
        "dso4_stage1": {"features": fl.get("dso4_stage1_features", [])},
        "dso4_threshold": fl.get("dso4_threshold"),
        "dso4_stage1_gate_threshold": fl.get("dso4_stage1_gate_threshold"),
    }


@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
def predict(payload: TelemetryInput):
    """Full 4-stage inference: DSO3 → DSO1 → DSO4 (gate + calibrated)."""
    global _predictions_served
    try:
        from src.model_pipeline import predict_single
        inputs = payload.model_dump()
        result = predict_single(inputs, get_artifacts())

        _predictions_served += 1

        # Record for drift detection
        try:
            from src.drift_detector import get_drift_detector
            get_drift_detector().record(inputs)
        except Exception:
            pass

        # Log to ELK
        _get_elk()(inputs, result)

        return result
    except Exception as exc:
        log.exception("Prediction error")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/predict/dso1", tags=["Inference"])
def predict_dso1(payload: TelemetryInput):
    """DSO1 only — signal degradation risk probability."""
    a = get_artifacts()
    fl = a["feature_lists"]
    inputs = payload.model_dump()
    X = pd.DataFrame([{f: inputs.get(f, 0.0) for f in fl["dso1_features"]}])
    X_s = a["scaler_dso1"].transform(X)
    risk = float(a["model_dso1"].predict_proba(X_s)[0][1])
    return {"dso1_risk_score": risk, "high_risk": risk > 0.5}


@app.post("/predict/dso3", tags=["Inference"])
def predict_dso3(payload: TelemetryInput):
    """DSO3 only — network state cluster."""
    a = get_artifacts()
    fl = a["feature_lists"]
    inputs = payload.model_dump()
    X = pd.DataFrame([{f: inputs.get(f, 0.0) for f in fl["dso3_features"]}])
    X_s = a["scaler_dso3"].transform(X)
    cluster = int(a["model_dso3_lr"].predict(X_s)[0])
    from src.model_pipeline import CLUSTER_LABELS
    return {"dso3_cluster": cluster, "label": CLUSTER_LABELS.get(cluster, f"Cluster {cluster}")}


@app.post("/predict/dso4", tags=["Inference"])
def predict_dso4(payload: TelemetryInput):
    """DSO4 only — handover decision (requires pre-filled DSO chain features)."""
    a = get_artifacts()
    fl = a["feature_lists"]
    inputs = payload.model_dump()
    X = pd.DataFrame([{f: inputs.get(f, 0.0) for f in fl["dso4_features"]}])
    cal = a["model_dso4_calibrated"]
    prob = float(cal.predict_proba(X)[0][1])
    thresh = a.get("threshold_dso4", 0.5)
    return {
        "dso4_probability": round(prob, 4),
        "handover_recommended": prob >= thresh,
        "threshold": round(thresh, 4),
    }


# ── Dataset endpoints (for operator time-slider) ────────────────────────────

_dataset_cache: dict | None = None


def _load_dataset_info():
    global _dataset_cache
    if _dataset_cache is not None:
        return _dataset_cache
    parquet_path = Path("DATASET/df_master_engineered.parquet")
    if not parquet_path.exists():
        return None
    df = pd.read_parquet(parquet_path)
    df = df.sort_values("ts_num").reset_index(drop=True)
    timestamps = sorted(df["ts_num"].unique().tolist())
    _dataset_cache = {
        "df": df,
        "timestamps": timestamps,
        "total_rows": len(df),
        "total_slices": len(timestamps),
        "ts_min": float(timestamps[0]),
        "ts_max": float(timestamps[-1]),
        "columns": list(df.columns),
    }
    return _dataset_cache


@app.get("/dataset/info", tags=["Dataset"])
def dataset_info():
    """Returns dataset metadata for the time slider."""
    info = _load_dataset_info()
    if info is None:
        raise HTTPException(404, "Dataset not found")
    return {
        "total_rows": info["total_rows"],
        "total_slices": info["total_slices"],
        "ts_min": info["ts_min"],
        "ts_max": info["ts_max"],
    }


@app.get("/dataset/slice/{ts_index}", tags=["Dataset"])
def dataset_slice(ts_index: int):
    """Get all predictions for a specific time slice by index. Runs live inference."""
    info = _load_dataset_info()
    if info is None:
        raise HTTPException(404, "Dataset not found")
    if ts_index < 0 or ts_index >= info["total_slices"]:
        raise HTTPException(400, f"ts_index must be 0-{info['total_slices']-1}")

    ts = info["timestamps"][ts_index]
    slice_df = info["df"][info["df"]["ts_num"] == ts]

    from src.model_pipeline import predict_single
    arts = get_artifacts()
    results = []
    for _, row in slice_df.iterrows():
        inputs = {}
        for k, v in row.to_dict().items():
            if k in ("datetime", "time_bin", "scenario", "master_id"):
                continue
            if isinstance(v, (pd.Timestamp, np.datetime64)):
                continue
            if pd.isna(v):
                inputs[k] = 0.0
            else:
                inputs[k] = float(v) if isinstance(v, (int, float, np.integer, np.floating)) else 0.0

        pred = predict_single(inputs, arts)
        results.append({
            "ue_id": str(row.get("master_id", "unknown")),
            "cell_id": int(row.get("physical_cellid", 0)),
            "ta": float(row.get("ta", 0)),
            "rsrp": float(row.get("rsrp", -140)),
            "sinr": float(row.get("sinr", 0)),
            "velocity": float(row.get("velocity", 0)),
            "scenario": str(row.get("scenario", "unknown")),
            "risk": pred["dso1_risk_score"],
            "dso4_probability": pred["dso4_probability"],
            "handover_recommended": pred["handover_recommended"],
            "cluster": pred["dso3_cluster"],
            "cluster_label": pred["dso3_label"],
            "latency_ms": pred["latency_ms"],
        })

    return {
        "ts_index": ts_index,
        "ts_value": ts,
        "total_slices": info["total_slices"],
        "ue_count": len(results),
        "events": results,
    }


@app.get("/dataset/ue-types", tags=["Dataset"])
def dataset_ue_types():
    """Return distinct UE scenario types and counts."""
    info = _load_dataset_info()
    if info is None:
        raise HTTPException(404, "Dataset not found")
    df = info["df"]
    if "scenario" not in df.columns:
        return {"types": [{"name": "unknown", "count": len(df)}]}
    counts = df["scenario"].value_counts().to_dict()
    return {
        "types": [{"name": str(k), "count": int(v)} for k, v in counts.items()]
    }


# ── Retraining endpoints ────────────────────────────────────────────────────

@app.post("/retrain", tags=["Training"])
def retrain():
    """Start model retraining in background. Returns immediately."""
    from src.training_manager import start_training
    return start_training()


@app.get("/retrain/status", tags=["Training"])
def retrain_status():
    """Get current training status and progress."""
    from src.training_manager import get_training_status
    return get_training_status()


# ── Drift detection endpoint ────────────────────────────────────────────────

@app.get("/drift/status", tags=["Monitoring"])
def drift_status():
    """Get current data drift analysis."""
    from src.drift_detector import get_drift_detector
    return get_drift_detector().get_drift_report()


# ── Real metrics endpoint ───────────────────────────────────────────────────

@app.get("/metrics", tags=["System"])
def get_metrics():
    """Return real model metrics from metrics.json."""
    metrics_path = Path("metrics.json")
    if not metrics_path.exists():
        return {"error": "No metrics file found"}
    try:
        return json.loads(metrics_path.read_text())
    except Exception as e:
        return {"error": str(e)}


# ── Enhanced health endpoint ────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health():
    """Enhanced health check with stats."""
    info = _load_dataset_info()
    return {
        "status": "ok",
        "models_loaded": _artifacts is not None,
        "uptime_seconds": round(time.time() - _server_start, 1),
        "predictions_served": _predictions_served,
        "dataset_loaded": info is not None,
        "dataset_rows": info["total_rows"] if info else 0,
    }


@app.get("/", tags=["System"])
def root():
    return {
        "service": "5G Handover AI Inference API",
        "version": "2.1.0",
        "docs": "/docs",
    }
