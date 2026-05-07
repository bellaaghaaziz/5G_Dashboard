"""
ci_train_synthetic.py — Lightweight CI training demo for MLflow tracking.

Used when the real dataset (DATASET/df_master_engineered.parquet) is not
available in the CI runner. Generates realistic synthetic 5G telemetry data,
trains XGBoost classifiers for DSO1 and DSO4, and logs a full MLflow run
so the tracking integration is verified end-to-end in CI.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import mlflow
import mlflow.sklearn
import mlflow.xgboost
import numpy as np
import xgboost as xgb
from sklearn.metrics import (
    accuracy_score,
    matthews_corrcoef,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")

RNG = np.random.default_rng(42)
N = 5_000  # synthetic rows


def _make_synthetic_data():
    """Generate synthetic 5G network telemetry with realistic distributions."""
    rsrp = RNG.normal(-85, 15, N).clip(-140, -44)
    rsrq = RNG.normal(-12, 5, N).clip(-20, -3)
    sinr = RNG.normal(10, 8, N).clip(-10, 30)
    speed = RNG.exponential(30, N).clip(0, 200)
    load = RNG.uniform(0.1, 0.95, N)
    neighbor_rsrp = rsrp + RNG.normal(5, 8, N)

    # DSO1: signal degrading when RSRP drops below −100 and SINR < 5
    deg_score = (-rsrp - 100) / 40 + (5 - sinr) / 15
    y_dso1 = (deg_score + RNG.normal(0, 0.3, N) > 0).astype(int)

    # DSO4: handover when neighbor cell is meaningfully better
    delta_rsrp = neighbor_rsrp - rsrp
    ho_score = (delta_rsrp - 3) / 10 + speed / 150 - load / 3
    y_dso4 = (ho_score + RNG.normal(0, 0.4, N) > 0).astype(int)

    features = np.column_stack([rsrp, rsrq, sinr, speed, load, neighbor_rsrp,
                                 delta_rsrp, rsrp ** 2, sinr * load, speed * delta_rsrp])
    feature_names = ["rsrp", "rsrq", "sinr", "ue_speed", "cell_load",
                     "neighbor_rsrp", "delta_rsrp", "rsrp_sq", "sinr_x_load",
                     "speed_x_delta"]
    return features, feature_names, y_dso1, y_dso4


def _train_xgb(X_tr, y_tr, **kwargs):
    model = xgb.XGBClassifier(
        n_estimators=80,
        max_depth=4,
        learning_rate=0.1,
        random_state=42,
        eval_metric="logloss",
        verbosity=0,
        **kwargs,
    )
    model.fit(X_tr, y_tr)
    return model


def run():
    tracking_uri = os.getenv("MLFLOW_TRACKING_URI", f"file:///{Path('mlruns').resolve()}")
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment("5G-Handover-AI")

    log.info("Generating synthetic 5G telemetry (%d rows)…", N)
    X, feat_names, y_dso1, y_dso4 = _make_synthetic_data()

    X_tr1, X_te1, y_tr1, y_te1 = train_test_split(X, y_dso1, test_size=0.2, random_state=42)
    X_tr4, X_te4, y_tr4, y_te4 = train_test_split(X, y_dso4, test_size=0.2, random_state=42)

    log.info("Training DSO1 (signal degradation classifier)…")
    t0 = time.time()
    m1 = _train_xgb(X_tr1, y_tr1)
    m4 = _train_xgb(X_tr4, y_tr4)
    train_time = round(time.time() - t0, 1)

    p1 = m1.predict_proba(X_te1)[:, 1]
    p4 = m4.predict_proba(X_te4)[:, 1]

    metrics = {
        "dso1_accuracy": round(accuracy_score(y_te1, m1.predict(X_te1)), 4),
        "dso1_roc_auc": round(roc_auc_score(y_te1, p1), 4),
        "dso1_mcc": round(matthews_corrcoef(y_te1, m1.predict(X_te1)), 4),
        "dso4_accuracy": round(accuracy_score(y_te4, m4.predict(X_te4)), 4),
        "dso4_roc_auc": round(roc_auc_score(y_te4, p4), 4),
        "dso4_mcc": round(matthews_corrcoef(y_te4, m4.predict(X_te4)), 4),
        "training_time_s": train_time,
        "n_samples": N,
        "data_source": 0,  # 0 = synthetic (CI), 1 = real
    }

    params = {
        "data_mode": "synthetic_ci",
        "n_samples": N,
        "n_features": X.shape[1],
        "split_ratio": "80/20",
        "random_state": 42,
        "dso1_n_estimators": m1.n_estimators,
        "dso1_max_depth": m1.max_depth,
        "dso4_n_estimators": m4.n_estimators,
        "dso4_max_depth": m4.max_depth,
    }

    with mlflow.start_run(run_name=f"ci-synthetic-{int(time.time())}") as run:
        mlflow.set_tag("project", "5G-Handover-AI")
        mlflow.set_tag("pipeline_version", "9.0")
        mlflow.set_tag("data_mode", "synthetic_ci")
        mlflow.set_tag("ci_run", "true")
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        mlflow.xgboost.log_model(m1, "model_dso1_xgb")
        mlflow.xgboost.log_model(m4, "model_dso4_controller")

        try:
            result = mlflow.register_model(f"runs:/{run.info.run_id}/model_dso4_controller",
                                           "5G-DSO4-Controller")
            mlflow.set_tag("registered_model_version", result.version)
            log.info("DSO4 registered as version %s", result.version)
        except Exception as e:
            log.warning("Model registry: %s", e)

        log.info("")
        log.info("╔══════════════════════════════════════════════╗")
        log.info("║  CI Synthetic MLflow Run Complete            ║")
        log.info("║  Run ID : %-33s ║", run.info.run_id[:33])
        log.info("╠══════════════════════════════════════════════╣")
        log.info("║  DSO1  AUC=%.4f  MCC=%.4f  ACC=%.4f  ║",
                 metrics["dso1_roc_auc"], metrics["dso1_mcc"], metrics["dso1_accuracy"])
        log.info("║  DSO4  AUC=%.4f  MCC=%.4f  ACC=%.4f  ║",
                 metrics["dso4_roc_auc"], metrics["dso4_mcc"], metrics["dso4_accuracy"])
        log.info("╚══════════════════════════════════════════════╝")

    return run.info.run_id


if __name__ == "__main__":
    run()
