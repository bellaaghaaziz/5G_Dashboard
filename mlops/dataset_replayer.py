#!/usr/bin/env python3
"""
Real dataset replay engine — time-based per-device virtual clocks.

Each device advances at its own speed (DEVICE_SPEEDS) so that all three
look active and smooth despite wildly different measurement frequencies:
  - Samsung S22 (H-Bahn):   0.86s gaps  → 5×  real speed
  - 5G Modem (mobile):     61.4s gaps  → 200× real speed
  - Fixed Device (static): 893s  gaps  → 200× real speed

Samsung S22 has relative timestamps (0–86 400 s since midnight).
We normalise them to align with the Unix base of other devices.

On loop the device keeps its last trail entry visible — no blinking.

AI integration: once per tick per device, features are sent to the
inference API. Handover events are annotated with AI intel (was the model
proactive? headroom vs traditional reactive switch? DSO3 profile?).
"""

import json, time, os, math, threading, urllib.request
from pathlib import Path
from collections import deque
import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────
DATASET_PATH  = os.getenv("DATASET_PATH",   "DATASET/df_master_engineered.parquet")
CELL_GPS_PATH = os.getenv("CELL_GPS_PATH",  "logs/cell_gps.json")
MAP_PATH      = os.getenv("MAP_STATE_PATH", "logs/dataset_map_state.json")
HO_PATH       = os.getenv("HO_HISTORY_PATH","logs/dataset_handover_history.json")

# ── AI Prediction API ─────────────────────────────────────────────────────────
PREDICT_URL = os.getenv("PREDICT_URL", "http://host.docker.internal:8000/predict")
AI_ENABLED  = os.getenv("AI_ENABLED",  "1") == "1"
AI_TIMEOUT  = float(os.getenv("AI_TIMEOUT", "1.0"))
AI_BUF_MAX  = 40   # AI predictions kept per device (across ticks)

# ── Per-device replay speeds (× real time) ────────────────────────────────────
DEVICE_SPEEDS: dict = {
    "r0s_SM-S901B":     5,
    "armv7l_RM500Q-GL": 200,
    "armv7l_none":      200,
}
DEFAULT_SPEED  = 30

TICK_SEC       = 0.5        # write every 0.5 s
TRAIL_MAX      = 60         # path points kept per device
HISTORY_MAX    = 2000       # HO events kept in history file
MAX_ROWS_TICK  = 200        # safety cap: max rows consumed per device per tick

# A real LTE/5G handover completes in <1s (X2/Xn) — anything with a gap of
# more than HANDOVER_MAX_GAP_S between samples is treated as a reconnection
# (idle-mode cell reselection or signal loss + new attach), not a true HO.
HANDOVER_MAX_GAP_S = float(os.getenv("HANDOVER_MAX_GAP_S", "10.0"))

# ── Device metadata ───────────────────────────────────────────────────────────
COLORS = {
    "r0s_SM-S901B":      "#22d3ee",
    "armv7l_RM500Q-GL":  "#a855f7",
    "armv7l_none":       "#10b981",
}
NAMES = {
    "r0s_SM-S901B":      "Samsung S22 — H-Bahn",
    "armv7l_RM500Q-GL":  "5G Modem — Mobile",
    "armv7l_none":       "Fixed Device — Static",
}
SCENARIOS = {
    "r0s_SM-S901B":      "hbahn",
    "armv7l_RM500Q-GL":  "mobile",
    "armv7l_none":       "static",
}


# ── Load & preprocess ─────────────────────────────────────────────────────────

