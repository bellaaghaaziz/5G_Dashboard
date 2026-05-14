"""
Append o1s_SM-G991B (Samsung S21 — Static) to df_master_engineered.parquet.
Run inside the kafka-producer container (or any env with pandas + pyarrow).
"""
import os
import numpy as np
import pandas as pd

BASE_PATH = os.environ.get("BASE_PATH", "/app/DATASET")
MAX_ROWS  = 100_000
STATIC_ID = "o1s_SM-G991B"
SCENARIO  = "static"


def to_ts_num(series: pd.Series) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    if s.dropna().median() > 2e9:   # milliseconds → seconds
        s = s / 1000.0
    return s


# ── 1. Cell data ──────────────────────────────────────────────────────────────
print("Loading static/cell_data.csv (chunked) …", flush=True)
chunks = []
total_found = 0
CHUNK = 200_000
for i, chunk in enumerate(pd.read_csv(
        f"{BASE_PATH}/static/static/cell_data.csv",
        sep=";", low_memory=False, chunksize=CHUNK)):
    hit = chunk[chunk["device"] == STATIC_ID]
    chunks.append(hit)
    total_found += len(hit)
    if (i + 1) % 5 == 0:
        print(f"  … chunk {i+1}, found {total_found:,} rows so far", flush=True)
    if total_found >= MAX_ROWS:
        break
cell = pd.concat(chunks, ignore_index=True)
print(f"  {len(cell):,} rows for {STATIC_ID} loaded", flush=True)

cell["ts_num"] = to_ts_num(cell["timestamp"])
cell["physical_cellid"] = pd.to_numeric(cell["physical_cellid"], errors="coerce")
cell = cell.dropna(subset=["ts_num", "physical_cellid"])
cell = cell.sort_values("ts_num").head(MAX_ROWS).reset_index(drop=True)
print(f"  Sampled to {len(cell):,} rows", flush=True)

# ── 2. Static GPS lookup (device fixed locations) ────────────────────────────
locs = pd.read_csv(f"{BASE_PATH}/static/static/static_locations.csv", sep=";")
gps_map = locs.set_index("username")[["latitude", "longitude", "altitude"]].to_dict("index")
cell["latitude"]  = cell["username"].map(lambda u: gps_map.get(str(u), {}).get("latitude",  0.0))
cell["longitude"] = cell["username"].map(lambda u: gps_map.get(str(u), {}).get("longitude", 0.0))
cell["altitude"]  = cell["username"].map(lambda u: gps_map.get(str(u), {}).get("altitude",  0.0))

# ── 3. Latency merge (chunked to avoid OOM) ────────────────────────────────
print("Loading static/latency_data.csv (chunked) …", flush=True)
try:
    lat_chunks, lat_found = [], 0
    for chunk in pd.read_csv(
            f"{BASE_PATH}/static/static/latency_data.csv",
            sep=";", low_memory=False, chunksize=200_000):
        hit = chunk[chunk["device"] == STATIC_ID]
        lat_chunks.append(hit)
        lat_found += len(hit)
        if lat_found >= MAX_ROWS * 5:
            break
    lat_df = pd.concat(lat_chunks, ignore_index=True)
    lat_df["ts_num"] = to_ts_num(lat_df["timestamp"])
    lat_df = lat_df.dropna(subset=["ts_num"]).sort_values("ts_num")
    lat_cols = ["ts_num"] + [c for c in ["mean_latency", "packet_loss", "min_latency", "max_latency"]
                              if c in lat_df.columns]
    cell = cell.sort_values("ts_num")
    cell = pd.merge_asof(cell, lat_df[lat_cols], on="ts_num", tolerance=2.0, direction="backward")
    cell["latency_is_imputed"] = cell["mean_latency"].isna().astype(int)
    med_lat = cell["mean_latency"].median()
    cell["mean_latency"] = cell["mean_latency"].fillna(med_lat if not np.isnan(med_lat) else 0.0)
    print(f"  {lat_found:,} latency rows merged", flush=True)
except Exception as exc:
    print(f"  Latency skipped: {exc}", flush=True)
    cell["mean_latency"]      = np.nan
    cell["latency_is_imputed"] = 1

# ── 4. Fixed fields ───────────────────────────────────────────────────────────
cell["master_id"]      = STATIC_ID
cell["scenario"]       = SCENARIO
cell["velocity"]       = 0.0
cell["bearing_delta"]  = 0.0
cell["velocity_delta"] = 0.0
cell["datarate"]       = np.nan
cell["target_future_datarate"] = np.nan

# Numeric coerce for signal columns
for col in ["rsrp", "rsrq", "sinr", "cqi", "ta", "tx_power", "ss_rsrp", "ss_sinr",
            "earfcn", "primary_bandwidth", "lte_mcs", "lte_ri"]:
    if col in cell.columns:
        cell[col] = pd.to_numeric(cell[col], errors="coerce")

