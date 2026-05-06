"""
training_manager.py — In-App Model Retraining Manager
=======================================================
Runs the full DSO pipeline training in a background thread,
tracks progress, and compares old vs new metrics.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

log = logging.getLogger(__name__)

METRICS_PATH = Path("metrics.json")

# Shared state
_training_state = {
    "status": "idle",          # idle | running | completed | failed
    "step": "",
    "progress": 0,
    "started_at": None,
    "completed_at": None,
    "old_metrics": None,
    "new_metrics": None,
    "error": None,
}
_lock = threading.Lock()


def get_training_status() -> dict:
    with _lock:
        return dict(_training_state)


def _read_metrics() -> dict:
    if METRICS_PATH.exists():
        try:
            return json.loads(METRICS_PATH.read_text())
        except Exception:
            pass
    return {}


def _update(step: str, progress: int, **kwargs):
    with _lock:
        _training_state["step"] = step
        _training_state["progress"] = progress
        for k, v in kwargs.items():
            _training_state[k] = v
    log.info("[TrainManager] %s (%d%%)", step, progress)


def _run_training():
    """Execute the full training pipeline in this thread."""
    try:
        _update("Loading dataset", 5, status="running")

        import pandas as pd
        import numpy as np
        from pathlib import Path as P

        dataset_path = P("DATASET/df_master_engineered.parquet")
        if not dataset_path.exists():
            _update("Failed — dataset not found", 0, status="failed",
                    error="Dataset file not found")
            return

        df = pd.read_parquet(dataset_path)
        _update("Dataset loaded (%d rows)" % len(df), 10)

        # Save old metrics
        old_metrics = _read_metrics()
        with _lock:
            _training_state["old_metrics"] = old_metrics

        # ── DSO3: KMeans clustering ──
        _update("Training DSO3 (Network Clustering)", 20)
        time.sleep(1)  # Small delay for UI visibility

        from src.model_pipeline import load_artifacts
        import joblib

        # We'll do a lightweight re-fit of the models
        # DSO3 - KMeans
        feature_lists = json.loads(P("model_feature_lists.json").read_text())
        dso3_features = feature_lists.get("dso3_features", [])

        if dso3_features:
            from sklearn.preprocessing import StandardScaler
            from sklearn.cluster import KMeans
            from sklearn.linear_model import LogisticRegression

            X3 = df[[f for f in dso3_features if f in df.columns]].fillna(0).values
            scaler3 = StandardScaler().fit(X3)
            X3s = scaler3.transform(X3)

            k = 4
            kmeans = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X3s)
            clusters = kmeans.labels_

            # LR classifier on cluster labels
            lr = LogisticRegression(max_iter=500, random_state=42).fit(X3s, clusters)

            joblib.dump(scaler3, "scaler_dso3.pkl")
            joblib.dump(kmeans, "model_dso3_kmeans.pkl")
            joblib.dump(lr, "model_dso3_lr_classifier.pkl")
            _update("DSO3 trained (K=%d)" % k, 35)

        # ── DSO1: Signal Risk ──
        _update("Training DSO1 (Signal Risk)", 40)
        time.sleep(1)

        dso1_features = feature_lists.get("dso1_features", [])
        if dso1_features and "is_ho" in df.columns:
            from sklearn.preprocessing import StandardScaler
            from xgboost import XGBClassifier
            from sklearn.metrics import roc_auc_score, matthews_corrcoef
            from sklearn.linear_model import LogisticRegression

            avail_feats = [f for f in dso1_features if f in df.columns]
            X1 = df[avail_feats].fillna(0).values
            y1 = (df["is_ho"].fillna(0).values > 0).astype(int)

            scaler1 = StandardScaler().fit(X1)
            X1s = scaler1.transform(X1)

            try:
                xgb1 = XGBClassifier(
                    n_estimators=200, max_depth=6, learning_rate=0.1,
                    objective="binary:logistic",
                    use_label_encoder=False, eval_metric="logloss", random_state=42
                )
                xgb1.fit(X1s, y1)
                model_dso1 = xgb1
            except Exception as e:
                log.warning("DSO1 XGB training failed, falling back to LogisticRegression: %s", e)
                model_dso1 = LogisticRegression(max_iter=1000, random_state=42)
                model_dso1.fit(X1s, y1)

            y1_prob = model_dso1.predict_proba(X1s)[:, 1]
            dso1_auc = float(roc_auc_score(y1, y1_prob))

            joblib.dump(scaler1, "scaler_dso1.pkl")
            joblib.dump(model_dso1, "model_dso1_xgb.pkl")
            _update("DSO1 trained (AUC=%.4f)" % dso1_auc, 55)
        else:
            dso1_auc = old_metrics.get("dso1", {}).get("roc_auc", 0)

        # ── DSO4: Handover Decision ──
        _update("Training DSO4 (Handover Decision)", 60)
        time.sleep(1)

        dso4_features = feature_lists.get("dso4_features", [])
        if dso4_features and "is_ho" in df.columns:
            from xgboost import XGBClassifier
            from sklearn.metrics import roc_auc_score, matthews_corrcoef
            from sklearn.model_selection import train_test_split
            from src.calibration import IsotonicCalibrator
            from sklearn.linear_model import LogisticRegression

            avail_feats = [f for f in dso4_features if f in df.columns]
            X4 = df[avail_feats].fillna(0).values
            y4 = (df["is_ho"].fillna(0).values > 0).astype(int)

            X_train, X_val, y_train, y_val = train_test_split(
                X4, y4, test_size=0.2, random_state=42, stratify=y4
            )

            try:
                xgb4 = XGBClassifier(
                    n_estimators=300, max_depth=7, learning_rate=0.1,
                    objective="binary:logistic",
                    use_label_encoder=False, eval_metric="logloss", random_state=42
                )
                xgb4.fit(X_train, y_train)
                # Calibrate with project-compatible wrapper
                cal4 = IsotonicCalibrator(xgb4)
                cal4.fit(X_val, y_val)
                model_dso4 = xgb4
            except Exception as e:
                log.warning("DSO4 XGB training failed, falling back to LogisticRegression: %s", e)
                model_dso4 = LogisticRegression(max_iter=1200, random_state=42)
                model_dso4.fit(X_train, y_train)
                cal4 = IsotonicCalibrator(model_dso4)
                cal4.fit(X_val, y_val)

            y4_prob = cal4.predict_proba(X_val)[:, 1]
            dso4_auc = float(roc_auc_score(y_val, y4_prob))

            # Optimal threshold
            from sklearn.metrics import precision_recall_curve
            prec, rec, thresholds = precision_recall_curve(y_val, y4_prob)
            f1_scores = 2 * prec * rec / (prec + rec + 1e-8)
            best_idx = int(np.argmax(f1_scores))
            threshold = float(thresholds[min(best_idx, len(thresholds) - 1)])

            y4_pred = (y4_prob >= threshold).astype(int)
            dso4_mcc = float(matthews_corrcoef(y_val, y4_pred))

            joblib.dump(model_dso4, "model_dso4_controller.pkl")
            joblib.dump(cal4, "model_dso4_calibrated.pkl")
            joblib.dump(threshold, "model_dso4_threshold.pkl")

            _update("DSO4 trained (AUC=%.4f, MCC=%.4f)" % (dso4_auc, dso4_mcc), 80)
        else:
            dso4_auc = old_metrics.get("dso4", {}).get("roc_auc", 0)
            dso4_mcc = old_metrics.get("dso4", {}).get("mcc", 0)
            threshold = old_metrics.get("dso4", {}).get("threshold", 0.5)

        # ── Save metrics ──
        _update("Saving metrics", 90)
        new_metrics = {
            "dso1": {"roc_auc": round(dso1_auc, 4)},
            "dso3": {"n_clusters": 4},
            "dso4": {
                "roc_auc": round(dso4_auc, 4),
                "mcc": round(dso4_mcc, 4),
                "threshold": round(threshold, 4),
            },
        }
        METRICS_PATH.write_text(json.dumps(new_metrics, indent=2))

        # ── Update drift baseline ──
        _update("Updating drift baseline", 95)
        try:
            from src.drift_detector import get_drift_detector
            get_drift_detector().set_baseline_from_dataframe(df)
        except Exception as e:
            log.warning("Could not update drift baseline: %s", e)

        # ── Reload models ──
        import src.model_pipeline as mp
        mp._artifacts = None  # Force reload on next prediction

        _update("Training complete", 100,
                status="completed",
                completed_at=time.time(),
                new_metrics=new_metrics)

    except Exception as e:
        log.exception("Training failed")
        _update("Training failed: %s" % str(e)[:200], 0,
                status="failed", error=str(e)[:500])


def start_training() -> dict:
    """Start training in a background thread. Returns immediately."""
    with _lock:
        if _training_state["status"] == "running":
            return {"error": "Training already in progress", **_training_state}

        _training_state.update({
            "status": "running",
            "step": "Initializing",
            "progress": 0,
            "started_at": time.time(),
            "completed_at": None,
            "old_metrics": None,
            "new_metrics": None,
            "error": None,
        })

    thread = threading.Thread(target=_run_training, daemon=True)
    thread.start()

    return get_training_status()
