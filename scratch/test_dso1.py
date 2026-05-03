import joblib
import pandas as pd
import numpy as np

scaler = joblib.load('scaler_dso1.pkl')
model = joblib.load('model_dso1_xgb.pkl')

# Test with a "bad" signal
test_input = {
    'rsrp': -120.0,
    'rsrq': -18.0,
    'sinr': -5.0,
    'velocity': 60.0,
    'num_neighbors': 1.0,
}

# Fill other features with 0.0
from src.model_pipeline import _load_feature_lists
fl = _load_feature_lists()
feats = fl['dso1_features']

X = pd.DataFrame([{f: test_input.get(f, 0.0) for f in feats}])
X_s = scaler.transform(X)
prob = model.predict_proba(X_s)[0][1]

print(f"Risk for RSRP -120: {prob:.4f}")

# Test with a "good" signal
test_input_good = {
    'rsrp': -70.0,
    'rsrq': -10.0,
    'sinr': 20.0,
    'velocity': 5.0,
    'num_neighbors': 5.0,
}
X_good = pd.DataFrame([{f: test_input_good.get(f, 0.0) for f in feats}])
X_s_good = scaler.transform(X_good)
prob_good = model.predict_proba(X_s_good)[0][1]
print(f"Risk for RSRP -70: {prob_good:.4f}")
