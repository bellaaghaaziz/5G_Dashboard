"""
simulate_city.py ? Production-Realistic Network Simulator
===========================================================
Simulates a real 5G network with 50-100 concurrent UEs
moving across the Ruhr Region (Germany) in real time.

Each UE:
  - Has a real GPS position
  - Moves according to its scenario (pedestrian/car/train/static)
  - Computes realistic RSRP/SINR based on distance to real cell towers
  - Sends measurements through the real DSO1-4 ML pipeline
  - Writes results to logs/predictions.json for the dashboard

This replaces the single-device dataset replay with a
production-scale simulation ready for live presentation.
"""

import json
import math
import os
import random
import sys
import time
from pathlib import Path
import numpy as np
import requests

# ?? Config ?
API_URL   = "http://localhost:8000/predict"
LOG_FILE  = "logs/predictions.json"
HO_LOG_FILE = "logs/handover_log.json"
GPS_FILE  = "logs/cell_gps.json"
STATE_FILE = "logs/playback_state.json"
MAX_HO_LINES = 500

# Ruhr region bounding box
LAT_MIN, LAT_MAX = 51.40, 51.60
LNG_MIN, LNG_MAX = 7.15,  7.60

# Simulation parameters
N_UES           = 60      # concurrent UEs
TICK_INTERVAL   = 1.5     # seconds between ticks (at 1x speed)
MAX_LOG_LINES   = 2000    # rolling log window

# Legacy (reactive) RAN: handover only after serving RSRP falls below this floor (signal already poor).
REACTIVE_LEGACY_RSRP_DB = float(os.environ.get("SIM_REACTIVE_RSRP_DB", "-98"))
# A3-style: neighbor must be this many dB stronger to trigger legacy HO.
REACTIVE_LEGACY_A3_DB = float(os.environ.get("SIM_REACTIVE_A3_DB", "3"))
# Predictive path: also execute HO when model probability crosses this sim floor while still above legacy floor
# (uses real DSO4 scores from the API — tuned so the dashboard shows proactive vs degraded-reactive).
SIM_PREDICTIVE_PROB_FLOOR = float(os.environ.get("SIM_PREDICTIVE_PROB_FLOOR", "0.14"))
SIM_PREDICTIVE_MIN_DELTA_RSRP = float(os.environ.get("SIM_PREDICTIVE_MIN_DELTA_RSRP", "2.5"))
SIM_PREDICTIVE_DSO1_RISK = float(os.environ.get("SIM_PREDICTIVE_DSO1_RISK", "0.28"))

# ?? UE Scenarios ?
SCENARIOS = {
    "pedestrian": {
        "weight": 0.30,
        "speed_mps": (0.5, 1.5),    # 2-5 km/h
        "color": "?",
        "direction_change": 0.15,   # prob of changing direction per tick
    },
    "car": {
        "weight": 0.40,
        "speed_mps": (5, 20),       # 18-72 km/h
        "color": "?",
        "direction_change": 0.08,
    },
    "hbahn": {
        "weight": 0.15,
        "speed_mps": (25, 60),      # 90-216 km/h
        "color": "?",
        "direction_change": 0.02,   # mostly straight (rail)
    },
    "static": {
        "weight": 0.15,
        "speed_mps": (0, 0),        # doesn't move
        "color": "?",
        "direction_change": 0.0,
    },
}

# ?? Path loss model (3GPP UMa) 
def compute_rsrp(dist_m: float, tx_power_dbm: float = 43.0) -> float:
    """3GPP UMa path loss model ? RSRP in dBm."""
    if dist_m < 10:
        dist_m = 10
    fc_ghz = 3.5  # 5G n78 band
    # UMa NLOS path loss
    pl = 32.4 + 20 * math.log10(fc_ghz) + 30 * math.log10(dist_m)
    rsrp = tx_power_dbm - pl + random.gauss(0, 4)  # shadowing
    return max(-140, min(-40, round(rsrp, 1)))

def compute_sinr(rsrp: float, n_neighbors: int) -> float:
    """Estimate SINR from RSRP and interference (number of neighbors)."""
    noise_floor = -100
    interference = noise_floor + 10 * math.log10(max(n_neighbors, 1))
    sinr = rsrp - interference + random.gauss(0, 2)
    return round(max(-10, min(30, sinr)), 1)

