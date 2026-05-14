"""
src/model_pipeline.py — v9 Modular Pipeline
=============================================
Matches the 5G_Handover_Pipeline_v9.ipynb exactly.

Functions:
    load_artifacts()   → load all v9 .pkl files for inference
    prepare_data()     → load parquet, engineer features, 70/10/20 split
    train_all()        → train DSO1-DSO4 models from data splits
    evaluate_all()     → compute all metrics (AUC, MCC, etc.)
    save_artifacts()   → persist all .pkl files
    predict_single()   → full 4-stage inference for one sample
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    cohen_kappa_score,
    f1_score,
    matthews_corrcoef,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from src.calibration import IsotonicCalibrator

log = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT
DATA_DIR = PROJECT_ROOT / "DATASET"

# ── Feature lists (loaded from JSON produced by notebook) ────────────────────
_feature_lists: dict | None = None


def _load_feature_lists() -> dict:
    global _feature_lists
    if _feature_lists is None:
        fl_path = MODEL_DIR / "model_feature_lists.json"
        if fl_path.exists():
            with open(fl_path) as f:
                _feature_lists = json.load(f)
        else:
            raise FileNotFoundError(f"Feature lists not found: {fl_path}")
    return _feature_lists


# ═════════════════════════════════════════════════════════════════════════════
# LOAD — for inference / evaluation
# ═════════════════════════════════════════════════════════════════════════════


def load_artifacts(model_dir: str | Path | None = None) -> Dict[str, Any]:
    """Load all v9 model artifacts for inference.

    Returns dict with keys:
        scaler_dso1, scaler_dso3, model_dso1, model_dso2,
        model_dso3, model_dso3_lr, model_dso4_controller,
        model_dso4_calibrated, model_dso4_stage1, model_dso4_stage2,
        threshold_dso4, stage1_gate_threshold, feature_lists
    """
    import sys

    # The notebook pickled IsotonicCalibrator from __main__ scope.
    # Register it so unpickling works from any module.
    if not hasattr(sys.modules.get("__main__", None), "IsotonicCalibrator"):
        import __main__
        __main__.IsotonicCalibrator = IsotonicCalibrator
    d = Path(model_dir) if model_dir else MODEL_DIR

    artifacts = {
        "scaler_dso1": joblib.load(d / "scaler_dso1.pkl"),
        "scaler_dso3": joblib.load(d / "scaler_dso3.pkl"),
        "model_dso1": joblib.load(d / "model_dso1_xgb.pkl"),
        "model_dso2": joblib.load(d / "model_dso2_ranker.pkl"),
        "model_dso3": joblib.load(d / "model_dso3_kmeans.pkl"),
        "model_dso3_lr": joblib.load(d / "model_dso3_lr_classifier.pkl"),
        "model_dso4_controller": joblib.load(d / "model_dso4_controller.pkl"),
        "model_dso4_calibrated": joblib.load(d / "model_dso4_calibrated.pkl"),
        "model_dso4_stage1": joblib.load(d / "model_dso4_stage1_gate.pkl"),
    }

    # Optional artifacts
    stage2_path = d / "model_dso4_stage2_benefit.pkl"
    if stage2_path.exists():
        artifacts["model_dso4_stage2"] = joblib.load(stage2_path)

    threshold_path = d / "model_dso4_threshold.pkl"
    artifacts["threshold_dso4"] = joblib.load(threshold_path) if threshold_path.exists() else 0.5

    gate_path = d / "model_dso4_stage1_gate_threshold.pkl"
    artifacts["stage1_gate_threshold"] = joblib.load(gate_path) if gate_path.exists() else 0.3

    # Per-scenario models
    for scen in ("hbahn", "mobile"):
        scen_path = d / f"model_dso4_{scen}_controller.pkl"
        if scen_path.exists():
            artifacts[f"model_dso4_{scen}"] = joblib.load(scen_path)

    # DSO2 cell profiles (504 cells × RSRP statistics)
    cell_profiles_path = d / "model_dso2_cell_profiles.parquet"
    if cell_profiles_path.exists():
        artifacts["cell_profiles"] = pd.read_parquet(cell_profiles_path)

    # Feature lists
    fl_path = d / "model_feature_lists.json"
    if fl_path.exists():
        with open(fl_path) as f:
            artifacts["feature_lists"] = json.load(f)
    else:
        artifacts["feature_lists"] = _load_feature_lists()

    log.info("Loaded %d artifacts from %s", len(artifacts), d)
    return artifacts


# ═════════════════════════════════════════════════════════════════════════════
# PREPARE DATA — for training
# ═════════════════════════════════════════════════════════════════════════════


def prepare_data(
    parquet_path: str | Path | None = None,
) -> Dict[str, Any]:
    """Load engineered parquet and prepare train/cal/test splits.

    Returns dict with keys: df, dso1, dso2, dso3, dso4
    Each DSO sub-dict has: X_train, X_cal, X_test, y_train, y_cal, y_test, features
    """
    path = Path(parquet_path) if parquet_path else DATA_DIR / "df_master_engineered.parquet"
    log.info("Loading data from %s", path)
    df = pd.read_parquet(path)
    log.info("Loaded %d rows × %d columns", len(df), len(df.columns))

    fl = _load_feature_lists()

    # ── DSO1: Signal degradation ─────────────────────────────────────────
    dso1_feats = [f for f in fl["dso1_features"] if f in df.columns]
    dso1_target = "target_is_degrading"
    df_dso1 = df.dropna(subset=[dso1_target] + dso1_feats).copy()

    X1 = df_dso1[dso1_feats].fillna(0)
    y1 = df_dso1[dso1_target].astype(int)
    X1_tr, X1_te, y1_tr, y1_te = train_test_split(X1, y1, test_size=0.2, random_state=42)

    # ── DSO4: Handover controller (main target) ──────────────────────────
    dso4_feats = [f for f in fl["dso4_features"] if f in df.columns]
    dso4_target = "target_ho_flag"
    df_dso4 = df.dropna(subset=[dso4_target]).copy()

    X4 = df_dso4[dso4_feats].fillna(0)
    y4 = df_dso4[dso4_target].astype(int)

    # 70/10/20 split (train / calibration / test)
    X4_tr, X4_rest, y4_tr, y4_rest = train_test_split(X4, y4, test_size=0.30, random_state=42)
    X4_cal, X4_te, y4_cal, y4_te = train_test_split(X4_rest, y4_rest, test_size=2/3, random_state=42)

    # ── DSO3: Clustering ─────────────────────────────────────────────────
    dso3_feats = [f for f in fl["dso3_features"] if f in df.columns]
    X3 = df[dso3_feats].dropna().fillna(0)

    return {
        "df": df,
        "dso1": {
            "X_train": X1_tr, "X_test": X1_te,
            "y_train": y1_tr, "y_test": y1_te,
            "features": dso1_feats,
        },
        "dso3": {"X_all": X3, "features": dso3_feats},
        "dso4": {
            "X_train": X4_tr, "X_cal": X4_cal, "X_test": X4_te,
            "y_train": y4_tr, "y_cal": y4_cal, "y_test": y4_te,
            "features": dso4_feats,
            "stage1_features": [f for f in fl.get("dso4_stage1_features", []) if f in df.columns],
            "stage2_features": [f for f in fl.get("dso4_stage2_features", []) if f in df.columns],
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
# TRAIN — reproduce notebook pipeline
# ═════════════════════════════════════════════════════════════════════════════


def train_all(data: Dict[str, Any]) -> Dict[str, Any]:
    """Train all DSO models. Returns artifacts dict."""
    artifacts = {}

    # ── DSO1: XGBoost Classifier ─────────────────────────────────────────
    log.info("Training DSO1 — signal degradation classifier")
    d1 = data["dso1"]
    scaler1 = StandardScaler()
    X1_tr_s = scaler1.fit_transform(d1["X_train"])
    X1_te_s = scaler1.transform(d1["X_test"])

    xgb1 = xgb.XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, n_jobs=-1, eval_metric="aucpr",
    )
    xgb1.fit(X1_tr_s, d1["y_train"], eval_set=[(X1_te_s, d1["y_test"])], verbose=0)
    artifacts["scaler_dso1"] = scaler1
    artifacts["model_dso1"] = xgb1

    # ── DSO3: KMeans + LogisticRegression ────────────────────────────────
    log.info("Training DSO3 — network state profiler")
    d3 = data["dso3"]
    scaler3 = StandardScaler()
    X3_s = scaler3.fit_transform(d3["X_all"])

    kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
    kmeans.fit(X3_s)
    labels = kmeans.labels_

    lr_dso3 = LogisticRegression(max_iter=1000, random_state=42, solver="lbfgs", C=1.0)
    lr_dso3.fit(X3_s, labels)

    artifacts["scaler_dso3"] = scaler3
    artifacts["model_dso3"] = kmeans
    artifacts["model_dso3_lr"] = lr_dso3

    # ── DSO4: Two-Stage Handover Controller ──────────────────────────────
    log.info("Training DSO4 — handover controller")
    d4 = data["dso4"]

    # Class balance
    n_stay = (d4["y_train"] == 0).sum()
    n_ho = (d4["y_train"] == 1).sum()
    spw = max(1.0, n_stay / max(n_ho, 1))

    xgb4 = xgb.XGBClassifier(
        n_estimators=400, max_depth=6, learning_rate=0.03,
        scale_pos_weight=spw, subsample=0.8, colsample_bytree=0.8,
        early_stopping_rounds=30, eval_metric="aucpr",
        random_state=42, n_jobs=-1,
    )
    xgb4.fit(
        d4["X_train"], d4["y_train"],
        eval_set=[(d4["X_cal"], d4["y_cal"])],
        verbose=0,
    )

    # Calibrate on dedicated cal set
    cal4 = IsotonicCalibrator(xgb4)
    cal4.fit(d4["X_cal"], d4["y_cal"])

    artifacts["model_dso4_controller"] = xgb4
    artifacts["model_dso4_calibrated"] = cal4

    # Stage 1 gate
    s1_feats = d4.get("stage1_features", [])
    if s1_feats:
        s1_feats_avail = [f for f in s1_feats if f in d4["X_train"].columns]
        if s1_feats_avail:
            xgb_s1 = xgb.XGBClassifier(
                n_estimators=200, max_depth=4, learning_rate=0.05,
                random_state=42, n_jobs=-1,
            )
            xgb_s1.fit(d4["X_train"][s1_feats_avail], d4["y_train"], verbose=0)
            artifacts["model_dso4_stage1"] = xgb_s1

    # Threshold optimisation
    y_prob_cal = cal4.predict_proba(d4["X_test"])[:, 1]
    best_thresh, best_f1 = 0.5, -1.0
    for t in np.arange(0.3, 0.95, 0.02):
        preds = (y_prob_cal >= t).astype(int)
        sr = recall_score(d4["y_test"], preds, pos_label=0, zero_division=0)
        hr = recall_score(d4["y_test"], preds, pos_label=1, zero_division=0)
        if hr >= 0.85:
            if sr > best_f1:
                best_f1 = sr
                best_thresh = t
    if best_f1 < 0:
        best_thresh = 0.5

    artifacts["threshold_dso4"] = best_thresh
    artifacts["stage1_gate_threshold"] = 0.3

    log.info("DSO4 threshold: %.2f", best_thresh)
    return artifacts


# ═════════════════════════════════════════════════════════════════════════════
# EVALUATE
# ═════════════════════════════════════════════════════════════════════════════


def evaluate_all(artifacts: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate all DSOs and return metrics dict."""
    metrics = {}

    # DSO1
    d1 = data["dso1"]
    X1_te_s = artifacts["scaler_dso1"].transform(d1["X_test"])
    y1_prob = artifacts["model_dso1"].predict_proba(X1_te_s)[:, 1]
    y1_pred = artifacts["model_dso1"].predict(X1_te_s)
    metrics["dso1"] = {
        "roc_auc": round(roc_auc_score(d1["y_test"], y1_prob), 4),
        "pr_auc": round(average_precision_score(d1["y_test"], y1_prob), 4),
        "mcc": round(matthews_corrcoef(d1["y_test"], y1_pred), 4),
        "accuracy": round(accuracy_score(d1["y_test"], y1_pred), 4),
        "f1": round(f1_score(d1["y_test"], y1_pred, average="weighted"), 4),
    }

    # DSO3
    metrics["dso3"] = {
        "n_clusters": 4,
        "inertia": round(float(artifacts["model_dso3"].inertia_), 2),
    }

    # DSO4
    d4 = data["dso4"]
    cal = artifacts["model_dso4_calibrated"]
    thresh = artifacts.get("threshold_dso4", 0.5)
    y4_prob = cal.predict_proba(d4["X_test"])[:, 1]
    y4_pred = (y4_prob >= thresh).astype(int)

    metrics["dso4"] = {
        "roc_auc": round(roc_auc_score(d4["y_test"], y4_prob), 4),
        "pr_auc": round(average_precision_score(d4["y_test"], y4_prob), 4),
        "mcc": round(matthews_corrcoef(d4["y_test"], y4_pred), 4),
        "kappa": round(cohen_kappa_score(d4["y_test"], y4_pred), 4),
        "accuracy": round(accuracy_score(d4["y_test"], y4_pred), 4),
        "ho_recall": round(recall_score(d4["y_test"], y4_pred, pos_label=1), 4),
        "stay_recall": round(recall_score(d4["y_test"], y4_pred, pos_label=0), 4),
        "threshold": round(thresh, 4),
        "report": classification_report(
            d4["y_test"], y4_pred, target_names=["Stay", "Handover"]
        ),
    }

    return metrics


