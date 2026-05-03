"""
real_replay.py — Smooth GPS Replay for 5G Handover Dashboard
==============================================================
Creates 10 virtual users from the real dataset, each with their
own journey. Users SMOOTHLY move between cell towers — their
GPS position interpolates from one tower toward the next, so
on the map you literally see them "driving" between cells.

Users:
  - 4 Mobile users  (📱) — driving across the city
  - 3 H-Bahn users  (🚋) — riding the elevated rail
  - 3 Static users   (🏢) — fixed position, congestion handovers
"""

import sys
import time
import json
import random
import requests
import pandas as pd
import numpy as np
from pathlib import Path

DATASET_PATH = "DATASET/df_master_engineered.parquet"
API_URL = "http://localhost:8000/predict"
LOG_FILE = "logs/predictions.json"
CELL_GPS_FILE = "logs/cell_gps.json"

# ── Helpers ──────────────────────────────────────────────────

def log(msg):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode(), flush=True)


def load_cell_gps():
    try:
        with open(CELL_GPS_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def write_prediction_log(inputs, result, scenario, ue_id, ue_lat, ue_lng):
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
            "ue_lat": ue_lat,
            "ue_lng": ue_lng,
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


def cell_pos(cell_gps, cell_id):
    """Get (lat, lng) for a cell tower, or None."""
    g = cell_gps.get(str(int(cell_id)))
    if g:
        return g["lat"], g["lng"]
    return None, None


def build_smooth_journey(df_segment, cell_gps, static_pos=None):
    """
    Build a list of (row, lat, lng, cell_id, is_handover) steps
    with SMOOTH GPS interpolation between cell towers.

    For moving users: position gradually moves from current cell
    toward next cell, creating visible "driving" effect.

    For static users: stays at static_pos, only cell_id changes
    on congestion-based handovers.
    """
    df_segment = df_segment.sort_values("ts_num").dropna(subset=["physical_cellid"]).reset_index(drop=True)
    steps = []
    n = len(df_segment)

    for i in range(n):
        row = df_segment.iloc[i]
        cell_id = int(row["physical_cellid"])
        cur_lat, cur_lng = cell_pos(cell_gps, cell_id)
        if cur_lat is None:
            continue

        prev_cell = int(df_segment.iloc[i - 1]["physical_cellid"]) if i > 0 else cell_id
        is_handover = (cell_id != prev_cell)

        if static_pos:
            # Static user: stay at fixed position
            lat, lng = static_pos
        else:
            # Moving user: 100% continuous interpolation
            # Find prev_cell position
            prev_lat, prev_lng = cur_lat, cur_lng
            for j in range(i - 1, -1, -1):
                pc = int(df_segment.iloc[j]["physical_cellid"])
                if pc != cell_id:
                    pl, pg = cell_pos(cell_gps, pc)
                    if pl is not None:
                        prev_lat, prev_lng = pl, pg
                    break
            
            # Find next_cell position
            next_lat, next_lng = cur_lat, cur_lng
            for j in range(i + 1, n):
                nc = int(df_segment.iloc[j]["physical_cellid"])
                if nc != cell_id:
                    nl, ng = cell_pos(cell_gps, nc)
                    if nl is not None:
                        next_lat, next_lng = nl, ng
                    break

            # Find segment boundaries to calculate progress 'p'
            seg_start = i
            for j in range(i, -1, -1):
                if int(df_segment.iloc[j]["physical_cellid"]) == cell_id:
                    seg_start = j
                else:
                    break
            
            seg_end = i
            for j in range(i, n):
                if int(df_segment.iloc[j]["physical_cellid"]) == cell_id:
                    seg_end = j
                else:
                    break
            
            segment_len = max(1, seg_end - seg_start + 1)
            k = i - seg_start
            p = k / segment_len  # Progress from 0.0 to 1.0

            if p <= 0.5:
                # Interpolate from halfway(prev, cur) to cur
                t = p / 0.5
                start_lat = cur_lat + 0.5 * (prev_lat - cur_lat)
                start_lng = cur_lng + 0.5 * (prev_lng - cur_lng)
                end_lat = cur_lat
                end_lng = cur_lng
            else:
                # Interpolate from cur to halfway(cur, next)
                t = (p - 0.5) / 0.5
                start_lat = cur_lat
                start_lng = cur_lng
                end_lat = cur_lat + 0.5 * (next_lat - cur_lat)
                end_lng = cur_lng + 0.5 * (next_lng - cur_lng)

            lat = start_lat + t * (end_lat - start_lat)
            lng = start_lng + t * (end_lng - start_lng)

            # Add micro random offset to avoid exact overlap on rail lines
            rng = random.Random(i * 31 + cell_id)
            lat += rng.uniform(-0.0005, 0.0005)
            lng += rng.uniform(-0.0005, 0.0005)

        steps.append({
            "row": row,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "cell_id": cell_id,
            "is_handover": is_handover,
        })

    return steps


def wait_for_api():
    log("[REPLAY] Waiting for ML API at http://localhost:8000 ...")
    for attempt in range(30):
        try:
            r = requests.get("http://localhost:8000/health", timeout=3)
            if r.status_code == 200:
                log("[REPLAY] API is healthy!")
                return True
        except Exception:
            pass
        time.sleep(2)
    log("[REPLAY] API not reachable. Exiting.")
    return False


def send_prediction(row_data, scenario, ue_id, ue_lat, ue_lng):
    payload = {}
    for k, v in row_data.to_dict().items():
        if k in ("datetime", "time_bin", "scenario", "master_id"):
            continue
        if isinstance(v, (pd.Timestamp, np.datetime64)):
            continue
        if pd.isna(v):
            payload[k] = 0.0
        else:
            payload[k] = float(v) if isinstance(v, (int, float, np.integer, np.floating)) else 0.0

    payload["master_id"] = ue_id
    payload["scenario"] = scenario
    payload["ue_lat"] = ue_lat
    payload["ue_lng"] = ue_lng

    try:
        r = requests.post(API_URL, json=payload, timeout=5)
        if r.status_code == 200:
            return r.json(), payload
    except Exception:
        pass
    return None, payload


# ── Main ─────────────────────────────────────────────────────

def main():
    log("=" * 60)
    log("  5G HANDOVER REPLAY — Smooth GPS Visualization")
    log("=" * 60)

    df = pd.read_parquet(DATASET_PATH)
    cell_gps = load_cell_gps()
    log(f"[REPLAY] Dataset: {len(df)} rows | Cell GPS: {len(cell_gps)} towers")

    # ── Split dataset into user journeys ─────────────────────
    mobile_df = df[df["master_id"] == "r0s_SM-S901B"].sort_values("ts_num").dropna(subset=["physical_cellid"]).reset_index(drop=True)
    hbahn1_df = df[df["master_id"] == "armv7l_RM500Q-GL"].sort_values("ts_num").dropna(subset=["physical_cellid"]).reset_index(drop=True)
    hbahn2_df = df[df["master_id"] == "armv7l_none"].sort_values("ts_num").dropna(subset=["physical_cellid"]).reset_index(drop=True)

    # ── Create 10 virtual users from different journey segments ──
    SEG = 150  # steps per user journey

    def pick_segment(source_df, start_idx):
        end = min(start_idx + SEG, len(source_df))
        return source_df.iloc[start_idx:end].copy()

    # Find diverse starting points for mobile (spread across the trip)
    mobile_starts = [0, 20000, 45000, 60750]
    hbahn_starts = [0, 11150, 30000]

    users = []

    # 4 Mobile users — different parts of the city
    for i, start in enumerate(mobile_starts):
        seg = pick_segment(mobile_df, start)
        journey = build_smooth_journey(seg, cell_gps)
        if journey:
            users.append({
                "id": f"Mobile-Driver-{i+1:02d}",
                "scenario": "mobile",
                "emoji": "📱",
                "journey": journey,
            })

    # 3 H-Bahn users — different rail segments
    for i, start in enumerate(hbahn_starts[:2]):
        seg = pick_segment(hbahn1_df, start)
        journey = build_smooth_journey(seg, cell_gps)
        if journey:
            users.append({
                "id": f"HBahn-Train-{i+1:02d}",
                "scenario": "hbahn",
                "emoji": "🚋",
                "journey": journey,
            })
    # 3rd hbahn from second user
    seg = pick_segment(hbahn2_df, 0)
    journey = build_smooth_journey(seg, cell_gps)
    if journey:
        users.append({
            "id": "HBahn-Train-03",
            "scenario": "hbahn",
            "emoji": "🚋",
            "journey": journey,
        })

    # 3 Static users — pick segments where user stays on same cell longest
    # Place them at fixed positions near specific cells
    static_cells = [476, 301, 142]  # Well-known cells in the dataset
    for i, sc in enumerate(static_cells):
        # Find a segment from mobile user near this cell
        mask = mobile_df["physical_cellid"] == sc
        idxs = mobile_df[mask].index.tolist()
        if idxs:
            start = max(0, idxs[0] - 20)
            seg = pick_segment(mobile_df, start)
            slat, slng = cell_pos(cell_gps, sc)
            if slat:
                # Fixed position near the cell with small offset
                static_position = (slat + random.uniform(-0.001, 0.001),
                                   slng + random.uniform(-0.001, 0.001))
                journey = build_smooth_journey(seg, cell_gps, static_pos=static_position)
                if journey:
                    users.append({
                        "id": f"Static-Device-{i+1:02d}",
                        "scenario": "static",
                        "emoji": "🏢",
                        "journey": journey,
                    })

    log(f"[REPLAY] Created {len(users)} virtual users:")
    for u in users:
        ho_count = sum(1 for s in u["journey"] if s["is_handover"])
        log(f"  {u['emoji']} {u['id']:20s} | {len(u['journey']):4d} steps | {ho_count:3d} handovers")

    # ── Wait for API ─────────────────────────────────────────
    if not wait_for_api():
        sys.exit(1)

    # ── Clear old logs ───────────────────────────────────────
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    open(LOG_FILE, "w").close()
    log("[REPLAY] Cleared old prediction logs.\n")

    # ── Replay loop ──────────────────────────────────────────
    SCENARIO_DISPLAY = {"hbahn": "H-BAHN", "mobile": "MOBILE", "static": "STATIC"}
    tick = 0

    log("[REPLAY] ▶ Starting smooth replay with 10 users...")
    log("[REPLAY] Refresh http://localhost:5173 to see the map.\n")

    while True:
        for u in users:
            idx = tick % len(u["journey"])
            step = u["journey"][idx]
            row = step["row"]
            lat = step["lat"]
            lng = step["lng"]
            cell_id = step["cell_id"]
            is_ho = step["is_handover"]

            result, payload = send_prediction(row, u["scenario"], u["id"], lat, lng)
            if result is None:
                continue

            write_prediction_log(payload, result, u["scenario"], u["id"], lat, lng)

            ho_rec = result.get("handover_recommended", False)
            dso1 = result.get("dso1_risk_score", 0)
            dso4 = result.get("dso4_probability", 0)
            rsrp = float(row.get("rsrp", -140))
            display = SCENARIO_DISPLAY.get(u["scenario"], "???")

            if is_ho:
                prev_idx = max(0, idx - 1)
                prev_cell = u["journey"][prev_idx]["cell_id"]
                log(f"")
                log(f"  ╔══════════════════════════════════════════════════════╗")
                log(f"  ║  {u['emoji']} CELL HANDOVER — {display:8s} {u['id']:<22s}║")
                log(f"  ║  Cell {prev_cell:>4d} ──► Cell {cell_id:<4d}                           ║")
                log(f"  ║  RSRP: {rsrp:>6.0f} dBm | Risk: {dso1:.2f} | DSO4: {dso4:.2f}       ║")
                if ho_rec:
                    log(f"  ║  ⚡⚡⚡ AI RECOMMENDS THIS HANDOVER ⚡⚡⚡              ║")
                log(f"  ╚══════════════════════════════════════════════════════╝")
                log(f"")
            elif ho_rec:
                log(f"  {u['emoji']} [{display}] {u['id']} ⚡ AI HO REC | Cell {cell_id} | RSRP {rsrp:.0f} | Risk {dso1:.2f}")

        tick += 1

        # Periodic status
        if tick % 20 == 0:
            log(f"  ── tick {tick} | {len(users)} users active ──")

        # Loop notification
        min_journey = min(len(u["journey"]) for u in users)
        if tick > 0 and tick % min_journey == 0:
            log(f"\n[REPLAY] ── Shortest journey looped at tick {tick}. Continuing... ──\n")

        time.sleep(0.5)


if __name__ == "__main__":
    main()
