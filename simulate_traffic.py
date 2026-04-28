"""
simulate_traffic.py — Dataset Replay Engine
=============================================
Reads df_master_engineered.parquet and streams telemetry
row-by-row to the FastAPI /predict endpoint,
populating the prediction logs for the dashboard.

Supports playback controls (pause/resume/seek/speed) via
logs/playback_state.json which is written by the dashboard service.
"""
import sys
import time
import json
import requests
import pandas as pd
import numpy as np
from pathlib import Path

DATASET_PATH = "DATASET/df_master_engineered.parquet"
STATE_FILE = "logs/playback_state.json"
API_URL = "http://localhost:8000/predict"
LOG_FILE = "logs/predictions.json"

def log(msg):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode(), flush=True)

def get_state():
    if not Path(STATE_FILE).exists():
        return {"status": "playing", "timestamp": None, "speed": 1.0}
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"status": "playing", "timestamp": None, "speed": 1.0}

def write_prediction_log(inputs: dict, result: dict, scenario: str, ue_id: str):
    """Append a prediction to the shared log file."""
    entry = {
        "event_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "inputs": {
            "physical_cellid": inputs.get("physical_cellid", 0),
            "rsrp": inputs.get("rsrp", -140),
            "rsrq": inputs.get("rsrq", -20),
            "sinr": inputs.get("sinr", 0),
            "ta": inputs.get("ta", 0),
            "velocity": inputs.get("velocity", 0),
            "master_id": ue_id,
            "scenario": scenario,
            "cqi": inputs.get("cqi", 0),
            "datarate": inputs.get("datarate", 0),
            "num_neighbors": inputs.get("num_neighbors", 0),
        },
        "outputs": {
            "dso1_risk_score": result.get("dso1_risk_score", 0),
            "dso3_cluster": result.get("dso3_cluster", 0),
            "dso3_label": result.get("dso3_label", "Unknown"),
            "dso4_probability": result.get("dso4_probability", 0),
            "handover_recommended": result.get("handover_recommended", False),
            "latency_ms": result.get("latency_ms", 0),
            "decision_source": result.get("decision_source", "unknown"),
        },
    }
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")

def main():
    log("[SIM] Loading dataset...")
    df = pd.read_parquet(DATASET_PATH)
    df = df.sort_values(by="ts_num").reset_index(drop=True)

    timestamps = sorted(df["ts_num"].unique())
    log(f"[SIM] Loaded {len(df)} rows across {len(timestamps)} time slices.")

    # Check scenario column
    has_scenario = "scenario" in df.columns
    if has_scenario:
        scenarios = df["scenario"].value_counts()
        log(f"[SIM] UE types: {dict(scenarios)}")
    else:
        log("[SIM] No 'scenario' column found, all UEs marked as 'unknown'")

    # Test API health first
    log("[SIM] Checking API health...")
    for attempt in range(15):
        try:
            r = requests.get("http://localhost:8000/health", timeout=5)
            if r.status_code == 200:
                log(f"[SIM] API is healthy: {r.json()}")
                break
        except Exception as e:
            log(f"[SIM] Attempt {attempt+1}/15 - API not ready: {e}")
            time.sleep(3)
    else:
        log("[SIM] API not reachable after 15 attempts. Exiting.")
        sys.exit(1)

    # Clear old log file to start fresh
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    if Path(LOG_FILE).exists():
        # Keep last 100 lines
        try:
            lines = Path(LOG_FILE).read_text().strip().split("\n")
            if len(lines) > 100:
                Path(LOG_FILE).write_text("\n".join(lines[-100:]) + "\n")
        except Exception:
            pass

    current_idx = 0
    log(f"[SIM] Starting replay from timestamp index 0...")

    while True:
        state = get_state()

        if state.get("status") == "paused":
            time.sleep(0.5)
            continue

        # Handle seek
        if state.get("timestamp") is not None:
            target_ts = state["timestamp"]
            closest_idx = int(np.argmin(np.abs(np.array(timestamps) - target_ts)))
            current_idx = closest_idx
            state["timestamp"] = None
            Path(STATE_FILE).parent.mkdir(exist_ok=True)
            with open(STATE_FILE, "w") as f:
                json.dump(state, f)
            log(f"[SIM] Seeked to timestamp index {current_idx}")

        if current_idx >= len(timestamps):
            current_idx = 0
            log("[SIM] Looping back to start of dataset")

        ts = timestamps[current_idx]
        slice_df = df[df["ts_num"] == ts]

        success = 0
        errors = 0
        for _, row in slice_df.iterrows():
            payload = {}
            for k, v in row.to_dict().items():
                if k in ("datetime", "time_bin", "scenario", "master_id"):
                    continue  # Skip non-numeric / metadata columns
                if isinstance(v, (pd.Timestamp, np.datetime64)):
                    continue
                if pd.isna(v):
                    payload[k] = 0.0
                else:
                    payload[k] = float(v) if isinstance(v, (int, float, np.integer, np.floating)) else 0.0

            ue_id = str(row.get("master_id", "unknown"))
            scenario = str(row.get("scenario", "unknown")) if has_scenario else "unknown"

            try:
                r = requests.post(API_URL, json=payload, timeout=30)
                if r.status_code == 200:
                    result = r.json()
                    write_prediction_log(payload, result, scenario, ue_id)
                    success += 1
                else:
                    errors += 1
                    if errors <= 2:
                        log(f"[SIM] API returned {r.status_code}: {r.text[:200]}")
            except Exception as e:
                errors += 1
                if errors <= 2:
                    log(f"[SIM] Request error: {e}")

        log(f"[SIM] Slice {current_idx}/{len(timestamps)} | ts={ts:.0f} | OK={success} ERR={errors} | UEs={len(slice_df)}")
        current_idx += 1

        # Respect playback speed
        speed = state.get("speed", 1.0)
        try:
            speed = float(speed)
        except (TypeError, ValueError):
            speed = 1.0
        delay = max(0.3, 1.5 / max(speed, 0.1))
        time.sleep(delay)

if __name__ == "__main__":
    main()
