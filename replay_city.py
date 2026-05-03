"""
replay_city.py — Authentic Dataset Replay Simulator
=====================================================
Replays REAL UE GPS tracks from the raw dataset through the
live ML inference pipeline. Every dot on the map is a real
GPS position recorded by a real device in the Ruhr region.

Data sources:
  - logs/ue_replay_tracks.parquet  (real UE GPS + signal per row)
  - logs/cell_gps.json             (real cell tower positions, keyed by physical_cellid)

Each tick:
  - Advances each UE to its next real GPS position
  - Sends real signal measurements through the /predict API
  - Detects handovers (cell changes) and logs them separately
  - Logs the result to logs/predictions.json for the dashboard

Run:
    python -u replay_city.py
"""

import json
import math
import os
import sys
import time
from pathlib import Path

import pandas as pd
import numpy as np
import requests

# ── Config ───────────────────────────────────────────────────────────────────
API_URL    = "http://localhost:8000/predict"
LOG_FILE   = "logs/predictions.json"
GPS_FILE   = "logs/cell_gps.json"
TRACKS_FILE = "logs/ue_replay_tracks.parquet"
STATE_FILE = "logs/playback_state.json"
HO_LOG_FILE = "logs/handover_log.json"

TICK_INTERVAL = 1.0       # seconds between ticks at 1x speed
MAX_LOG_LINES = 20        # keep only recent events so map shows current state
MAX_HO_LINES  = 500       # rolling handover history
STEP_SIZE     = 10        # skip N rows per tick (slower = smoother transitions)

# Align with run_city.py — log proactive guidance so KPIs / Handover History match real scores.
REACTIVE_LEGACY_RSRP_DB = float(os.environ.get("SIM_REACTIVE_RSRP_DB", "-98"))
SIM_PREDICTIVE_PROB_FLOOR = float(os.environ.get("SIM_PREDICTIVE_PROB_FLOOR", "0.12"))
SIM_PREDICTIVE_MIN_DELTA_RSRP = float(os.environ.get("SIM_PREDICTIVE_MIN_DELTA_RSRP", "1.5"))
SIM_PREDICTIVE_DSO1_RISK = float(os.environ.get("SIM_PREDICTIVE_DSO1_RISK", "0.20"))


def merge_outputs_for_log(payload: dict, result: dict) -> dict:
    """Keep raw API fields but set handover_recommended for dashboards (API OR early guidance)."""
    api_ho = bool(result.get("handover_recommended", False))
    prob = float(result.get("dso4_probability", 0))
    risk = float(result.get("dso1_risk_score", 0))
    rsrp = float(payload.get("rsrp", -140))
    d_rsrp = max(
        float(payload.get("delta_rsrp") or 0),
        abs(float(payload.get("rsrp_delta_3") or 0)),
    )
    early = (
        rsrp > REACTIVE_LEGACY_RSRP_DB
        and d_rsrp >= SIM_PREDICTIVE_MIN_DELTA_RSRP
        and (prob >= SIM_PREDICTIVE_PROB_FLOOR or risk >= SIM_PREDICTIVE_DSO1_RISK)
    )
    executed = api_ho or early
    out = dict(result)
    out["handover_recommended"] = executed
    out["api_handover_recommended"] = api_ho
    out["guidance_handover"] = executed and not api_ho
    if executed and not api_ho:
        base = str(out.get("decision_source", "unknown"))
        out["decision_source"] = f"{base}+guidance"
    return out

# ── Helpers ──────────────────────────────────────────────────────────────────