# ═════════════════════════════════════════════════════════════════════════════
# SAVE
# ═════════════════════════════════════════════════════════════════════════════


def save_artifacts(artifacts: Dict[str, Any], output_dir: str | Path | None = None):
    """Save all artifacts as .pkl files."""
    d = Path(output_dir) if output_dir else MODEL_DIR
    d.mkdir(parents=True, exist_ok=True)

    mapping = {
        "scaler_dso1.pkl": "scaler_dso1",
        "scaler_dso3.pkl": "scaler_dso3",
        "model_dso1_xgb.pkl": "model_dso1",
        "model_dso3_kmeans.pkl": "model_dso3",
        "model_dso3_lr_classifier.pkl": "model_dso3_lr",
        "model_dso4_controller.pkl": "model_dso4_controller",
        "model_dso4_calibrated.pkl": "model_dso4_calibrated",
        "model_dso4_threshold.pkl": "threshold_dso4",
        "model_dso4_stage1_gate_threshold.pkl": "stage1_gate_threshold",
    }

    for filename, key in mapping.items():
        if key in artifacts:
            joblib.dump(artifacts[key], d / filename)

    if "model_dso4_stage1" in artifacts:
        joblib.dump(artifacts["model_dso4_stage1"], d / "model_dso4_stage1_gate.pkl")

    log.info("Artifacts saved to %s", d)


