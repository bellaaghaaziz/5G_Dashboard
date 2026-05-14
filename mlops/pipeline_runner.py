"""
pipeline_runner.py — One-command end-to-end MLOps pipeline
==========================================================
What it does:
  1) Validate data (schema + null checks)
  2) Train challenger models (DSO1/DSO3/DSO4)
  3) Evaluate challenger metrics
  4) Absolute quality gate (fail if below floor thresholds)
  5) Champion/Challenger comparison — promote ONLY if challenger beats champion
  6) Persist artifacts + metrics.json
  7) Log to MLflow + register model
  8) Promote the registered model to Production

Run:
  python -m mlops.pipeline_runner --data-path DATASET/df_master_engineered.parquet --with-mlflow --promote
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys
from pathlib import Path


# ── helpers ───────────────────────────────────────────────────────────────────

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
        git_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        git_commit = "unknown"

    manifest = {
        "trained_at": datetime.datetime.utcnow().isoformat(),
        "timestamp_utc": datetime.datetime.utcnow().isoformat(),
        "git_commit": git_commit,
        "run_id": run_id,
        "metrics_summary": _flatten_metrics(metrics),
        "artifacts": [
            "model_dso1_xgb.pkl",
            "model_dso3_kmeans.pkl",
            "model_dso3_lr_classifier.pkl",
            "model_dso4_calibrated.pkl",
            "model_dso4_controller.pkl",
            "model_dso4_threshold.pkl",
            "scaler_dso1.pkl",
            "scaler_dso3.pkl",
            "model_feature_lists.json",
        ],
    }
    Path(output_dir).joinpath("model_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )


def _gate(metrics: dict, *, min_dso4_auc: float, min_dso4_mcc: float) -> tuple[bool, str]:
    """Absolute floor gate — challenger must exceed minimum thresholds."""
    dso4 = metrics.get("dso4") or {}
    auc = float(dso4.get("roc_auc", 0))
    mcc = float(dso4.get("mcc", 0))
    ok = (auc >= min_dso4_auc) and (mcc >= min_dso4_mcc)
    msg = (
        f"AbsoluteGate: DSO4 AUC={auc:.4f} (min {min_dso4_auc:.4f}), "
        f"MCC={mcc:.4f} (min {min_dso4_mcc:.4f})"
    )
    return ok, msg


def _load_champion_metrics(path: str | None) -> dict | None:
    """Load the current production model's metrics for champion/challenger comparison."""
    candidates = []
    if path:
        candidates.append(Path(path))
    # Auto-detect common locations
    candidates += [
        Path("metrics.json"),
        Path("logs/metrics.json"),
        Path("/app/metrics.json"),
        Path("/app/logs/metrics.json"),
    ]
    for p in candidates:
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
    return None


def _champion_challenger(challenger: dict, champion: dict) -> tuple[bool, str]:
    """
    Compare challenger vs champion on DSO4 ROC-AUC and MCC.
    Challenger wins if it improves EITHER metric without regressing the other by >2%.
    Returns (should_promote, reason_message).
    """
    ch4 = challenger.get("dso4") or {}
    cp4 = champion.get("dso4") or {}

    ch_auc = float(ch4.get("roc_auc", 0))
    cp_auc = float(cp4.get("roc_auc", 0))
    ch_mcc = float(ch4.get("mcc", 0))
    cp_mcc = float(cp4.get("mcc", 0))
    ch_ho  = float(ch4.get("ho_recall", 0))
    cp_ho  = float(cp4.get("ho_recall", 0))

    delta_auc = ch_auc - cp_auc
    delta_mcc = ch_mcc - cp_mcc
    delta_ho  = ch_ho  - cp_ho

    TOLERANCE = 0.02   # allow up to 2% regression on one metric if the other improves

    auc_wins  = delta_auc >  0.001
    mcc_wins  = delta_mcc >  0.001
    auc_ok    = delta_auc > -TOLERANCE
    mcc_ok    = delta_mcc > -TOLERANCE

    promotes = (auc_wins and mcc_ok) or (mcc_wins and auc_ok)

    reason = (
        f"Champion→Challenger: "
        f"AUC {cp_auc:.4f}→{ch_auc:.4f} (Δ{delta_auc:+.4f}), "
        f"MCC {cp_mcc:.4f}→{ch_mcc:.4f} (Δ{delta_mcc:+.4f}), "
        f"HO_recall {cp_ho:.4f}→{ch_ho:.4f} (Δ{delta_ho:+.4f}) "
        f"→ {'PROMOTE' if promotes else 'REJECT'}"
    )
    return promotes, reason