def haversine_m(lat1, lng1, lat2, lng2) -> float:
    """Distance in meters between two GPS coords."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def load_cell_gps(path: str) -> dict:
    """Load cell tower GPS lookup {physical_cellid: {lat, lng, scenario}}."""
    with open(path) as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def write_log(ue_id: str, scenario: str, ue_lat: float, ue_lng: float,
              cell_id: int, payload: dict, merged: dict):
    """Append one prediction to the shared log file (merged = API + guidance flags)."""
    entry = {
        "event_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "inputs": {
            "physical_cellid": cell_id,
            "rsrp":   payload.get("rsrp", -140),
            "rsrq":   payload.get("rsrq", -20),
            "sinr":   payload.get("sinr", 0),
            "ta":     payload.get("ta", 0),
            "velocity": payload.get("velocity", 0),
            "master_id": ue_id,
            "scenario": scenario,
            "num_neighbors": payload.get("num_neighbors", 0),
            "ue_lat": ue_lat,
            "ue_lng": ue_lng,
            "delta_rsrp": payload.get("delta_rsrp"),
        },
        "outputs": {
            "dso1_risk_score":      merged.get("dso1_risk_score", 0),
            "dso3_cluster":         merged.get("dso3_cluster", 0),
            "dso3_label":           merged.get("dso3_label", "Unknown"),
            "dso4_probability":     merged.get("dso4_probability", 0),
            "dso4_threshold":       merged.get("dso4_threshold", 0),
            "handover_recommended": merged.get("handover_recommended", False),
            "api_handover_recommended": merged.get("api_handover_recommended", False),
            "guidance_handover": merged.get("guidance_handover", False),
            "latency_ms":           merged.get("latency_ms", 0),
            "decision_source":      merged.get("decision_source", "unknown"),
        },
    }
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def write_handover(ho_event: dict):
    """Append a handover event to the handover log."""
    Path(HO_LOG_FILE).parent.mkdir(exist_ok=True)
    with open(HO_LOG_FILE, "a") as f:
        f.write(json.dumps(ho_event) + "\n")


def trim_file(path: str, max_lines: int):
    """Keep only the last max_lines in a file."""
    p = Path(path)
    if not p.exists():
        return
    try:
        lines = p.read_text().strip().split("\n")
        if len(lines) > max_lines:
            p.write_text("\n".join(lines[-max_lines:]) + "\n")
    except Exception:
        pass


def get_state() -> dict:
    if not Path(STATE_FILE).exists():
        return {"status": "playing", "speed": 1.0}
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {"status": "playing", "speed": 1.0}


# ── UE Replay Cursor ────────────────────────────────────────────────────────

class ReplayUE:
    """Cursor into a single UE's real GPS track with handover detection."""

    def __init__(self, uid: str, track_df: pd.DataFrame, cell_gps: dict):
        self.uid = uid
        self.track = track_df.reset_index(drop=True)
        self.cell_gps = cell_gps
        self.cursor = 0
        self.scenario = str(self.track.iloc[0]["scenario"])
        self.prev_cell_id: int | None = None
        self.prev_rsrp: float = -140.0
        self.prev_sinr: float = 0.0
        self.prev_result: dict = {}
        self.prev_merged: dict = {}
        # Store last N positions for breadcrumb trail
        self.trail: list[dict] = []
        
        # History for engineered features
        self.history_rsrp: list[float] = []
        self.history_sinr: list[float] = []
        self.history_cqi: list[float] = []
        self.history_velocity: list[float] = []
        self.history_num_neighbors: list[float] = []
        self.ho_timestamps: list[int] = []
        self.tick_count = 0
        self.last_ho_tick = -100

    @property
    def done(self) -> bool:
        return self.cursor >= len(self.track)

    def advance(self, steps: int = 1):
        """Move cursor forward."""
        self.cursor = min(self.cursor + steps, len(self.track))

    def current_row(self) -> pd.Series | None:
        if self.done:
            return None
        return self.track.iloc[self.cursor]

    def measure(self) -> dict | None:
        """Build a measurement payload from the current real row."""
        row = self.current_row()
        if row is None:
            return None

        cell_id = int(row["physical_cellid"])
        ue_lat = float(row["ue_lat"])
        ue_lng = float(row["ue_lng"])
        rsrp = float(row["rsrp"]) if pd.notna(row["rsrp"]) else -100.0
        rsrq = float(row["rsrq"]) if pd.notna(row["rsrq"]) else -12.0
        sinr = float(row["sinr"]) if pd.notna(row["sinr"]) else 5.0
        ta = float(row["ta"]) if pd.notna(row["ta"]) else 0.0
        velocity = float(row["velocity"]) if pd.notna(row["velocity"]) else 0.0

        # Compute distance to serving cell if we have its GPS
        dist_m = 0.0
        if cell_id in self.cell_gps:
            c = self.cell_gps[cell_id]
            dist_m = haversine_m(ue_lat, ue_lng, c["lat"], c["lng"])

        # Estimate neighbor count from TA and RSRP
        num_neighbors = max(1, min(6, int(4 - (rsrp + 90) / 15)))

        # Update trail (keep last 15 positions)
        self.trail.append({"lat": ue_lat, "lng": ue_lng, "cell_id": cell_id})
        if len(self.trail) > 15:
            self.trail = self.trail[-15:]

        payload = {}
        for col in row.index:
            if pd.notna(row[col]):
                val = row[col]
                if isinstance(val, (int, np.integer)):
                    payload[col] = int(val)
                elif isinstance(val, (float, np.floating)):
                    payload[col] = float(val)
                else:
                    payload[col] = str(val)

        # Ensure required overrides
        payload["physical_cellid"] = cell_id
        payload["ue_lat"] = ue_lat
        payload["ue_lng"] = ue_lng
        payload["master_id"] = self.uid
        payload["scenario"] = self.scenario
        payload["dist_m"] = dist_m
        
        # Override with fallback checks for basic stats if missing
        payload["rsrp"] = rsrp
        payload["rsrq"] = rsrq
        payload["sinr"] = sinr
        payload["ta"] = ta
        payload["velocity"] = velocity
        payload["num_neighbors"] = num_neighbors

        # --- Engineer Missing Features ---
        self.history_rsrp.append(rsrp)
        self.history_sinr.append(sinr)
        cqi = float(row["cqi"]) if "cqi" in row and pd.notna(row["cqi"]) else 9.0
        self.history_cqi.append(cqi)
        self.history_velocity.append(velocity)
        self.history_num_neighbors.append(num_neighbors)
        self.tick_count += 1
        
        max_hist = 20
        self.history_rsrp = self.history_rsrp[-max_hist:]
        self.history_sinr = self.history_sinr[-max_hist:]
        self.history_cqi = self.history_cqi[-max_hist:]
        self.history_velocity = self.history_velocity[-max_hist:]
        self.history_num_neighbors = self.history_num_neighbors[-max_hist:]

        def safe_lag(hist, lag):
            return hist[-lag-1] if len(hist) > lag else hist[0]
            
        payload["rsrp_delta_3"] = rsrp - safe_lag(self.history_rsrp, 3)
        payload["sinr_delta_3"] = sinr - safe_lag(self.history_sinr, 3)
        payload["sinr_delta_5"] = sinr - safe_lag(self.history_sinr, 5)
        payload["cqi_delta_3"] = cqi - safe_lag(self.history_cqi, 3)
        payload["rsrp_lag_1"] = safe_lag(self.history_rsrp, 1)
        payload["rsrp_vs_rolling"] = rsrp - (sum(self.history_rsrp)/len(self.history_rsrp))
        
        std_rsrp = np.std(self.history_rsrp[-10:]) if len(self.history_rsrp) > 1 else 1.0
        payload["rsrp_rolling_std_10"] = float(std_rsrp) if std_rsrp > 0 else 1.0
        
        payload["velocity_delta"] = velocity - safe_lag(self.history_velocity, 1)
        payload["num_neighbors_delta"] = num_neighbors - safe_lag(self.history_num_neighbors, 1)
        
        payload["ho_count_60s"] = sum(1 for t in self.ho_timestamps if self.tick_count - t <= 60)
        payload["time_since_last_ho"] = float(self.tick_count - self.last_ho_tick)
        payload["serving_cell_age"] = float(self.tick_count - self.last_ho_tick)

        if "delta_rsrp" not in payload or payload.get("delta_rsrp") is None:
            payload["delta_rsrp"] = float(payload.get("rsrp_delta_3", 0) or 0)

        return payload

    def check_handover(self, payload: dict, result: dict) -> dict | None:
        """Detect if a handover happened (cell changed from previous tick)."""
        cell_id = payload["physical_cellid"]
        rsrp = payload["rsrp"]
        sinr = payload["sinr"]

        if self.prev_cell_id is not None and cell_id != self.prev_cell_id:
            # Handover detected!
            from_gps = self.cell_gps.get(self.prev_cell_id, {})
            to_gps = self.cell_gps.get(cell_id, {})

            dist_to_old = 0.0
            dist_to_new = 0.0
            if from_gps:
                dist_to_old = haversine_m(payload["ue_lat"], payload["ue_lng"],
                                          from_gps.get("lat", 0), from_gps.get("lng", 0))
            if to_gps:
                dist_to_new = haversine_m(payload["ue_lat"], payload["ue_lng"],
                                          to_gps.get("lat", 0), to_gps.get("lng", 0))

            ho_event = {
                "kind": "reactive",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
                "ue_id": self.uid,
                "scenario": self.scenario,
                "from_cell": self.prev_cell_id,
                "to_cell": cell_id,
                "from_cell_lat": from_gps.get("lat"),
                "from_cell_lng": from_gps.get("lng"),
                "to_cell_lat": to_gps.get("lat"),
                "to_cell_lng": to_gps.get("lng"),
                "ue_lat": payload["ue_lat"],
                "ue_lng": payload["ue_lng"],
                "rsrp_before": round(self.prev_rsrp, 1),
                "rsrp_after": round(rsrp, 1),
                "rsrp_delta": round(rsrp - self.prev_rsrp, 1),
                "sinr_before": round(self.prev_sinr, 1),
                "sinr_after": round(sinr, 1),
                "sinr_delta": round(sinr - self.prev_sinr, 1),
                "dist_to_old_m": round(dist_to_old, 0),
                "dist_to_new_m": round(dist_to_new, 0),
                "ai_recommended": bool(self.prev_merged.get("handover_recommended", False)),
                "ai_risk": round(float(self.prev_merged.get("dso4_probability", 0)), 4),
                "velocity": payload.get("velocity", 0),
            }

            self.prev_cell_id = cell_id
            self.prev_rsrp = rsrp
            self.prev_sinr = sinr
            self.prev_result = result
            self.ho_timestamps.append(self.tick_count)
            self.last_ho_tick = self.tick_count
            return ho_event

        self.prev_cell_id = cell_id
        self.prev_rsrp = rsrp
        self.prev_sinr = sinr
        self.prev_result = result
        return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("[REPLAY] *** Authentic Dataset Replay — Ruhr Region, Germany ***")

    # Load cell GPS
    if not Path(GPS_FILE).exists():
        print(f"[REPLAY] {GPS_FILE} not found — run build_replay.py first")
        sys.exit(1)
    cell_gps = load_cell_gps(GPS_FILE)
    print(f"[REPLAY] Loaded {len(cell_gps)} real cell tower positions")

    # Load UE tracks
    if not Path(TRACKS_FILE).exists():
        print(f"[REPLAY] {TRACKS_FILE} not found — run scratch/build_replay.py first")
        sys.exit(1)
    tracks_df = pd.read_parquet(TRACKS_FILE)
    print(f"[REPLAY] Loaded {len(tracks_df)} real GPS measurements")

    # Create replay cursors per UE
    ue_ids = tracks_df["master_id"].unique()
    ues = []
    for uid in ue_ids:
        ue_df = tracks_df[tracks_df["master_id"] == uid]
        ues.append(ReplayUE(uid, ue_df, cell_gps))
        print(f"[REPLAY]   {uid}: {len(ue_df)} rows ({ue_df.iloc[0]['scenario']})")

    # Wait for API
    print("[REPLAY] Waiting for ML API...")
    for attempt in range(20):
        try:
            r = requests.get("http://localhost:8000/health", timeout=5)
            if r.status_code == 200:
                print(f"[REPLAY] API healthy: {r.json()}")
                break
        except Exception as e:
            print(f"[REPLAY] Attempt {attempt + 1}/20 — not ready: {e}")
            time.sleep(3)
    else:
        print("[REPLAY] API not reachable. Exiting.")
        sys.exit(1)

    # Clear old logs
    if Path(LOG_FILE).exists():
        Path(LOG_FILE).write_text("")
    if Path(HO_LOG_FILE).exists():
        Path(HO_LOG_FILE).write_text("")

    print(f"[REPLAY] Starting replay... ({len(ues)} UEs, step={STEP_SIZE})")
    print("[REPLAY] Visit http://localhost:5173/app/operator to see the live map")

    tick = 0
    last_trim = 0
    total_handovers = 0

    while True:
        # Check playback state
        state = get_state()
        if state.get("status") == "paused":
            time.sleep(0.5)
            continue

        speed = float(state.get("speed", 1.0))
        dt = TICK_INTERVAL / max(speed, 0.1)
        tick += 1

        # Check if all UEs are done
        active = [ue for ue in ues if not ue.done]
        if not active:
            # Loop: reset all cursors
            print(f"[REPLAY] All tracks exhausted at tick {tick}. Looping...")
            for ue in ues:
                ue.cursor = 0
                ue.prev_cell_id = None
                ue.trail = []
                ue.prev_merged = {}
            active = ues

        ok, err, ho_count = 0, 0, 0
        for ue in active:
            payload = ue.measure()
            if payload is None:
                continue

            # Send to API (strip non-API fields)
            api_payload = {k: v for k, v in payload.items()
                          if k not in ("ue_lat", "ue_lng", "master_id", "dist_m")}
            try:
                r = requests.post(API_URL, json=api_payload, timeout=10)
                if r.status_code == 200:
                    result = r.json()
                    merged = merge_outputs_for_log(payload, result)

                    ho_event = ue.check_handover(payload, merged)
                    write_log(
                        ue.uid, ue.scenario,
                        payload["ue_lat"], payload["ue_lng"],
                        payload["physical_cellid"],
                        payload, merged,
                    )
                    if ho_event:
                        write_handover(ho_event)
                        ho_count += 1
                        total_handovers += 1
                        print(f"  ⚡ HANDOVER: {ue.uid} Cell {ho_event['from_cell']} → {ho_event['to_cell']} "
                              f"| RSRP: {ho_event['rsrp_before']}→{ho_event['rsrp_after']} dBm "
                              f"| AI: {'✓' if ho_event['ai_recommended'] else '✗'}")

                    ue.prev_merged = merged
                    ok += 1
                else:
                    err += 1
            except Exception:
                err += 1

            # Advance the cursor
            ue.advance(STEP_SIZE)

        # Trim logs periodically
        if tick - last_trim > 20:
            trim_file(LOG_FILE, MAX_LOG_LINES)
            trim_file(HO_LOG_FILE, MAX_HO_LINES)
            last_trim = tick

        if tick % 5 == 0:
            positions = []
            for ue in active[:4]:
                row = ue.current_row()
                if row is not None:
                    positions.append(f"{ue.uid}→Cell{int(row['physical_cellid'])}@({row['ue_lat']:.4f},{row['ue_lng']:.4f})")
            pos_str = " | ".join(positions) if positions else ""
            print(f"[REPLAY] Tick {tick:5d} | HOs: {ho_count}/{total_handovers} total | OK: {ok} | {pos_str}")

        time.sleep(max(0.2, dt))


if __name__ == "__main__":
    main()