def load() -> dict:
    print("Loading dataset …", flush=True)
    df = pd.read_parquet(DATASET_PATH)

    with open(CELL_GPS_PATH) as f:
        gps: dict = json.load(f)

    def get_lat(c):
        if pd.isna(c): return None
        return gps.get(str(int(c)), {}).get("lat")
    def get_lng(c):
        if pd.isna(c): return None
        return gps.get(str(int(c)), {}).get("lng")

    df["_lat"] = df["physical_cellid"].map(get_lat)
    df["_lng"] = df["physical_cellid"].map(get_lng)
    df = df.dropna(subset=["_lat", "_lng"]).copy()

    # Normalise relative timestamps (Samsung S22: max ts < 1e9 → seconds since midnight)
    unix_base: float | None = None
    for uid, grp in df.groupby("master_id"):
        if float(grp["ts_num"].max()) >= 1e9:
            unix_base = float(grp["ts_num"].min())
            print(f"  Unix base: {unix_base:.0f}  ({uid})", flush=True)
            break

    if unix_base is not None:
        for uid in df["master_id"].unique():
            mask = df["master_id"] == uid
            if float(df.loc[mask, "ts_num"].max()) < 1e9:
                min_rel = float(df.loc[mask, "ts_num"].min())
                df.loc[mask, "ts_num"] = df.loc[mask, "ts_num"] - min_rel + unix_base
                print(f"  Normalised {uid}: +{unix_base - min_rel:.0f} s", flush=True)

    device_dfs: dict = {}
    for uid, grp in df.groupby("master_id"):
        uid = str(uid)
        ddf = grp.sort_values("ts_num").reset_index(drop=True)
        device_dfs[uid] = ddf
        ho_n = int((ddf["is_ho"] == 1).sum())
        speed = DEVICE_SPEEDS.get(uid, DEFAULT_SPEED)
        dur_s = float(ddf["ts_num"].iloc[-1]) - float(ddf["ts_num"].iloc[0])
        loop_min = round(dur_s / speed / 60, 1)
        print(f"  {uid}: {len(ddf):,} rows  {ho_n:,} HO  speed={speed}×  loop≈{loop_min} min", flush=True)

    if AI_ENABLED:
        print(f"\nAI integration enabled → {PREDICT_URL}", flush=True)
    else:
        print("\nAI integration disabled (AI_ENABLED=0)", flush=True)

    return device_dfs


# ── State writers ─────────────────────────────────────────────────────────────

def write_map(trails: dict, cursors: dict, device_dfs: dict) -> None:
    out = []
    for uid, trail in trails.items():
        if not trail:
            continue
        last     = trail[-1]
        avg_rsrp = round(sum(p["rsrp"] for p in trail) / len(trail), 1)
        total    = len(device_dfs[uid])
        cursor   = cursors[uid]
        out.append({
            "ue_id":    uid,
            "scenario": SCENARIOS.get(uid, "mobile"),
            "color":    COLORS.get(uid, "#94a3b8"),
            "name":     NAMES.get(uid, uid),
            "path":     trail,
            "stats": {
                "handover_count":     sum(1 for p in trail if p.get("is_handover")),
                "reconnection_count": sum(1 for p in trail if p.get("is_reconnection")),
                "ai_handovers":       0,
                "avg_rsrp":           avg_rsrp,
                "current_cell":       last["cell_id"],
                "current_rsrp":       last["rsrp"],
                "current_velocity":   last["velocity"],
            },
            "progress": {
                "cursor": cursor,
                "total":  total,
                "pct":    round(cursor / total * 100, 1) if total else 0,
            },
        })
    Path(MAP_PATH).write_text(json.dumps(out))


def flush_history(new_events: list) -> None:
    p = Path(HO_PATH)
    existing: list = []
    if p.exists():
        try:
            existing = json.loads(p.read_text())
        except Exception:
            existing = []
    existing.extend(new_events)
    p.write_text(json.dumps(existing[-HISTORY_MAX:]))


# ── AI feature builder ────────────────────────────────────────────────────────

def _safe(row, col: str, default: float = 0.0) -> float:
    try:
        v = row[col]
        return float(v) if not pd.isna(v) else default
    except (KeyError, TypeError):
        return default


