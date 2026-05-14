import json
import os
import time
import threading

import pandas as pd
from kafka import KafkaProducer

KAFKA_BROKER  = os.getenv("KAFKA_BROKER",  "localhost:9092")
TOPIC         = os.getenv("KAFKA_TOPIC",   "5g-telemetry")
DATASET_PATH  = os.getenv("DATASET_PATH",  "DATASET/df_master_engineered.parquet")
CELL_GPS_PATH = os.getenv("CELL_GPS_PATH", "logs/cell_gps.json")

EMIT_COLS = [
    # Identity + timing
    "master_id", "ts_num", "gap_s", "is_ho",
    # Serving cell radio (DSO1 + DSO4 inputs)
    "rsrp", "rsrq", "sinr", "cqi", "tx_power", "ta", "velocity",
    "rsrp_delta_3", "sinr_delta_3",
    # Cell load (DSO2 + DSO4 inputs)
    "cell_load_drop_flag", "cell_hist_congestion_rate",
    # Neighbor quality — enables non-RSRP-only DSO2 inference
    "num_neighbors", "best_neighbor_rsrp", "mean_neighbor_rsrp",
    "std_neighbor_rsrp", "neighbor_gap", "neighbor_diversity",
    # GPS (map position)
    "physical_cellid", "_lat", "_lng",
]

SCENARIOS = {
    "armv7l_RM500Q-GL":   "hbahn",
    "armv7l_none":        "hbahn",
    "r0s_SM-S901B":       "mobile",
    "o1s_SM-G991B":       "static",
}
COLORS = {
    "armv7l_RM500Q-GL":   "#22d3ee",   # cyan  — H-Bahn modem
    "armv7l_none":        "#f59e0b",   # amber — H-Bahn ARM device
    "r0s_SM-S901B":       "#a855f7",   # purple — mobile Samsung S22
    "o1s_SM-G991B":       "#10b981",   # green  — static Samsung S21
}
NAMES = {
    "armv7l_RM500Q-GL":   "Quectel 5G Modem — H-Bahn",
    "armv7l_none":        "ARM Device — H-Bahn",
    "r0s_SM-S901B":       "Samsung S22 — Mobile",
    "o1s_SM-G991B":       "Samsung S21 — Static",
}


def load_devices() -> dict:
    print(f"Loading dataset from {DATASET_PATH} …", flush=True)
    df = pd.read_parquet(DATASET_PATH)

    with open(CELL_GPS_PATH) as f:
        gps: dict = json.load(f)

    def get_lat(c):
        if pd.isna(c):
            return None
        return gps.get(str(int(c)), {}).get("lat")

    def get_lng(c):
        if pd.isna(c):
            return None
        return gps.get(str(int(c)), {}).get("lng")

    df["_lat"] = df["physical_cellid"].map(get_lat)
    df["_lng"] = df["physical_cellid"].map(get_lng)
    df = df.dropna(subset=["_lat", "_lng"]).copy()

    # Normalise Samsung S22 relative timestamps to Unix time
    unix_base = None
    for uid, grp in df.groupby("master_id"):
        if float(grp["ts_num"].max()) >= 1e9:
            unix_base = float(grp["ts_num"].min())
            break

    if unix_base is not None:
        for uid in df["master_id"].unique():
            mask = df["master_id"] == uid
            if float(df.loc[mask, "ts_num"].max()) < 1e9:
                min_rel = float(df.loc[mask, "ts_num"].min())
                df.loc[mask, "ts_num"] = df.loc[mask, "ts_num"] - min_rel + unix_base
                print(f"  Normalised {uid}: shifted by {unix_base - min_rel:.0f}s", flush=True)

    # Ensure gap_s exists; derive from ts_num differences if missing
    if "gap_s" not in df.columns:
        df = df.sort_values(["master_id", "ts_num"])
        df["gap_s"] = df.groupby("master_id")["ts_num"].diff().fillna(0.0)

    devices = {}
    for uid, grp in df.groupby("master_id"):
        uid = str(uid)
        ddf = grp.sort_values("ts_num").reset_index(drop=True)
        # Keep only the columns we emit (intersect with what exists)
        available = [c for c in EMIT_COLS if c in ddf.columns]
        devices[uid] = ddf[available].copy()
        print(
            f"  {uid}: {len(ddf):,} rows  "
            f"scenario={SCENARIOS.get(uid, 'unknown')}  "
            f"avg_gap={ddf['gap_s'].mean():.2f}s",
            flush=True,
        )

    return devices


def device_thread(uid: str, df: pd.DataFrame, producer: KafkaProducer) -> None:
    scenario = SCENARIOS.get(uid, "mobile")
    print(f"[{scenario}] starting stream for {uid} ({len(df):,} rows)", flush=True)

    loop_count = 0
    while True:
        loop_count += 1
        for idx in range(len(df)):
            row = df.iloc[idx]

            # Real-world pacing: sleep for the gap since previous measurement
            gap = float(row.get("gap_s", 0.0))
            sleep_s = max(0.0, min(gap, 30.0))  # clamp: never sleep > 30s
            if sleep_s > 0:
                time.sleep(sleep_s)

            msg = {col: _serialize(row[col]) for col in df.columns}
            msg["scenario"] = scenario
            msg["loop"] = loop_count

            producer.send(
                TOPIC,
                key=uid.encode("utf-8"),
                value=msg,
            )

        print(f"[{scenario}] loop {loop_count} complete — restarting", flush=True)
        # Brief pause between loops so the map doesn't jump discontinuously
        time.sleep(1.0)


def _serialize(val):
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        return val
    return str(val)


def main() -> None:
    print(f"Kafka producer starting → {KAFKA_BROKER} / {TOPIC}", flush=True)

    _sasl: dict = {}
    if os.getenv("KAFKA_SASL_ENABLED", "false").lower() == "true":
        _sasl = {
            "security_protocol": "SASL_SSL",
            "sasl_mechanism":    "PLAIN",
            "sasl_plain_username": "$ConnectionString",
            "sasl_plain_password": os.getenv("KAFKA_CONNECTION_STRING", ""),
        }
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BROKER,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda k: k if isinstance(k, bytes) else k.encode("utf-8"),
        acks="all",
        retries=5,
        retry_backoff_ms=500,
        **_sasl,
    )

    devices = load_devices()

    threads = []
    for uid, df in devices.items():
        t = threading.Thread(
            target=device_thread,
            args=(uid, df, producer),
            daemon=True,
            name=f"producer-{uid}",
        )
        t.start()
        threads.append(t)

    print(f"Streaming {len(threads)} device(s) to topic '{TOPIC}' at real-world speed.", flush=True)

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("Shutting down producer.", flush=True)
        producer.flush()
        producer.close()


if __name__ == "__main__":
    main()