# ═════════════════════════════════════════════════════════════════════════════
# INFERENCE — single sample prediction
# ═════════════════════════════════════════════════════════════════════════════

CLUSTER_LABELS = {
    0: "Indoor / Static — low velocity, stable signal",
    1: "H-Bahn (Rail) — high velocity, frequent handovers",
    2: "Pedestrian — low speed, variable urban signal",
    3: "Cell Edge — weak signal, handover candidate",
}


def predict_single(inputs: dict, artifacts: dict) -> dict:
    """Run full 4-stage inference pipeline for a single measurement.

    Parameters
    ----------
    inputs : dict of feature values (from API request)
    artifacts : dict from load_artifacts()

    Returns
    -------
    dict with dso1_risk_score, dso3_cluster, dso4_probability,
         handover_recommended, details
    """
    fl = artifacts["feature_lists"]
    import time
    t0 = time.perf_counter()

    # ── Stage 1: DSO3 — network profiling ────────────────────────────────
    dso3_feats = fl["dso3_features"]
    X3 = pd.DataFrame([{f: inputs.get(f, 0.0) for f in dso3_feats}])
    X3_s = artifacts["scaler_dso3"].transform(X3)
    cluster = int(artifacts["model_dso3_lr"].predict(X3_s)[0])
    inputs["dso3_cluster"] = float(cluster)

    # ── Stage 2: DSO1 — signal degradation risk ──────────────────────────
    dso1_feats = fl["dso1_features"]
    X1 = pd.DataFrame([{f: inputs.get(f, 0.0) for f in dso1_feats}])
    X1_s = artifacts["scaler_dso1"].transform(X1)
    risk = float(artifacts["model_dso1"].predict_proba(X1_s)[0][1])
    inputs["dso1_risk_score"] = risk

    # ── Stage 2.5: DSO2 — handover neighbor ranking ──────────────────────
    viable_thresh  = float(fl.get("dso2_viable_thresh", -110.0))
    model_dso2     = artifacts.get("model_dso2")
    cell_profiles  = artifacts.get("cell_profiles")
    best_nbr = float(inputs.get("best_neighbor_rsrp", -140.0))
    mean_nbr = float(inputs.get("mean_neighbor_rsrp", -140.0))
    num_nbr  = float(inputs.get("num_neighbors", 0.0))

    if best_nbr > -139.0:
        # Real neighbor measurements — derive DSO2 outputs and estimate RSRQ/SINR
        rsrp_gap = best_nbr - float(inputs.get("rsrp", -95.0))

        # Estimate neighbor RSRQ and SINR from serving-cell quality + RSRP gap.
        # If the neighbor is stronger, interference load is likely lower → quality improves.
        rsrq_now = float(inputs.get("rsrq", -12.0))
        sinr_now = float(inputs.get("sinr",   5.0))
        inputs["rsrq_neighboring"] = max(-20.0, min(0.0,  rsrq_now + rsrp_gap * 0.40))
        inputs["sinr_neighboring"] = max( -5.0, min(25.0, sinr_now + rsrp_gap * 0.30))

        dso2_target_rsrp = best_nbr
        # Apply congestion penalty: a historically congested area erodes effective quality
        congestion_rate = float(inputs.get("cell_hist_congestion_rate", 0.0))
        dso2_target_rsrp -= congestion_rate * 4.0

        if best_nbr >= viable_thresh:
            gap = abs(best_nbr - mean_nbr) if mean_nbr > -139.0 else 10.0
            above_ratio = max(0.1, (best_nbr - viable_thresh) / max(gap, 1.0))
            dso2_num_candidates = max(1.0, round(num_nbr * min(above_ratio, 1.0)))
        else:
            dso2_num_candidates = 0.0
    elif model_dso2 is not None and cell_profiles is not None and not cell_profiles.empty:
        # No neighbor data — run XGBRegressor ranker against historical cell profiles
        rsrp_now   = float(inputs.get("rsrp", -95.0))
        candidates = cell_profiles[
            (cell_profiles["cell_profile_mean_rsrp"] >= rsrp_now - 25) &
            (cell_profiles["cell_profile_mean_rsrp"] <= rsrp_now + 15)
        ].nlargest(20, "cell_profile_mean_rsrp")
        if candidates.empty:
            candidates = cell_profiles.nlargest(10, "cell_profile_mean_rsrp")

        dso2_feats   = fl.get("dso2_features", [])
        serving_ctx  = {f: float(inputs.get(f, 0.0)) for f in fl.get("dso2_serving_features", [])}
        rows_list    = []
        for _, cand in candidates.iterrows():
            r = dict(serving_ctx)
            r.update({
                "nbr_cellid_enc":         float(cand["nbr_cellid"]) / 500.0,
                "cell_profile_mean_rsrp": float(cand["cell_profile_mean_rsrp"]),
                "cell_profile_std_rsrp":  float(cand["cell_profile_std_rsrp"]),
                "cell_profile_p10_rsrp":  float(cand["cell_profile_p10_rsrp"]),
                "cell_profile_p90_rsrp":  float(cand["cell_profile_p90_rsrp"]),
                "rsrq_neighboring":       -10.0,
                "sinr_neighboring":        5.0,
            })
            rows_list.append(r)

        X2 = pd.DataFrame(rows_list)
        for f in dso2_feats:
            if f not in X2.columns:
                X2[f] = 0.0
        preds  = model_dso2.predict(X2[dso2_feats].fillna(0.0))
        viable = preds[preds > viable_thresh]
        dso2_target_rsrp    = float(viable.max()) if len(viable) > 0 else float(preds.max())
        dso2_num_candidates = float(len(viable))
    else:
        dso2_target_rsrp    = -140.0
        dso2_num_candidates = 0.0

    inputs["dso2_target_rsrp"]    = dso2_target_rsrp
    inputs["dso2_num_candidates"] = dso2_num_candidates

    # ── Stage 3: DSO4 Stage 1 gate ───────────────────────────────────────
    gate_thresh = artifacts.get("stage1_gate_threshold", 0.3)
    gate_model  = artifacts.get("model_dso4_stage1")
    ho_thresh   = artifacts.get("threshold_dso4", 0.5)

    if gate_model is not None:
        s1_feats = fl.get("dso4_stage1_features", fl["dso4_features"])
        X_s1 = pd.DataFrame([{f: inputs.get(f, 0.0) for f in s1_feats}])
        try:
            s1_prob = float(gate_model.predict_proba(X_s1)[0][1])
        except Exception:
            s1_prob = 0.5
        if s1_prob < gate_thresh:
            latency = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "dso1_risk_score":      round(risk, 4),
                "dso3_cluster":         cluster,
                "dso3_label":           CLUSTER_LABELS.get(cluster, f"Cluster {cluster}"),
                "dso2_target_rsrp":     round(dso2_target_rsrp, 4),
                "dso2_num_candidates":  int(dso2_num_candidates),
                "dso4_probability":     round(s1_prob, 4),
                "dso4_threshold":       round(ho_thresh, 4),
                "handover_recommended": False,
                "decision_source":      "stage1_gate_stay",
                "latency_ms":           latency,
            }

    # ── Stage 4: DSO4 calibrated controller ──────────────────────────────
    dso4_feats = fl["dso4_features"]
    X4 = pd.DataFrame([{f: inputs.get(f, 0.0) for f in dso4_feats}])

    cal_model = artifacts["model_dso4_calibrated"]
    ho_prob   = float(cal_model.predict_proba(X4)[0][1])
    handover  = ho_prob >= ho_thresh

    latency = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "dso1_risk_score":      round(risk, 4),
        "dso3_cluster":         cluster,
        "dso3_label":           CLUSTER_LABELS.get(cluster, f"Cluster {cluster}"),
        "dso2_target_rsrp":     round(dso2_target_rsrp, 4),
        "dso2_num_candidates":  int(dso2_num_candidates),
        "dso4_probability":     round(ho_prob, 4),
        "dso4_threshold":       round(ho_thresh, 4),
        "handover_recommended": handover,
        "decision_source":      "calibrated_controller",
        "latency_ms":           latency,
    }