def haversine_m(lat1, lng1, lat2, lng2) -> float:
    """Distance in meters between two GPS coords."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ?? Cell tower registry ?
def load_cells(gps_file: str) -> list[dict]:
    if not Path(gps_file).exists():
        print("[SIM] cell_gps.json not found -- run export_gps_lookup.py first")
        sys.exit(1)
    with open(gps_file) as f:
        data = json.load(f)
    cells = []
    for cid, v in data.items():
        lat, lng = v["lat"], v["lng"]
        if LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX:
            cells.append({"cell_id": int(cid), "lat": lat, "lng": lng, "scenario": v.get("scenario","unknown")})
    print(f"[SIM] Loaded {len(cells)} cells in Ruhr bounding box")
    return cells

def find_serving_cell(ue_lat, ue_lng, cells):
    """Return the nearest cell and its distance."""
    best, best_dist = None, float("inf")
    for c in cells:
        d = haversine_m(ue_lat, ue_lng, c["lat"], c["lng"])
        if d < best_dist:
            best_dist = d
            best = c
    return best, best_dist

def find_neighbors(ue_lat, ue_lng, cells, serving_id, n=6):
    """Return up to n neighboring cells sorted by distance."""
    others = [(haversine_m(ue_lat, ue_lng, c["lat"], c["lng"]), c)
              for c in cells if c["cell_id"] != serving_id]
    return [c for _, c in sorted(others, key=lambda x: x[0])[:n]]

# ?? UE class 
class UE:
    _counter = 0

    def __init__(self, cells: list[dict]):
        UE._counter += 1
        self.uid = f"UE-{UE._counter:03d}"
        scenario_name = random.choices(
            list(SCENARIOS.keys()),
            weights=[v["weight"] for v in SCENARIOS.values()]
        )[0]
        self.scenario = scenario_name
        cfg = SCENARIOS[scenario_name]
        sp_min, sp_max = cfg["speed_mps"]
        self.speed_mps = random.uniform(sp_min, sp_max)
        self.direction_change_prob = cfg["direction_change"]
        # Random start position within Ruhr
        self.lat = random.uniform(LAT_MIN, LAT_MAX)
        self.lng = random.uniform(LNG_MIN, LNG_MAX)
        # Random heading (degrees)
        self.heading = random.uniform(0, 360)
        # Small random time offset so UEs aren't all synced
        self.phase = random.uniform(0, 60)
        # Persistent connection state
        self.serving_cell = None
        self.last_neighbors = []
        self.last_predict_result: dict = {}
        # Shadow UE camped on legacy policy (degraded-signal A3 only) — never drives the ML input.
        self.shadow_reactive_cell: dict | None = None


    def move(self, dt_seconds: float):
        """Move UE according to its scenario."""
        if self.scenario == "static":
            return
        # Occasionally change direction
        if random.random() < self.direction_change_prob:
            self.heading += random.gauss(0, 45)
        # H-Bahn: oscillate on a linear route
        if self.scenario == "hbahn":
            self.phase += dt_seconds
            if self.phase > 180:
                self.heading = (self.heading + 180) % 360
                self.phase = 0
        # Convert speed + heading to lat/lng delta
        dist_m = self.speed_mps * dt_seconds
        rad = math.radians(self.heading)
        dlat = (dist_m * math.cos(rad)) / 111320
        dlng = (dist_m * math.sin(rad)) / (111320 * math.cos(math.radians(self.lat)))
        self.lat += dlat
        self.lng += dlng
        # Bounce off walls
        if not (LAT_MIN < self.lat < LAT_MAX):
            self.heading = 180 - self.heading
            self.lat = max(LAT_MIN + 0.001, min(LAT_MAX - 0.001, self.lat))
        if not (LNG_MIN < self.lng < LNG_MAX):
            self.heading = 360 - self.heading
            self.lng = max(LNG_MIN + 0.001, min(LNG_MAX - 0.001, self.lng))

    def step_shadow_legacy_handover(self, cells: list[dict]) -> dict | None:
        """Classic reactive RAN: only hand over once serving RSRP is below floor and a neighbor is clearly better."""
        if self.shadow_reactive_cell is None:
            sc, _ = find_serving_cell(self.lat, self.lng, cells)
            self.shadow_reactive_cell = sc
            return None

        sh = self.shadow_reactive_cell
        dist_s = haversine_m(self.lat, self.lng, sh["lat"], sh["lng"])
        rsrp_s = compute_rsrp(dist_s)
        neighbors = find_neighbors(self.lat, self.lng, cells, sh["cell_id"])
        if not neighbors or rsrp_s >= REACTIVE_LEGACY_RSRP_DB:
            return None

        target = neighbors[0]
        nb_dist = haversine_m(self.lat, self.lng, target["lat"], target["lng"])
        nb_rsrp = compute_rsrp(nb_dist)
        if nb_rsrp <= rsrp_s + REACTIVE_LEGACY_A3_DB:
            return None

        sinr_s = compute_sinr(rsrp_s, len(neighbors))
        ev = {
            "kind": "reactive_legacy",
            "policy": "wait_until_degraded",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "ue_id": self.uid,
            "scenario": self.scenario,
            "from_cell": sh["cell_id"],
            "to_cell": target["cell_id"],
            "rsrp_at_ho": round(rsrp_s, 1),
            "sinr_at_ho": sinr_s,
            "neighbor_rsrp_at_ho": round(nb_rsrp, 1),
            "rsrp_delta": round(nb_rsrp - rsrp_s, 1),
            "dist_to_old_m": round(dist_s, 0),
            "dist_to_new_m": round(nb_dist, 0),
            "velocity": round(self.speed_mps * 3.6, 2),
            "legacy_rsrp_floor_dbm": REACTIVE_LEGACY_RSRP_DB,
        }
        self.shadow_reactive_cell = target
        return ev

    def measure(self, cells: list[dict]) -> dict | None:
        """Compute signal measurements based on current serving cell."""
        natural, _ndist = find_serving_cell(self.lat, self.lng, cells)

        if self.serving_cell is None:
            self.serving_cell = natural

        serving = self.serving_cell
        dist = haversine_m(self.lat, self.lng, serving["lat"], serving["lng"])
        
        # If we've moved too far, force a cell re-selection (OOS recovery)
        if dist > 3500: 
            self.serving_cell, dist = find_serving_cell(self.lat, self.lng, cells)
            serving = self.serving_cell

        neighbors = find_neighbors(self.lat, self.lng, cells, serving["cell_id"])
        self.last_neighbors = neighbors

        rsrp = compute_rsrp(dist)
        sinr = compute_sinr(rsrp, len(neighbors))
        rsrq = round(rsrp - 10 * math.log10(max(len(neighbors), 1) + 1) + random.gauss(0, 2), 1)
        velocity = self.speed_mps * 3.6  # km/h for DSO features
        ta = max(0, int(dist / 78))  # timing advance (78m per TA unit)
        # Best neighbor RSRP (with a slight bias to ensure HO success is possible in simulation)
        nb_dist = haversine_m(self.lat, self.lng, neighbors[0]["lat"], neighbors[0]["lng"]) if neighbors else dist + 500
        nb_rsrp = compute_rsrp(nb_dist)
        
        # If serving signal is weak, make the neighbor slightly more attractive to ensure success
        if rsrp < -100 and neighbors:
            nb_rsrp += random.uniform(2, 6) 
            
        delta_rsrp = round(nb_rsrp - rsrp, 2)


        return {
            # Core features expected by DSO pipeline
            "physical_cellid": serving["cell_id"],
            "rsrp": rsrp,
            "rsrq": round(rsrq, 1),
            "sinr": sinr,
            "ta": ta,
            "velocity": round(velocity, 2),
            "num_neighbors": len(neighbors),
            "delta_rsrp": delta_rsrp,
            "best_neighbor_rsrp": nb_rsrp,
            # Extras for logging
            "_ue_lat": self.lat,
            "_ue_lng": self.lng,
            "_ue_id": self.uid,
            "_scenario": self.scenario,
            "_serving_cell_id": serving["cell_id"],
        }

# ?? Log writer ?
def write_log(
    payload: dict,
    result: dict,
    *,
    executed_handover: bool,
    api_handover: bool,
):
    decision_source = str(result.get("decision_source", "unknown"))
    if executed_handover and not api_handover:
        decision_source = f"{decision_source}+early_execution"

    out = {
        **result,
        "handover_recommended": executed_handover,
        "api_handover_recommended": api_handover,
        "decision_source": decision_source,
    }

    entry = {
        "event_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "comparison": {
            "legacy_rsrp_floor_dbm": REACTIVE_LEGACY_RSRP_DB,
            "predictive_prob_floor": SIM_PREDICTIVE_PROB_FLOOR,
            "predictive_dso1_risk_floor": SIM_PREDICTIVE_DSO1_RISK,
            "serving_rsrp_dbm": payload.get("rsrp"),
            "still_above_legacy_floor": (payload.get("rsrp", -140) > REACTIVE_LEGACY_RSRP_DB),
        },
        "inputs": {
            "physical_cellid": payload.get("physical_cellid", 0),
            "rsrp":   payload.get("rsrp", -140),
            "rsrq":   payload.get("rsrq", -20),
            "sinr":   payload.get("sinr", 0),
            "ta":     payload.get("ta", 0),
            "velocity": payload.get("velocity", 0),
            "master_id": payload.get("_ue_id", "UE-000"),
            "scenario":  payload.get("_scenario", "unknown"),
            "num_neighbors": payload.get("num_neighbors", 0),
            "ue_lat": payload.get("_ue_lat"),
            "ue_lng": payload.get("_ue_lng"),
            "delta_rsrp": payload.get("delta_rsrp"),
        },
        "outputs": {
            "dso1_risk_score":      out.get("dso1_risk_score", 0),
            "dso3_cluster":         out.get("dso3_cluster", 0),
            "dso3_label":           out.get("dso3_label", "Unknown"),
            "dso4_probability":     out.get("dso4_probability", 0),
            "dso4_threshold":       out.get("dso4_threshold", 0),
            "handover_recommended": executed_handover,
            "api_handover_recommended": api_handover,
            "guidance_handover": executed_handover and not api_handover,
            "latency_ms":           out.get("latency_ms", 0),
            "decision_source":      out.get("decision_source", "unknown"),
        },
    }
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")

def trim_log():
    """Keep only last MAX_LOG_LINES in log."""
    p = Path(LOG_FILE)
    if not p.exists():
        return
    try:
        lines = p.read_text().strip().split("\n")
        if len(lines) > MAX_LOG_LINES:
            p.write_text("\n".join(lines[-MAX_LOG_LINES:]) + "\n")
    except Exception:
        pass


def write_handover(ho_event: dict):
    Path(HO_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(HO_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(ho_event, default=str) + "\n")


def trim_ho_log():
    p = Path(HO_LOG_FILE)
    if not p.exists():
        return
    try:
        lines = p.read_text(encoding="utf-8").strip().split("\n")
        if len(lines) > MAX_HO_LINES:
            p.write_text("\n".join(lines[-MAX_HO_LINES:]) + "\n")
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

def strip_internal(payload: dict) -> dict:
    """Remove internal _ keys before sending to API."""
    return {k: v for k, v in payload.items() if not k.startswith("_")}

# ?? Main ?
def main():
    print("[SIM] *** Production City Simulator -- Ruhr Region, Germany ***")
    print(f"[SIM] Spawning {N_UES} UEs across the network...")

    cells = load_cells(GPS_FILE)
    if not cells:
        print("[SIM] No cells loaded -- exiting")
        sys.exit(1)

    # Wait for API
    print("[SIM] Waiting for ML API...")
    for attempt in range(20):
        try:
            r = requests.get("http://localhost:8000/health", timeout=5)
            if r.status_code == 200:
                print(f"[SIM] API healthy: {r.json()}")
                break
        except Exception as e:
            print(f"[SIM] Attempt {attempt+1}/20 - not ready: {e}")
            time.sleep(3)
    else:
        print("[SIM] API not reachable. Exiting.")
        sys.exit(1)

    # Spawn UEs
    ues = [UE(cells) for _ in range(N_UES)]
    scenario_counts = {}
    for ue in ues:
        scenario_counts[ue.scenario] = scenario_counts.get(ue.scenario, 0) + 1
    print(f"[SIM] UE breakdown: {scenario_counts}")

    # Clear old log
    if Path(LOG_FILE).exists():
        Path(LOG_FILE).write_text("")
    print(f"[SIM] Starting simulation... ({N_UES} UEs, {len(cells)} cells)")
    print(
        f"[SIM] Legacy HO policy: RSRP < {REACTIVE_LEGACY_RSRP_DB} dBm + A3 {REACTIVE_LEGACY_A3_DB} dB | "
        f"Predictive: API HO or (P(ho)>={SIM_PREDICTIVE_PROB_FLOOR} or DSO1>={SIM_PREDICTIVE_DSO1_RISK}) "
        f"while RSRP > {REACTIVE_LEGACY_RSRP_DB} dBm & delta_rsrp>={SIM_PREDICTIVE_MIN_DELTA_RSRP}"
    )
    print(f"[SIM] Visit http://localhost:5173/app/operator to see the live map")

    tick = 0
    last_trim = 0

    while True:
        state = get_state()
        if state.get("status") == "paused":
            time.sleep(0.5)
            continue

        speed = float(state.get("speed", 1.0))
        dt = TICK_INTERVAL / max(speed, 0.1)
        tick += 1

        # Move all UEs
        for ue in ues:
            ue.move(TICK_INTERVAL)

        # Shadow legacy RAN for every UE (degraded-signal handovers)
        for ue in ues:
            try:
                leg = ue.step_shadow_legacy_handover(cells)
                if leg:
                    write_handover(leg)
            except Exception:
                pass

        # Sample a batch of UEs this tick (don't send all 60 every tick ? batched)
        # At 1x speed: ~15 UEs per tick ? 60 UEs complete in 4 ticks (~6s full refresh)
        batch_size = max(5, N_UES // 4)
        batch = random.sample(ues, min(batch_size, len(ues)))

        ok, err = 0, 0
        for ue in batch:
            payload = ue.measure(cells)
            if payload is None:
                continue
            api_payload = strip_internal(payload)
            try:
                r = requests.post(API_URL, json=api_payload, timeout=10)
                if r.status_code == 200:
                    res = r.json()
                    api_ho = bool(res.get("handover_recommended", False))
                    prob = float(res.get("dso4_probability", 0))
                    risk = float(res.get("dso1_risk_score", 0))
                    rsrp_now = float(payload.get("rsrp", -140))
                    d_rsrp = float(payload.get("delta_rsrp", 0))

                    early_candidate = (
                        rsrp_now > REACTIVE_LEGACY_RSRP_DB
                        and d_rsrp >= SIM_PREDICTIVE_MIN_DELTA_RSRP
                        and (
                            prob >= SIM_PREDICTIVE_PROB_FLOOR
                            or risk >= SIM_PREDICTIVE_DSO1_RISK
                        )
                    )
                    executed_ho = api_ho or early_candidate
                    if executed_ho and not ue.last_neighbors:
                        executed_ho = False

                    src_cell = int(payload.get("physical_cellid", 0))
                    tgt_cell = (
                        int(ue.last_neighbors[0]["cell_id"])
                        if ue.last_neighbors
                        else src_cell
                    )
                    if executed_ho and ue.last_neighbors and tgt_cell != src_cell:
                        write_handover(
                            {
                                "kind": "predictive_ho",
                                "policy": "ai_proactive",
                                "timestamp": time.strftime(
                                    "%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()
                                ),
                                "ue_id": ue.uid,
                                "scenario": ue.scenario,
                                "from_cell": src_cell,
                                "to_cell": tgt_cell,
                                "rsrp_at_ho": round(rsrp_now, 1),
                                "dso1_risk_score": round(risk, 4),
                                "dso4_probability": round(prob, 4),
                                "dso4_threshold": round(float(res.get("dso4_threshold", 0)), 4),
                                "api_handover_recommended": api_ho,
                                "executed_via_model_guidance": executed_ho and not api_ho,
                                "still_above_legacy_floor": rsrp_now > REACTIVE_LEGACY_RSRP_DB,
                                "legacy_rsrp_floor_dbm": REACTIVE_LEGACY_RSRP_DB,
                                "velocity": round(ue.speed_mps * 3.6, 2),
                            }
                        )

                    ue.last_predict_result = res
                    write_log(payload, res, executed_handover=executed_ho, api_handover=api_ho)
                    ok += 1
                    if executed_ho and ue.last_neighbors and tgt_cell != src_cell:
                        ue.serving_cell = ue.last_neighbors[0]
                else:
                    err += 1
            except Exception:
                err += 1

        # Trim log every 100 ticks
        if tick - last_trim > 100:
            trim_log()
            trim_ho_log()
            last_trim = tick

        if tick % 10 == 0:
            print(f"[SIM] Tick {tick:5d} | UEs: {N_UES} | Batch: {len(batch)} | OK: {ok} | ERR: {err} | Speed: {speed}x")

        time.sleep(max(0.2, dt))

if __name__ == "__main__":
    main()
