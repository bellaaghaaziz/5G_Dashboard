"""
src/calibration.py — Isotonic Calibration for pre-fitted classifiers
=====================================================================
sklearn 1.8 removed CalibratedClassifierCV(cv='prefit').
This module provides an equivalent using IsotonicRegression directly.

Used by:
    - Training pipeline (notebook / main.py)
    - FastAPI inference (api.py)
    - Model loading (model_pipeline.py)
"""

from __future__ import annotations

import numpy as np
from sklearn.base import BaseEstimator
from sklearn.isotonic import IsotonicRegression


class IsotonicCalibrator(BaseEstimator):
    """Calibrate a pre-fitted classifier using isotonic regression.

    Usage
    -----
    >>> cal = IsotonicCalibrator(base_xgb_model)
    >>> cal.fit(X_cal, y_cal)            # fit on held-out calibration set
    >>> probs = cal.predict_proba(X_test) # calibrated probabilities
    """

    def __init__(self, base_estimator):
        self.base_estimator = base_estimator
        self.calibrator = IsotonicRegression(out_of_bounds="clip")

    def fit(self, X, y):
        """Fit isotonic calibration on a held-out set."""
        raw_probs = self.base_estimator.predict_proba(X)[:, 1]
        self.calibrator.fit(raw_probs, y)
        return self

    def predict_proba(self, X):
        """Return calibrated [P(0), P(1)] array."""
        raw_probs = self.base_estimator.predict_proba(X)[:, 1]
        cal_probs = self.calibrator.predict(raw_probs)
        cal_probs = np.clip(cal_probs, 0, 1)
        return np.column_stack([1 - cal_probs, cal_probs])

    def predict(self, X):
        """Hard prediction at 0.5 threshold."""
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)