def _build_features(uid: str, row, virt_now: float,
                    rsrp_h: deque, sinr_h: deque,
                    ho_vt: deque, cell_entry_vt) -> dict:
    """Build TelemetryInput dict from row + per-device rolling history."""
    rsrp = _safe(row, "rsrp", -95.0)
    sinr = _safe(row, "sinr",  10.0)
    rl, sl = list(rsrp_h), list(sinr_h)

    rsrp_lag1  = rl[-1] if rl else rsrp
    rsrp_d3    = rsrp - rl[-3] if len(rl) >= 3 else 0.0
    sinr_d3    = sinr - sl[-3] if len(sl) >= 3 else 0.0

    rsrp_vs_roll = (rsrp - sum(rl[-5:]) / 5) if len(rl) >= 5 else 0.0

    if len(rl) >= 10:
        m   = sum(rl[-10:]) / 10
        std = math.sqrt(sum((x - m) ** 2 for x in rl[-10:]) / 10)
    else:
        std = 1.0

    ho_count  = sum(1 for t in ho_vt if virt_now - t <= 60.0)
    time_last = (virt_now - ho_vt[-1]) if ho_vt else 100.0
    serv_age  = (virt_now - cell_entry_vt) if cell_entry_vt is not None else 50.0

    ts_dt = pd.Timestamp(float(row["ts_num"]), unit="s", tz="UTC")

    return {
        "rsrp":                rsrp,
        "rsrq":                _safe(row, "rsrq", -12.0),
        "sinr":                sinr,
        "cqi":                 _safe(row, "cqi",  9.0),
        "tx_power":            _safe(row, "tx_power", 23.0),
        "ta":                  _safe(row, "ta", 0.0),
        "velocity":            _safe(row, "velocity", 0.0),
        "rsrp_delta_3":        round(rsrp_d3, 2),
        "sinr_delta_3":        round(sinr_d3, 2),
        "rsrp_lag_1":          round(rsrp_lag1, 2),
        "rsrp_vs_rolling":     round(rsrp_vs_roll, 2),
        "rsrp_rolling_std_10": round(std, 2),
        "ho_count_60s":        float(ho_count),
        "time_since_last_ho":  round(time_last, 1),
        "serving_cell_age":    round(serv_age, 1),
        "hour_of_day":         float(ts_dt.hour),
        "day_of_week":         float(ts_dt.dayofweek),
        "cell_load_drop_flag": _safe(row, "cell_load_drop_flag", 0.0),
        # Neighbor features — feed DSO2 with real measurements from the dataset
        "num_neighbors":       _safe(row, "num_neighbors", 0.0),
        "best_neighbor_rsrp":  _safe(row, "best_neighbor_rsrp", -140.0),
        "mean_neighbor_rsrp":  _safe(row, "mean_neighbor_rsrp", -140.0),
        "neighbor_diversity":  _safe(row, "neighbor_diversity", 0.0),
        "physical_cellid":     float(int(row["physical_cellid"])),
        "master_id":           uid,
        "scenario":            SCENARIOS.get(uid, "mobile"),
    }


def _fire_ai(uid: str, features: dict, ai_buf: dict) -> None:
    """Background thread: POST to inference API and append result to ai_buf[uid]."""
    try:
        body = json.dumps(features).encode()
        req  = urllib.request.Request(
            PREDICT_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT) as resp:
            result = json.loads(resp.read())
        ai_buf[uid].append({
            "cell_id":              int(features["physical_cellid"]),
            "rsrp":                 features["rsrp"],
            "handover_recommended": bool(result.get("handover_recommended", False)),
            "dso4_probability":     float(result.get("dso4_probability",  0.0)),
            "dso1_risk_score":      float(result.get("dso1_risk_score",   0.0)),
            "dso2_target_rsrp":     float(result.get("dso2_target_rsrp", -140.0)),
            "dso2_num_candidates":  int(result.get("dso2_num_candidates", 0)),
            "dso3_cluster":         int(result.get("dso3_cluster", -1)),
            "dso3_label":           str(result.get("dso3_label",   "")),
            "decision_source":      str(result.get("decision_source", "")),
        })
    except Exception:
        pass  # AI unavailable — replay continues normally


# ── Replay loop ───────────────────────────────────────────────────────────────

