"""
drift_detector.py — Data Drift Detection
==========================================
Monitors feature distributions of incoming predictions against
training-time baselines using Population Stability Index (PSI).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from collections import deque

import numpy as np

log = logging.getLogger(__name__)

BASELINE_PATH = Path("logs/drift_baseline.json")
WINDOW_SIZE = 500  # rolling window of recent predictions


class DriftDetector:
    """Tracks feature distributions and computes PSI drift scores."""

    MONITORED_FEATURES = [
        "rsrp", "rsrq", "sinr", "cqi", "ta", "velocity",
        "num_neighbors", "datarate", "ho_count_60s",
        "time_since_last_ho", "cell_hist_congestion_rate",
    ]

    PSI_BINS = 10

    def __init__(self):
        self._window: dict[str, deque] = {
            f: deque(maxlen=WINDOW_SIZE) for f in self.MONITORED_FEATURES
        }
        self._baseline: dict | None = None
        self._load_baseline()

    def _load_baseline(self):
        if BASELINE_PATH.exists():
            try:
                self._baseline = json.loads(BASELINE_PATH.read_text())
                log.info("Drift baseline loaded from %s", BASELINE_PATH)
            except Exception:
                self._baseline = None

    def set_baseline_from_dataframe(self, df):
        """Compute and save baseline statistics from training data."""
        baseline = {}
        for feat in self.MONITORED_FEATURES:
            if feat not in df.columns:
                continue
            values = df[feat].dropna().values.astype(float)
            if len(values) < 10:
                continue
            baseline[feat] = {
                "mean": float(np.mean(values)),
                "std": float(np.std(values)),
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "p25": float(np.percentile(values, 25)),
                "p50": float(np.percentile(values, 50)),
                "p75": float(np.percentile(values, 75)),
                "histogram": np.histogram(values, bins=self.PSI_BINS)[0].tolist(),
                "bin_edges": np.histogram(values, bins=self.PSI_BINS)[1].tolist(),
                "count": len(values),
            }
        self._baseline = baseline
        BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BASELINE_PATH.write_text(json.dumps(baseline, indent=2))
        log.info("Drift baseline saved with %d features", len(baseline))

    def record(self, inputs: dict):
        """Record a prediction's input features into the rolling window."""
        for feat in self.MONITORED_FEATURES:
            val = inputs.get(feat)
            if val is not None:
                try:
                    self._window[feat].append(float(val))
                except (TypeError, ValueError):
                    pass

    def _compute_psi(self, expected_hist: list[int], actual_values: list[float],
                     bin_edges: list[float]) -> float:
        """Compute Population Stability Index."""
        actual_hist = np.histogram(actual_values, bins=bin_edges)[0]

        # Normalize to proportions
        expected_total = sum(expected_hist) or 1
        actual_total = len(actual_values) or 1

        psi = 0.0
        for e, a in zip(expected_hist, actual_hist):
            e_pct = max(e / expected_total, 0.0001)
            a_pct = max(a / actual_total, 0.0001)
            psi += (a_pct - e_pct) * np.log(a_pct / e_pct)

        return float(psi)

    def get_drift_report(self) -> dict:
        """Return drift analysis for all monitored features."""
        if self._baseline is None:
            return {
                "status": "no_baseline",
                "message": "No drift baseline has been computed yet. Run training first.",
                "features": [],
            }

        features = []
        overall_status = "stable"

        for feat in self.MONITORED_FEATURES:
            bl = self._baseline.get(feat)
            if bl is None:
                continue

            window = list(self._window[feat])
            if len(window) < 20:
                features.append({
                    "feature": feat,
                    "status": "insufficient_data",
                    "psi": 0,
                    "z_shift": 0,
                    "window_size": len(window),
                    "baseline_mean": bl["mean"],
                    "current_mean": None,
                })
                continue

            # PSI
            psi = self._compute_psi(bl["histogram"], window, bl["bin_edges"])

            # Z-score shift
            current_mean = float(np.mean(window))
            baseline_std = bl["std"] if bl["std"] > 0 else 1.0
            z_shift = abs(current_mean - bl["mean"]) / baseline_std

            # Classify
            if psi > 0.5 or z_shift > 3.0:
                status = "critical"
                overall_status = "critical"
            elif psi > 0.2 or z_shift > 2.0:
                status = "warning"
                if overall_status != "critical":
                    overall_status = "warning"
            else:
                status = "stable"

            features.append({
                "feature": feat,
                "status": status,
                "psi": round(psi, 4),
                "z_shift": round(z_shift, 4),
                "window_size": len(window),
                "baseline_mean": round(bl["mean"], 4),
                "current_mean": round(current_mean, 4),
            })

        return {
            "status": overall_status,
            "window_size": min(len(w) for w in self._window.values()) if self._window else 0,
            "monitored_features": len(features),
            "features": features,
        }


# Singleton instance
_detector: DriftDetector | None = None


def get_drift_detector() -> DriftDetector:
    global _detector
    if _detector is None:
        _detector = DriftDetector()
    return _detector