# ── 5. Time features ──────────────────────────────────────────────────────────
cell = cell.sort_values("ts_num").reset_index(drop=True)
cell["datetime"]    = pd.to_datetime(cell["ts_num"], unit="s", utc=True)
cell["hour_of_day"] = cell["datetime"].dt.hour.astype(float)
cell["day_of_week"] = cell["datetime"].dt.dayofweek.astype(float)
cell["time_bin"]    = (cell["hour_of_day"] // 4).astype(int)

# ── 6. gap_s ─────────────────────────────────────────────────────────────────
cell["gap_s"] = cell["ts_num"].diff().fillna(0.0).clip(lower=0.0)

# ── 7. Handover detection ─────────────────────────────────────────────────────
cell["prev_cell"] = cell["physical_cellid"].shift(1)
changed = (cell["physical_cellid"] != cell["prev_cell"]) & cell["prev_cell"].notna()
cell["is_ho"] = (changed & (cell["gap_s"] <= 10.0)).astype(int)
cell.drop(columns=["prev_cell"], inplace=True)
cell["target_ho_flag"] = cell["is_ho"].shift(-1).fillna(0.0)

# ho_count_60s
cell["ho_count_60s"] = cell["is_ho"].rolling(60, min_periods=1).sum()

# time_since_last_ho
last_ts = None
tslh = []
for _, row in cell[["ts_num", "is_ho"]].iterrows():
    if row["is_ho"] == 1:
        last_ts = row["ts_num"]
    tslh.append(row["ts_num"] - last_ts if last_ts is not None else 999.0)
cell["time_since_last_ho"] = tslh
cell["rows_since_last_ho"] = (cell["is_ho"][::-1].cumsum())[::-1]

# serving_cell_age
ages, counter, prev_c = [], 0, None
for c in cell["physical_cellid"]:
    counter = 0 if c != prev_c else counter + 1
    ages.append(counter)
    prev_c = c
cell["serving_cell_age"] = ages

# ── 8. Signal delta / lag / rolling features ──────────────────────────────────
for col, n in [("rsrp", 3), ("sinr", 3), ("sinr", 5), ("cqi", 3)]:
    if col in cell.columns:
        cell[f"{col}_delta_{n}"] = cell[col].diff(n).fillna(0.0)

for col, n in [("rsrp", 1), ("rsrp", 5), ("rsrp", 10), ("rsrp", 20)]:
    if col in cell.columns:
        cell[f"{col}_lag_{n}"] = cell[col].shift(n).bfill()

if "rsrp" in cell.columns:
    cell["rsrp_rolling5"]       = cell["rsrp"].rolling(5,  min_periods=1).mean()
    cell["rsrp_rolling_std_10"] = cell["rsrp"].rolling(10, min_periods=1).std().fillna(0.0)
    cell["rsrp_rolling_std_20"] = cell["rsrp"].rolling(20, min_periods=1).std().fillna(0.0)
    cell["rsrp_vs_rolling"]     = cell["rsrp"] - cell["rsrp_rolling5"]

# ── 9. Target features ────────────────────────────────────────────────────────
if "rsrp" in cell.columns:
    cell["rsrp_future_5"]       = cell["rsrp"].shift(-5)
    cell["rsrp_future_15"]      = cell["rsrp"].shift(-15)
    cell["rsrp_slope_5"]        = (cell["rsrp_future_5"]  - cell["rsrp"]) / 5.0
    cell["rsrp_slope_15"]       = (cell["rsrp_future_15"] - cell["rsrp"]) / 15.0
    cell["rsrp_pct_drop"]       = (cell["rsrp"] - cell["rsrp_future_5"]) / cell["rsrp"].abs()
    cell["target_is_degrading"] = (cell["rsrp_future_5"] < cell["rsrp"] - 3.0).astype(float)

# ── 10. Neighbor features (no CSV available for static → NaN) ─────────────────
for col in ["num_neighbors", "best_neighbor_rsrp", "mean_neighbor_rsrp",
            "std_neighbor_rsrp", "num_neighbors_delta", "neighbor_diversity", "neighbor_gap"]:
    cell[col] = np.nan

# ── 11. Cell history features (no iperf for static → NaN) ────────────────────
for col in ["cell_hist_datarate_mean", "cell_hist_datarate_std", "cell_hist_rsrp_mean",
            "cell_hist_congestion_rate", "cell_load_drop_flag",
            "datarate_vs_hist_ratio", "rsrp_vs_hist_delta"]:
    cell[col] = np.nan
cell["cell_load_drop_flag"] = 0.0

# ── 12. ML output columns (filled by inference pipeline later) ────────────────
for col in ["dso3_cluster", "dso1_risk_score", "dso2_target_rsrp", "dso2_num_candidates"]:
    cell[col] = np.nan

# ── 13. Load master and append ────────────────────────────────────────────────
print("Loading existing df_master_engineered.parquet …", flush=True)
master = pd.read_parquet(f"{BASE_PATH}/df_master_engineered.parquet")
print(f"  Before: {len(master):,} rows — devices: {list(master['master_id'].unique())}", flush=True)

if STATIC_ID in master["master_id"].values:
    print(f"  Removing existing {STATIC_ID} rows …", flush=True)
    master = master[master["master_id"] != STATIC_ID].copy()

# Align schema
for col in master.columns:
    if col not in cell.columns:
        cell[col] = np.nan

cell = cell[list(master.columns)]    # keep same column order

combined = pd.concat([master, cell], ignore_index=True)
print(f"  After : {len(combined):,} rows — devices: {list(combined['master_id'].unique())}", flush=True)

combined.to_parquet(f"{BASE_PATH}/df_master_engineered.parquet", index=False)
print("Done — saved df_master_engineered.parquet", flush=True)
