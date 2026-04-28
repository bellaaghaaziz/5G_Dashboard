"""
main.py — 5G Handover AI: CLI Entry Point
===========================================
Runs the v9 training pipeline from the command line.

Usage:
    python main.py train                    # full training pipeline
    python main.py train --with-mlflow      # train + log to MLflow
    python main.py evaluate                 # load saved models + evaluate
    make train                              # equivalent
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# ── Logging setup ────────────────────────────────────────────────────────────
Path("logs").mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/pipeline.log", mode="a", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


def banner(title: str) -> None:
    line = "─" * 60
    log.info(line)
    log.info("  %s", title)
    log.info(line)


def cmd_train(args: argparse.Namespace) -> None:
    """Full training pipeline: prepare → train → evaluate → save."""
    from src.model_pipeline import prepare_data, train_all, evaluate_all, save_artifacts

    start = time.time()
    banner("5G Handover AI — Training Pipeline (v9)")

    # Step 1: Prepare data
    banner("Step 1 — prepare_data()")
    data = prepare_data(parquet_path=args.data_path)
    log.info("DSO1 train/test: %d / %d", len(data["dso1"]["X_train"]), len(data["dso1"]["X_test"]))
    log.info("DSO3 rows:       %d", len(data["dso3"]["X_all"]))
    log.info("DSO4 train/cal/test: %d / %d / %d",
             len(data["dso4"]["X_train"]), len(data["dso4"]["X_cal"]), len(data["dso4"]["X_test"]))

    # Step 2: Train
    banner("Step 2 — train_all()")
    t0 = time.time()
    artifacts = train_all(data)
    log.info("Training complete in %.1f s", time.time() - t0)

    # Step 3: Evaluate
    banner("Step 3 — evaluate_all()")
    metrics = evaluate_all(artifacts, data)

    log.info("")
    log.info("=" * 50)
    log.info("          EVALUATION RESULTS")
    log.info("=" * 50)
    log.info("  DSO1  AUC=%.4f  MCC=%.4f", metrics["dso1"]["roc_auc"], metrics["dso1"]["mcc"])
    log.info("  DSO3  k=4  inertia=%.0f", metrics["dso3"]["inertia"])
    log.info("  DSO4  AUC=%.4f  MCC=%.4f  HO-recall=%.1f%%  Stay-recall=%.1f%%",
             metrics["dso4"]["roc_auc"], metrics["dso4"]["mcc"],
             metrics["dso4"]["ho_recall"] * 100, metrics["dso4"]["stay_recall"] * 100)
    log.info("  DSO4  threshold=%.2f", metrics["dso4"]["threshold"])
    log.info("=" * 50)

    if metrics["dso4"].get("report"):
        log.info("\n%s", metrics["dso4"]["report"])

    # Step 4: Save
    banner("Step 4 — save_artifacts()")
    save_artifacts(artifacts, output_dir=args.model_dir)

    # Save metrics JSON
    metrics_path = Path(args.model_dir) / "metrics.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_clean = {k: {mk: mv for mk, mv in v.items() if mk != "report"} for k, v in metrics.items()}
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_clean, f, indent=2)
    log.info("Metrics saved to %s", metrics_path)

    # Step 5: MLflow (optional)
    if args.with_mlflow:
        banner("Step 5 — MLflow tracking")
        try:
            from train_mlflow import run_with_mlflow
            run_with_mlflow(artifacts=artifacts, data=data, metrics=metrics)
        except Exception as e:
            log.warning("MLflow logging failed: %s", e)

    banner(f"Pipeline finished in {time.time() - start:.1f}s")


def cmd_evaluate(args: argparse.Namespace) -> None:
    """Load saved models and run evaluation."""
    from src.model_pipeline import load_artifacts, prepare_data, evaluate_all

    banner("5G Handover AI — Evaluate Saved Models")

    data = prepare_data(parquet_path=args.data_path)
    artifacts = load_artifacts(model_dir=args.model_dir)
    metrics = evaluate_all(artifacts, data)

    log.info("=" * 50)
    log.info("  DSO1  AUC=%.4f", metrics["dso1"]["roc_auc"])
    log.info("  DSO4  AUC=%.4f  MCC=%.4f", metrics["dso4"]["roc_auc"], metrics["dso4"]["mcc"])
    log.info("=" * 50)

    if metrics["dso4"].get("report"):
        log.info("\n%s", metrics["dso4"]["report"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="5G Handover AI — MLOps Pipeline")
    sub = parser.add_subparsers(dest="command")

    # train
    p_train = sub.add_parser("train", help="Full training pipeline")
    p_train.add_argument("--data-path", default="./DATASET/df_master_engineered.parquet")
    p_train.add_argument("--model-dir", default=".")
    p_train.add_argument("--with-mlflow", action="store_true", help="Log to MLflow")

    # evaluate
    p_eval = sub.add_parser("evaluate", help="Evaluate saved models")
    p_eval.add_argument("--data-path", default="./DATASET/df_master_engineered.parquet")
    p_eval.add_argument("--model-dir", default=".")

    args = parser.parse_args()
    if args.command == "train":
        cmd_train(args)
    elif args.command == "evaluate":
        cmd_evaluate(args)
    else:
        parser.print_help()