# ── main ──────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    parser = argparse.ArgumentParser(description="CellPilot — End-to-End MLOps Pipeline Runner")
    parser.add_argument("--data-path", default="DATASET/df_master_engineered.parquet")
    parser.add_argument("--model-dir", default=".")
    parser.add_argument("--with-mlflow", action="store_true")
    parser.add_argument("--promote", action="store_true",
                        help="Promote to Production only if challenger beats champion.")
    parser.add_argument("--require-promotion", action="store_true",
                        help="Fail pipeline if promotion does not succeed.")
    parser.add_argument("--mlflow-experiment", default="5G-Handover-AI")
    parser.add_argument("--mlflow-model-name", default="5G-DSO4-Controller")
    parser.add_argument("--min-dso4-auc", type=float, default=0.75,
                        help="Absolute floor for DSO4 ROC-AUC (default 0.75).")
    parser.add_argument("--min-dso4-mcc", type=float, default=0.50,
                        help="Absolute floor for DSO4 MCC (default 0.50).")
    parser.add_argument("--champion-metrics-path", default=None,
                        help="Path to current production metrics.json for champion/challenger comparison.")
    parser.add_argument("--skip-champion-check", action="store_true",
                        help="Skip champion/challenger comparison (always promote if quality gate passes).")
    args = parser.parse_args(argv)

    # ── path setup ────────────────────────────────────────────────────────────
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from mlops.data_validation import validate_dataset   # type: ignore
    from src.model_pipeline import prepare_data, train_all, evaluate_all, save_artifacts  # type: ignore

    # ── 1. Data validation ────────────────────────────────────────────────────
    fl_path = Path(args.model_dir) / "model_feature_lists.json"
    feature_lists = json.loads(fl_path.read_text(encoding="utf-8"))
    required_cols = set(
        feature_lists.get("dso1_features", []) + feature_lists.get("dso4_features", [])
    )
    required_cols.update(["target_is_degrading", "target_ho_flag"])

    vr = validate_dataset(args.data_path, required_cols)
    if not vr.ok:
        print("[FAIL] Data validation failed")
        print(f"  rows={vr.rows} cols={vr.cols}")
        if vr.missing_required:
            miss = vr.missing_required[:20]
            suffix = "..." if len(vr.missing_required) > 20 else ""
            print(f"  missing_required={miss}{suffix}")
        bad_nulls = {k: v for k, v in vr.null_rate_required.items() if v > 0.30}
        if bad_nulls:
            print(f"  high_null_rate_required={list(bad_nulls.items())[:10]}")
        return 2

    print(f"[OK] Data validation passed ({vr.rows} rows, {vr.cols} cols)")

    # ── 2. Train challenger ───────────────────────────────────────────────────
    print("[INFO] Training challenger models …")
    data = prepare_data(parquet_path=args.data_path)
    artifacts = train_all(data)
    metrics = evaluate_all(artifacts, data)

    dso4 = metrics.get("dso4", {})
    print(
        f"[INFO] Challenger: DSO4 AUC={dso4.get('roc_auc'):.4f} "
        f"MCC={dso4.get('mcc'):.4f} "
        f"HO_recall={dso4.get('ho_recall'):.4f}"
    )

    # ── 3. Absolute quality gate ──────────────────────────────────────────────
    ok, msg = _gate(metrics, min_dso4_auc=args.min_dso4_auc, min_dso4_mcc=args.min_dso4_mcc)
    print(msg)
    if not ok:
        print("[FAIL] Absolute quality gate failed — aborting.")
        return 3

    # ── 4. Champion / Challenger comparison ───────────────────────────────────
    champion_metrics = None
    if not args.skip_champion_check:
        champion_metrics = _load_champion_metrics(args.champion_metrics_path)

    if champion_metrics and not args.skip_champion_check:
        promotes, cc_reason = _champion_challenger(metrics, champion_metrics)
        print(cc_reason)
        if not promotes:
            print("[FAIL] Challenger does not beat champion — NOT promoting.")
            print("[INFO] Saving challenger artifacts for audit (not replacing production).")
            # Save to a staging directory so we can audit without overwriting production
            staging = Path(args.model_dir) / "staging"
            staging.mkdir(exist_ok=True)
            save_artifacts(artifacts, output_dir=staging)
            metrics_clean = {
                k: {mk: mv for mk, mv in v.items() if mk != "report"}
                for k, v in metrics.items()
            }
            (staging / "metrics.json").write_text(json.dumps(metrics_clean, indent=2))
            _write_model_manifest(str(staging), metrics)
            return 5
    else:
        cc_reason = "No champion on file — first deployment, promoting unconditionally."
        print(f"[INFO] {cc_reason}")

    # ── 5. Save artifacts (challenger wins → becomes new production) ──────────
    save_artifacts(artifacts, output_dir=args.model_dir)
    metrics_clean = {
        k: {mk: mv for mk, mv in v.items() if mk != "report"}
        for k, v in metrics.items()
    }
    metrics_path = Path(args.model_dir) / "metrics.json"
    metrics_path.write_text(json.dumps(metrics_clean, indent=2), encoding="utf-8")

    # Also write to logs/ so the dashboard-service can read it
    logs_dir = Path(args.model_dir) / "logs"
    logs_dir.mkdir(exist_ok=True)
    (logs_dir / "metrics.json").write_text(json.dumps(metrics_clean, indent=2), encoding="utf-8")

    # ── 6. MLflow logging ─────────────────────────────────────────────────────
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

        try:
            import mlflow
            client = mlflow.tracking.MlflowClient()
            run = client.get_run(run_id)
            registered_version = run.data.tags.get("registered_model_version")
        except Exception:
            registered_version = None

    _write_model_manifest(output_dir=args.model_dir, metrics=metrics, run_id=run_id)
    print(f"[OK] Saved artifacts + metrics to {args.model_dir}")

    # ── 7. Reset drift baseline to new training distribution ─────────────────
    try:
        from src.drift_detector import get_drift_detector  # type: ignore
        dd = get_drift_detector()
        dd.set_baseline_from_dataframe(data["df"])
        # reset_windows only exists in newer version of drift_detector
        if hasattr(dd, "reset_windows"):
            dd.reset_windows()
        print("[OK] Drift baseline reset to new training distribution")
    except Exception as e:
        print(f"[WARN] Could not reset drift baseline: {e}")

    # ── 8. MLflow promotion ───────────────────────────────────────────────────
    promotion_succeeded = False
    if args.promote and args.with_mlflow:
        try:
            import mlflow
            client = mlflow.tracking.MlflowClient()
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
                print(
                    f"[OK] DSO4 registered as version {registered_version} "
                    f"→ Production"
                )
                promotion_succeeded = True
            else:
                print("[WARN] Could not determine model version to promote.")
        except Exception as e:
            print(f"[WARN] MLflow promotion failed (non-fatal): {e}")

    if args.promote and args.require_promotion and not promotion_succeeded:
        print("[FAIL] Promotion was required but did not succeed.")
        return 4

    print(f"[OK] Pipeline completed. {cc_reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
