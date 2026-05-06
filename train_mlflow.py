"""
train_mlflow.py — MLflow Experiment Tracking for v9 Pipeline
==============================================================
Logs parameters, metrics, and artifacts for every training run.

Usage:
    python train_mlflow.py                                    # standalone
    python main.py train --with-mlflow                        # via CLI
    make mlflow-train                                         # via Makefile

MLflow UI:
    make mlflow-ui    →  http://localhost:5000
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_model_manifest(model_dir: str, data_path: str, metrics: dict) -> Path:
    d = Path(model_dir)
    d.mkdir(parents=True, exist_ok=True)
    data_file = Path(data_path)
    feature_file = d / "model_feature_lists.json"
    artifact_files = sorted([p.name for p in d.glob("*.pkl")])

    manifest = {
        "created_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "git_commit": _git_commit(),
        "python_version": sys.version.split(" ")[0],
        "cwd": os.getcwd(),
        "data_path": str(data_file),
        "data_file_exists": data_file.exists(),
        "data_file_size_bytes": data_file.stat().st_size if data_file.exists() else None,
        "feature_list_path": str(feature_file),
        "feature_list_sha256": _sha256_file(feature_file) if feature_file.exists() else None,
        "artifact_files": artifact_files,
        "metrics_summary": {
            "dso1_roc_auc": metrics.get("dso1", {}).get("roc_auc"),
            "dso4_roc_auc": metrics.get("dso4", {}).get("roc_auc"),
            "dso4_mcc": metrics.get("dso4", {}).get("mcc"),
            "dso4_threshold": metrics.get("dso4", {}).get("threshold"),
        },
    }
    manifest_path = d / "model_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def run_with_mlflow(
    experiment_name: str = "5G-Handover-AI",
    run_name: str | None = None,
    data_path: str | None = None,
    artifacts: dict | None = None,
    data: dict | None = None,
    metrics: dict | None = None,
) -> str:
    """Execute the training pipeline with MLflow tracking.

    Can be called two ways:
    1. Standalone: pass data_path → trains from scratch
    2. From main.py: pass artifacts + data + metrics → logs existing results
    """
    import mlflow
    import mlflow.sklearn
    import mlflow.xgboost

    # Use local file backend inside mlruns directory to avoid SQLite schema conflicts
    Path("mlruns").mkdir(exist_ok=True)
    tracking_uri = os.getenv("MLFLOW_TRACKING_URI", "file:./mlruns")
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(experiment_name)
    path = data_path or "./DATASET/df_master_engineered.parquet"

    # If no pre-computed artifacts, train from scratch
    if artifacts is None:
        from src.model_pipeline import prepare_data, train_all, evaluate_all, save_artifacts

        log.info("Training from scratch with MLflow tracking...")
        data = prepare_data(parquet_path=path)

        t0 = time.time()
        artifacts = train_all(data)
        train_time = round(time.time() - t0, 1)

        metrics = evaluate_all(artifacts, data)
        save_artifacts(artifacts)
    else:
        train_time = 0.0

    with mlflow.start_run(run_name=run_name or f"v9-{int(time.time())}") as run:
        run_id = run.info.run_id
        log.info("MLflow run started: %s", run_id)

        # ── Tags ─────────────────────────────────────────────────────────
        mlflow.set_tag("git_commit", _git_commit())
        mlflow.set_tag("project", "5G-Handover-AI")
        mlflow.set_tag("pipeline_version", "9.0")

        # ── Parameters ───────────────────────────────────────────────────
        params = {
            "split_ratio": "70/10/20",
            "random_state": 42,
        }

        # Log XGBoost hyperparams if available
        if "model_dso1" in artifacts:
            m1 = artifacts["model_dso1"]
            if hasattr(m1, "n_estimators"):
                params.update({
                    "dso1_n_estimators": m1.n_estimators,
                    "dso1_max_depth": m1.max_depth,
                    "dso1_learning_rate": m1.learning_rate,
                })

        if "model_dso4_controller" in artifacts:
            m4 = artifacts["model_dso4_controller"]
            if hasattr(m4, "n_estimators"):
                params.update({
                    "dso4_n_estimators": m4.n_estimators,
                    "dso4_max_depth": m4.max_depth,
                    "dso4_learning_rate": m4.learning_rate,
                })

        params["dso4_threshold"] = artifacts.get("threshold_dso4", 0.5)
        mlflow.log_params(params)

        # ── Metrics ──────────────────────────────────────────────────────
        if train_time > 0:
            mlflow.log_metric("training_time_s", train_time)

        if metrics:
            flat_metrics = {}
            for dso, dso_metrics in metrics.items():
                for k, v in dso_metrics.items():
                    if isinstance(v, (int, float)):
                        flat_metrics[f"{dso}_{k}"] = v
            mlflow.log_metrics(flat_metrics)

        # ── Log models ───────────────────────────────────────────────────
        if "model_dso1" in artifacts:
            try:
                mlflow.xgboost.log_model(artifacts["model_dso1"], "model_dso1_xgb")
            except Exception:
                mlflow.sklearn.log_model(artifacts["model_dso1"], "model_dso1_xgb")

        if "model_dso4_controller" in artifacts:
            try:
                mlflow.xgboost.log_model(artifacts["model_dso4_controller"], "model_dso4_controller")
            except Exception:
                mlflow.sklearn.log_model(artifacts["model_dso4_controller"], "model_dso4_controller")

        if "model_dso3" in artifacts:
            mlflow.sklearn.log_model(artifacts["model_dso3"], "model_dso3_kmeans")

        # ── Log feature lists ────────────────────────────────────────────
        fl_path = Path("model_feature_lists.json")
        if fl_path.exists():
            mlflow.log_artifact(str(fl_path))

        manifest_path = write_model_manifest(".", path, metrics or {})
        mlflow.log_artifact(str(manifest_path))

        # ── Log metrics summary ──────────────────────────────────────────
        if metrics:
            metrics_clean = {k: {mk: mv for mk, mv in v.items() if mk != "report"}
                            for k, v in metrics.items()}
            mlflow.log_dict(metrics_clean, "metrics_summary.json")

        # ── Register DSO4 in Model Registry ──────────────────────────────
        model_uri = f"runs:/{run_id}/model_dso4_controller"
        try:
            result = mlflow.register_model(model_uri, "5G-DSO4-Controller")
            log.info("DSO4 registered as version %s", result.version)
            mlflow.set_tag("registered_model_version", result.version)
        except Exception as e:
            log.warning("Model registry: %s", e)

        # ── ELK logging ──────────────────────────────────────────────────
        try:
            from elk_logger import log_training_run
            log_training_run(run_id, metrics or {}, params)
        except Exception:
            pass

        # ── Summary ──────────────────────────────────────────────────────
        log.info("")
        log.info("╔════════════════════════════════════════════╗")
        log.info("║  MLflow Run Complete                       ║")
        log.info("║  Run ID: %-33s ║", run_id[:33])
        log.info("╠════════════════════════════════════════════╣")
        if metrics and "dso1" in metrics:
            log.info("║  DSO1  AUC=%.4f  MCC=%.4f            ║",
                     metrics["dso1"].get("roc_auc", 0), metrics["dso1"].get("mcc", 0))
        if metrics and "dso4" in metrics:
            log.info("║  DSO4  AUC=%.4f  MCC=%.4f            ║",
                     metrics["dso4"].get("roc_auc", 0), metrics["dso4"].get("mcc", 0))
            log.info("║  DSO4  HO-recall=%.1f%%  Stay-recall=%.1f%%  ║",
                     metrics["dso4"].get("ho_recall", 0) * 100,
                     metrics["dso4"].get("stay_recall", 0) * 100)
        log.info("╚════════════════════════════════════════════╝")

    return run_id


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train with MLflow tracking")
    parser.add_argument("--experiment", default="5G-Handover-AI")
    parser.add_argument("--run-name", default=None)
    parser.add_argument("--data-path", default=None)
    args = parser.parse_args()

    run_with_mlflow(
        experiment_name=args.experiment,
        run_name=args.run_name,
        data_path=args.data_path,
    )
