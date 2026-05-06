"""
pipeline_runner.py — One-command end-to-end MLOps pipeline
==========================================================
What it does:
  1) Validate data (schema + null checks)
  2) Train models (DSO1/DSO3/DSO4)
  3) Evaluate metrics
  4) Quality gate (fail if below thresholds)
  5) Persist artifacts + metrics.json
  6) Log to MLflow + register model
  7) (Optional) Promote the registered model to Production

Run:
  python -m mlops.pipeline_runner --data-path DATASET/df_master_engineered.parquet --with-mlflow --promote
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


import datetime
import subprocess

def _flatten_metrics(metrics: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for dso, dso_metrics in metrics.items():
        if not isinstance(dso_metrics, dict):
            continue
        for k, v in dso_metrics.items():
            if isinstance(v, (int, float)):
                out[f"{dso}.{k}"] = float(v)
    return out


def _write_model_manifest(output_dir: str, metrics: dict, run_id: str | None = None) -> None:
    try:
        git_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        git_commit = "unknown"

    manifest = {
        "timestamp_utc": datetime.datetime.utcnow().isoformat(),
        "git_commit": git_commit,
        "run_id": run_id,
        "metrics_summary": _flatten_metrics(metrics),
        "artifacts": [
            "model_dso1.joblib",
            "model_dso3.joblib",
            "model_dso4.joblib",
            "model_dso3_scaler.joblib",
            "model_feature_lists.json",
        ]
    }
    Path(output_dir).joinpath("model_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _gate(metrics: dict, *, min_dso4_auc: float, min_dso4_mcc: float) -> tuple[bool, str]:
    dso4 = metrics.get("dso4") or {}
    auc = float(dso4.get("roc_auc", 0))
    mcc = float(dso4.get("mcc", 0))
    ok = (auc >= min_dso4_auc) and (mcc >= min_dso4_mcc)
    msg = f"Gate: DSO4 AUC={auc:.4f} (min {min_dso4_auc:.4f}), MCC={mcc:.4f} (min {min_dso4_mcc:.4f})"
    return ok, msg


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(description="CellPilot — End-to-End MLOps Pipeline Runner")
    parser.add_argument("--data-path", default="DATASET/df_master_engineered.parquet")
    parser.add_argument("--model-dir", default=".")
    parser.add_argument("--with-mlflow", action="store_true")
    parser.add_argument("--promote", action="store_true", help="Promote registered model to Production (best-effort).")
    parser.add_argument(
        "--require-promotion",
        action="store_true",
        help="Fail pipeline if promotion to Production does not succeed.",
    )
    parser.add_argument("--mlflow-experiment", default="5G-Handover-AI")
    parser.add_argument("--mlflow-model-name", default="5G-DSO4-Controller")
    parser.add_argument("--min-dso4-auc", type=float, default=0.90)
    parser.add_argument("--min-dso4-mcc", type=float, default=0.70)
    args = parser.parse_args(argv)

    # Import ML pipeline (repo root style)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from mlops.data_validation import validate_dataset  # type: ignore
    from src.model_pipeline import prepare_data, train_all, evaluate_all, save_artifacts  # type: ignore

    # Build “required columns” from feature-lists + targets
    fl_path = Path(args.model_dir) / "model_feature_lists.json"
    feature_lists = json.loads(fl_path.read_text(encoding="utf-8"))
    required_cols = set(feature_lists.get("dso1_features", []) + feature_lists.get("dso4_features", []))
    required_cols.update(["target_is_degrading", "target_ho_flag"])

    vr = validate_dataset(args.data_path, required_cols)
    if not vr.ok:
        print("[FAIL] Data validation failed")
        print(f"  rows={vr.rows} cols={vr.cols}")
        if vr.missing_required:
            print(f"  missing_required={vr.missing_required[:20]}{'...' if len(vr.missing_required) > 20 else ''}")
        bad_nulls = {k: v for k, v in vr.null_rate_required.items() if v > 0.30}
        if bad_nulls:
            print(f"  high_null_rate_required={list(bad_nulls.items())[:10]}")
        return 2

    print(f"[OK] Data validation ok ({vr.rows} rows, {vr.cols} cols)")

    data = prepare_data(parquet_path=args.data_path)
    artifacts = train_all(data)
    metrics = evaluate_all(artifacts, data)

    ok, msg = _gate(metrics, min_dso4_auc=args.min_dso4_auc, min_dso4_mcc=args.min_dso4_mcc)
    print(msg)

    # Save artifacts + metrics.json (always)
    save_artifacts(artifacts, output_dir=args.model_dir)
    metrics_path = Path(args.model_dir) / "metrics.json"
    metrics_clean = {k: {mk: mv for mk, mv in v.items() if mk != "report"} for k, v in metrics.items()}
    metrics_path.write_text(json.dumps(metrics_clean, indent=2), encoding="utf-8")
    
    # Log to MLflow (best-effort)
    registered_version: str | None = None
    run_id: str | None = None
    if args.with_mlflow:
        from mlops.train_mlflow import run_with_mlflow  # type: ignore

        run_id = run_with_mlflow(
            experiment_name=args.mlflow_experiment,
            artifacts=artifacts,
            data=data,
            metrics=metrics,
        )
        print(f"[OK] MLflow run: {run_id}")

        # Try to discover the registered version from MLflow tags (best-effort)
        try:
            import mlflow

            client = mlflow.tracking.MlflowClient()
            run = client.get_run(run_id)
            registered_version = run.data.tags.get("registered_model_version")
        except Exception:
            registered_version = None

    _write_model_manifest(output_dir=args.model_dir, metrics=metrics, run_id=run_id)
    print(f"[OK] Saved artifacts, metrics, and manifest to {args.model_dir}")

    # Reset drift baseline
    try:
        from src.drift_detector import get_drift_detector
        get_drift_detector().set_baseline_from_dataframe(data)
        get_drift_detector().reset_windows()
        print("[OK] Reset data drift baseline and sliding windows")
    except Exception as e:
        print(f"[WARN] Could not reset drift baseline: {e}")

    if not ok:
        print("[FAIL] Quality gate failed — not promoting model.")
        return 3

    promotion_succeeded = False
    if args.promote and args.with_mlflow:
        try:
            import mlflow

            client = mlflow.tracking.MlflowClient()
            # If we don't have version, pick latest version for the model name.
            if registered_version is None:
                latest = client.get_latest_versions(args.mlflow_model_name)
                if latest:
                    registered_version = str(max(int(v.version) for v in latest))

            if registered_version is not None:
                client.transition_model_version_stage(
                    name=args.mlflow_model_name,
                    version=registered_version,
                    stage="Production",
                    archive_existing_versions=True,
                )
                print(f"[OK] Promoted {args.mlflow_model_name} v{registered_version} -> Production")
                promotion_succeeded = True
            else:
                print("[WARN] Could not determine model version to promote.")
        except Exception as e:
            print(f"[WARN] Promotion failed (non-fatal): {e}")
    if args.promote and args.require_promotion and not promotion_succeeded:
        print("[FAIL] Promotion was required but did not succeed.")
        return 4

    print("[OK] Pipeline completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

