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
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
try:
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
except Exception:
    Counter = None
    Histogram = None
    generate_latest = None
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4"

log = logging.getLogger(__name__)

# ── MLOps pipeline orchestrator state ─────────────────────────────────────────
_mlops_lock = threading.Lock()
_mlops_state: dict = {
    "status": "idle",  # idle | running | completed | failed
    "started_at": None,
    "completed_at": None,
    "step": "",
    "run_id": None,
    "model_name": None,
    "model_version": None,
    "promoted": None,
    "exit_code": None,
    "error": None,
    "log_path": None,
}


def _mlops_log_dir() -> Path:
    d = Path("logs") / "mlops_runs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _append_mlops_history(record: dict) -> None:
    hist = Path("logs") / "mlops_history.jsonl"
    hist.parent.mkdir(parents=True, exist_ok=True)
    hist.write_text(hist.read_text(encoding="utf-8") + json.dumps(record) + "\n", encoding="utf-8") if hist.exists() else hist.write_text(json.dumps(record) + "\n", encoding="utf-8")


def _run_mlops_pipeline_subprocess(args: dict) -> None:
    started_at = time.time()
    log_path = _mlops_log_dir() / f"mlops_{int(started_at)}.log"

    cmd = [
        sys.executable,
        "-m",
        "mlops.pipeline_runner",
        "--data-path",
        str(args.get("data_path") or "DATASET/df_master_engineered.parquet"),
        "--model-dir",
        str(args.get("model_dir") or "."),
        "--min-dso4-auc",
        str(args.get("min_dso4_auc") or 0.90),
        "--min-dso4-mcc",
        str(args.get("min_dso4_mcc") or 0.70),
    ]
    if args.get("with_mlflow", True):
        cmd.append("--with-mlflow")
    if args.get("promote", True):
        cmd.append("--promote")
    if args.get("require_promotion", True):
        cmd.append("--require-promotion")

    env = os.environ.copy()
    # Keep existing default behavior (file:./mlruns) unless user overrides.
    env.setdefault("MLFLOW_TRACKING_URI", "file:./mlruns")

    run_id = None
    model_version = None
    promoted = False

    try:
        with subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        ) as p, open(log_path, "w", encoding="utf-8") as f:
            for line in p.stdout or []:
                f.write(line)
                f.flush()
                if run_id is None:
                    m = re.search(r"MLflow run:\\s*([0-9a-f]{32})", line)
                    if m:
                        run_id = m.group(1)
                if model_version is None:
                    m2 = re.search(r"DSO4 registered as version\\s+(\\d+)", line)
                    if m2:
                        model_version = m2.group(1)
                if "→ Production" in line or "-> Production" in line:
                    promoted = True
            p.wait()
            exit_code = int(p.returncode or 0)
        error_msg = None if exit_code == 0 else f"pipeline_runner exit_code={exit_code}"
    except Exception as exc:
        exit_code = 1
        error_msg = f"pipeline_runner_exception={exc}"
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"[mlops-runner-exception] {exc}\n")
        except Exception:
            pass

    completed_at = time.time()
    status = "completed" if exit_code == 0 else "failed"
    promotion_reason = (
        "Promoted to Production stage."
        if (exit_code == 0 and promoted)
        else (
            "Run succeeded but promotion did not happen."
            if exit_code == 0
            else (error_msg or "Pipeline failed before promotion.")
        )
    )

    with _mlops_lock:
        _mlops_state.update(
            {
                "status": status,
                "completed_at": completed_at,
                "step": "done",
                "run_id": run_id,
                "model_name": args.get("mlflow_model_name") or "5G-DSO4-Controller",
                "model_version": model_version,
                "promoted": promoted if exit_code == 0 else False,
                "promotion_reason": promotion_reason,
                "exit_code": exit_code,
                "error": error_msg,
                "log_path": str(log_path),
            }
        )

    _append_mlops_history(
        {
            "started_at": started_at,
            "completed_at": completed_at,
            "status": status,
            "exit_code": exit_code,
            "run_id": run_id,
            "model_name": args.get("mlflow_model_name") or "5G-DSO4-Controller",
            "model_version": model_version,
            "promoted": promoted if exit_code == 0 else False,
            "promotion_reason": promotion_reason,
            "error": error_msg,
            "log_path": str(log_path),
        }
    )


class MLOpsRunRequest(BaseModel):
    data_path: str = "DATASET/df_master_engineered.parquet"
    model_dir: str = "."
    with_mlflow: bool = True
    promote: bool = True
    require_promotion: bool = True
    min_dso4_auc: float = 0.90
    min_dso4_mcc: float = 0.70
    mlflow_model_name: str = "5G-DSO4-Controller"


def _read_tail(path: Path, max_lines: int = 200) -> list[str]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return lines[-max_lines:]
    except Exception:
        return []


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
    dso2_target_rsrp: float = Field(-140.0, description="DSO2 predicted target RSRP")
    dso2_num_candidates: float = Field(0.0, description="DSO2 viable candidate count")

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
        extra = "allow"
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
if Counter and Histogram:
    PREDICT_REQUESTS_TOTAL = Counter(
        "cellpilot_predict_requests_total",
        "Total number of predict requests",
    )
    PREDICT_ERRORS_TOTAL = Counter(
        "cellpilot_predict_errors_total",
        "Total number of failed predict requests",
    )
    HANDOVER_RECOMMENDED_TOTAL = Counter(
        "cellpilot_handover_recommended_total",
        "Total number of handover recommendations",
    )
    PREDICT_LATENCY_SECONDS = Histogram(
        "cellpilot_predict_latency_seconds",
        "Predict endpoint latency in seconds",
        buckets=(0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0),
    )