def run() -> None:
    device_dfs = load()
    uids = list(device_dfs.keys())

    # Per-device virtual clock (dataset-time seconds)
    virt_now:   dict = {uid: float(df["ts_num"].iloc[0]) for uid, df in device_dfs.items()}
    virt_start: dict = {uid: float(df["ts_num"].iloc[0]) for uid, df in device_dfs.items()}
    virt_end:   dict = {uid: float(df["ts_num"].iloc[-1]) for uid, df in device_dfs.items()}
    speeds:     dict = {uid: DEVICE_SPEEDS.get(uid, DEFAULT_SPEED) for uid in uids}

    cursors:    dict = {uid: 0    for uid in uids}
    trails:     dict = {uid: []   for uid in uids}
    prev_cells: dict = {uid: None for uid in uids}
    prev_ts:    dict = {uid: None for uid in uids}  # last consumed sample's ts_num

    # Per-device rolling buffers for AI feature computation
    rsrp_hist     = {uid: deque(maxlen=30) for uid in uids}
    sinr_hist     = {uid: deque(maxlen=10) for uid in uids}
    ho_virt_ts    = {uid: deque(maxlen=50) for uid in uids}
    cell_entry_vt = {uid: None for uid in uids}
    ai_buf        = {uid: deque(maxlen=AI_BUF_MAX) for uid in uids}

    Path(HO_PATH).write_text("[]")
    write_map(trails, cursors, device_dfs)
    print(f"\nReplay running — {len(uids)} devices", flush=True)

    while True:
        new_events: list = []

        for uid in uids:
            df_dev = device_dfs[uid]
            speed  = speeds[uid]

            # Advance this device's virtual clock
            virt_now[uid] += TICK_SEC * speed

            # Loop device independently when it reaches the end
            if virt_now[uid] > virt_end[uid]:
                virt_now[uid] = virt_start[uid]
                cursors[uid]  = 0
                trails[uid]   = trails[uid][-1:] if trails[uid] else []
                prev_cells[uid] = None
                prev_ts[uid]    = None
                # Clear AI state on loop so old-cell entries don't bleed into new loop
                rsrp_hist[uid].clear()
                sinr_hist[uid].clear()
                ho_virt_ts[uid].clear()
                cell_entry_vt[uid] = None
                ai_buf[uid].clear()
                print(f"  {uid} → loop", flush=True)

            vt        = virt_now[uid]
            rows_done = 0

            # Consume rows up to virtual time (capped to avoid blocking)
            while cursors[uid] < len(df_dev) and rows_done < MAX_ROWS_TICK:
                if float(df_dev.iloc[cursors[uid]]["ts_num"]) > vt:
                    break

                row      = df_dev.iloc[cursors[uid]]
                cell     = int(row["physical_cellid"])
                rsrp     = float(row["rsrp"])     if not pd.isna(row["rsrp"])     else -140.0
                vel      = float(row["velocity"]) if not pd.isna(row["velocity"]) else 0.0
                ts_now   = float(row["ts_num"])

                # Time gap since the previous consumed sample for this device.
                # None on the very first row of a (re)play loop.
                gap_s = (ts_now - prev_ts[uid]) if prev_ts[uid] is not None else None

                cell_changed = (
                    prev_cells[uid] is not None
                    and prev_cells[uid] != cell
                )

                # Real handover: cell changed AND samples are temporally adjacent.
                # Reconnection: cell changed but the gap is too large for an
                # in-session handover (idle-mode cell reselection / lost link).
                real_ho   = cell_changed and gap_s is not None and gap_s <= HANDOVER_MAX_GAP_S
                is_reconn = cell_changed and gap_s is not None and gap_s >  HANDOVER_MAX_GAP_S

                point = {
                    "lat":             float(row["_lat"]),
                    "lng":             float(row["_lng"]),
                    "timestamp":       pd.Timestamp(ts_now, unit="s", tz="UTC").isoformat(),
                    "rsrp":            round(rsrp, 1),
                    "sinr":            0.0,
                    "velocity":        round(vel, 1),
                    "cell_id":         cell,
                    "is_handover":     real_ho,
                    "is_reconnection": is_reconn,
                    "is_recommended":  False,
                    "from_cell":       prev_cells[uid] if (real_ho or is_reconn) else None,
                    "gap_s":           round(gap_s, 1) if gap_s is not None else None,
                    "rsrp_gain":       None,
                }

                if real_ho and trails[uid]:
                    prev_rsrp         = trails[uid][-1]["rsrp"]
                    gain              = round(rsrp - prev_rsrp, 1)
                    point["rsrp_gain"] = gain

                    scenario = SCENARIOS.get(uid, "mobile")
                    if scenario == "hbahn":
                        reason = "mobility"
                    elif scenario == "static":
                        reason = "congestion"
                    else:
                        reason = "congestion" if vel < 2.0 else "mobility"

                    # ── AI intel: find first recommendation on old cell ──
                    old_cell = prev_cells[uid]
                    ai_on_old = [e for e in ai_buf[uid] if e["cell_id"] == old_cell]

                    # Oldest → newest, find first entry where AI recommended HO
                    first_rec  = next((e for e in ai_on_old if e["handover_recommended"]), None)
                    latest_rec = ai_on_old[-1] if ai_on_old else None

                    ai_prediction = None
                    if first_rec is not None:
                        headroom = round(first_rec["rsrp"] - prev_rsrp, 1)
                        ai_prediction = {
                            "recommended":           True,
                            "ai_rsrp":               round(first_rec["rsrp"], 1),
                            "actual_ho_rsrp":        round(prev_rsrp, 1),
                            "proactive_headroom_db": headroom,
                            "dso4_probability":      round(first_rec["dso4_probability"], 3),
                            "dso1_risk_score":       round(first_rec["dso1_risk_score"],  3),
                            "dso3_cluster":          first_rec["dso3_cluster"],
                            "dso3_label":            first_rec["dso3_label"],
                        }
                    elif latest_rec is not None:
                        ai_prediction = {
                            "recommended":           latest_rec["handover_recommended"],
                            "ai_rsrp":               round(latest_rec["rsrp"], 1),
                            "actual_ho_rsrp":        round(prev_rsrp, 1),
                            "proactive_headroom_db": None,
                            "dso4_probability":      round(latest_rec["dso4_probability"], 3),
                            "dso1_risk_score":       round(latest_rec["dso1_risk_score"],  3),
                            "dso3_cluster":          latest_rec["dso3_cluster"],
                            "dso3_label":            latest_rec["dso3_label"],
                        }

                    new_events.append({
                        "ue_id":        uid,
                        "name":         NAMES.get(uid, uid),
                        "color":        COLORS.get(uid, "#94a3b8"),
                        "timestamp":    point["timestamp"],
                        "event_type":   "handover",
                        "from_cell":    prev_cells[uid],
                        "to_cell":      cell,
                        "rsrp_before":  round(prev_rsrp, 1),
                        "rsrp_after":   round(rsrp, 1),
                        "rsrp_gain":    gain,
                        "velocity":     round(vel, 1),
                        "reason":       reason,
                        "scenario":     SCENARIOS.get(uid, "mobile"),
                        "gap_s":        round(gap_s, 1) if gap_s is not None else None,
                        "lat":          point["lat"],
                        "lng":          point["lng"],
                        "ai_prediction": ai_prediction,
                    })

                elif is_reconn and trails[uid]:
                    # Reconnection — long gap, treat as session reset, NOT a HO.
                    # Logged so the operator can see the device went idle and
                    # re-attached on a different cell, but excluded from HO KPIs.
                    prev_rsrp = trails[uid][-1]["rsrp"]
                    new_events.append({
                        "ue_id":        uid,
                        "name":         NAMES.get(uid, uid),
                        "color":        COLORS.get(uid, "#94a3b8"),
                        "timestamp":    point["timestamp"],
                        "event_type":   "reconnection",
                        "from_cell":    prev_cells[uid],
                        "to_cell":      cell,
                        "rsrp_before":  round(prev_rsrp, 1),
                        "rsrp_after":   round(rsrp, 1),
                        "rsrp_gain":    round(rsrp - prev_rsrp, 1),
                        "velocity":     round(vel, 1),
                        "reason":       "reconnection",
                        "scenario":     SCENARIOS.get(uid, "mobile"),
                        "gap_s":        round(gap_s, 1) if gap_s is not None else None,
                        "lat":          point["lat"],
                        "lng":          point["lng"],
                        "ai_prediction": None,  # AI didn't predict this — there was no continuous session
                    })

                # Update cell entry tracking when cell changes (for either case)
                if cell_changed:
                    cell_entry_vt[uid] = virt_now[uid]

                # Update rolling buffers (after HO detection, before prev_cells update)
                rsrp_hist[uid].append(rsrp)
                sinr_val = _safe(row, "sinr", 0.0)
                sinr_hist[uid].append(sinr_val)
                if real_ho:
                    ho_virt_ts[uid].append(virt_now[uid])

                prev_cells[uid] = cell
                prev_ts[uid]    = ts_now
                trails[uid].append(point)
                if len(trails[uid]) > TRAIL_MAX:
                    trails[uid] = trails[uid][-TRAIL_MAX:]

                cursors[uid] += 1
                rows_done    += 1

            # Fire AI call once per tick per device (background thread, non-blocking)
            if AI_ENABLED and rows_done > 0:
                last_row = df_dev.iloc[cursors[uid] - 1]
                feats    = _build_features(
                    uid, last_row, virt_now[uid],
                    rsrp_hist[uid], sinr_hist[uid],
                    ho_virt_ts[uid], cell_entry_vt[uid],
                )
                threading.Thread(
                    target=_fire_ai,
                    args=(uid, feats, ai_buf),
                    daemon=True,
                ).start()

        write_map(trails, cursors, device_dfs)
        if new_events:
            flush_history(new_events)

        time.sleep(TICK_SEC)


if __name__ == "__main__":
    run()