else:
    PREDICT_REQUESTS_TOTAL = None
    PREDICT_ERRORS_TOTAL = None
    HANDOVER_RECOMMENDED_TOTAL = None
    PREDICT_LATENCY_SECONDS = None

# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/metrics/prometheus", tags=["System"])
def prometheus_metrics():
    """Expose Prometheus-compatible metrics endpoint."""
    if generate_latest is None:
        return PlainTextResponse("Prometheus client not installed", status_code=501)
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

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
    t0 = time.perf_counter()
    if PREDICT_REQUESTS_TOTAL:
        PREDICT_REQUESTS_TOTAL.inc()
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
        if HANDOVER_RECOMMENDED_TOTAL and result.get("handover_recommended"):
            HANDOVER_RECOMMENDED_TOTAL.inc()
        if PREDICT_LATENCY_SECONDS:
            PREDICT_LATENCY_SECONDS.observe(time.perf_counter() - t0)

        return result
    except Exception as exc:
        log.exception("Prediction error")
        if PREDICT_ERRORS_TOTAL:
            PREDICT_ERRORS_TOTAL.inc()
        if PREDICT_LATENCY_SECONDS:
            PREDICT_LATENCY_SECONDS.observe(time.perf_counter() - t0)
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


@app.get("/metrics/prometheus", tags=["System"])
def get_prometheus_metrics():
    """Expose Prometheus metrics for observability stack scraping."""
    if not generate_latest:
        return PlainTextResponse("prometheus_client not installed", status_code=503)
    return PlainTextResponse(generate_latest().decode("utf-8"), media_type=CONTENT_TYPE_LATEST)


@app.post("/mlops/run", tags=["MLOps"])
def mlops_run(req: MLOpsRunRequest):
    with _mlops_lock:
        if _mlops_state.get("status") == "running":
            return {"ok": False, "error": "MLOps pipeline already running", "state": dict(_mlops_state)}
        _mlops_state.update(
            {
                "status": "running",
                "started_at": time.time(),
                "completed_at": None,
                "step": "starting",
                "run_id": None,
                "model_name": req.mlflow_model_name,
                "model_version": None,
                "promoted": None,
                "exit_code": None,
                "error": None,
                "log_path": None,
            }
        )

    t = threading.Thread(target=_run_mlops_pipeline_subprocess, args=(req.model_dump(),), daemon=True)
    t.start()
    return {"ok": True, "state": dict(_mlops_state)}


@app.get("/mlops/status", tags=["MLOps"])
def mlops_status():
    with _mlops_lock:
        state = dict(_mlops_state)
    log_tail: list[str] = []
    if state.get("log_path"):
        log_tail = _read_tail(Path(state["log_path"]), max_lines=250)
    return {"state": state, "log_tail": log_tail}


@app.get("/mlops/history", tags=["MLOps"])
def mlops_history():
    path = Path("logs") / "mlops_history.jsonl"
    if not path.exists():
        return {"items": []}
    items: list[dict] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines()[-200:]:
        try:
            items.append(json.loads(line))
        except Exception:
            continue
    items.reverse()
    return {"items": items}


@app.get("/mlops/mlflow-summary", tags=["MLOps"])
def mlflow_summary():
    """
    Returns recent runs and model versions from the MLflow tracking store.
    Uses MLFLOW_TRACKING_URI or defaults to file:./mlruns (same as pipeline runner).
    """
    try:
        import mlflow
        from mlflow.tracking import MlflowClient

        tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "file:./mlruns")
        mlflow.set_tracking_uri(tracking_uri)
        client = MlflowClient()

        exp = mlflow.get_experiment_by_name("5G-Handover-AI")
        exp_id = exp.experiment_id if exp else "0"

        runs = mlflow.search_runs(
            experiment_ids=[exp_id],
            max_results=20,
            order_by=["attributes.start_time DESC"],
        )
        recent_runs = []
        if runs is not None and len(runs) > 0:
            for _, row in runs.iterrows():
                recent_runs.append(
                    {
                        "run_id": row.get("run_id"),
                        "status": row.get("status"),
                        "start_time": row.get("start_time"),
                        "end_time": row.get("end_time"),
                    }
                )

        model_name = "5G-DSO4-Controller"
        versions = []
        try:
            for mv in client.search_model_versions(f"name='{model_name}'"):
                versions.append(
                    {
                        "name": mv.name,
                        "version": mv.version,
                        "creation_timestamp": mv.creation_timestamp,
                        "current_stage": getattr(mv, "current_stage", None),
                        "run_id": mv.run_id,
                    }
                )
            versions.sort(key=lambda x: int(x["version"]), reverse=True)
        except Exception:
            versions = []

        return {
            "tracking_uri": tracking_uri,
            "experiment": {"name": "5G-Handover-AI", "id": exp_id},
            "recent_runs": recent_runs,
            "model_registry": {"name": model_name, "versions": versions[:20]},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
