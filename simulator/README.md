# City Network Simulator — CellPilot

This folder contains the network simulation engine that generates realistic 5G traffic for the live dashboard.

## Files

| File | Description |
|---|---|
| `run_city.py` | **★ Main simulator** — 60 concurrent UEs, 3GPP UMa path loss, parallel API calls |
| `simulate_city.py` | Extended simulator with more configuration options |
| `simulate_traffic.py` | Legacy dataset-replay simulator (one UE at a time, for testing) |
| `export_gps_lookup.py` | Extracts 2,283 cell GPS coordinates from the parquet dataset |
| `extract_gps.py` | Alternative GPS extractor |
| `check_city.py` | Verification script — checks log entries for city UE data |

## How to run

```bash
# Make sure the ML API is running first:
# cd ../mlops && uvicorn api:app --port 8000

# Run the city simulator (60 UEs)
python run_city.py

# You should see output like:
# [SIM] Loaded 2283 real cell towers in Ruhr region
# [SIM] Spawning 60 UEs...
# [SIM] UE breakdown: {'car': 24, 'pedestrian': 20, 'hbahn': 9, 'static': 7}
# [SIM] Tick    5 | Batch: 15 OK=15 ERR=0 | Speed: 1.0x
```

## UE Scenarios

| Type | Share | Speed | Behavior |
|---|---|---|---|
| 🚗 Car | ~40% | 18–72 km/h | Random routes, turning |
| 🚶 Pedestrian | ~30% | 2–5 km/h | Slow random walk |
| 🚋 H-Bahn train | ~15% | 90–216 km/h | Linear oscillating route |
| 🏢 Static | ~15% | 0 km/h | Fixed office/home/IoT |

## Signal Physics

The simulator uses the **3GPP TR 38.901 UMa NLOS path loss formula** (same formula used by Nokia/Ericsson):

```
Path_loss (dB) = 32.4 + 20·log₁₀(3.5 GHz) + 30·log₁₀(distance_m)
RSRP (dBm)     = 43 dBm (Tx power) − Path_loss + N(0, 4 dB)  [shadowing]
SINR (dB)      = RSRP − noise_floor + N(0, 2 dB)
```

Every UE finds its nearest real cell tower using the Haversine formula against **2,283 real GPS positions** from the German 5G dataset.

## Output

The simulator writes predictions to `../logs/predictions.json` via the FastAPI API. Each entry includes:
- `master_id` — UE identifier (e.g. "UE-023")
- `scenario` — car/pedestrian/hbahn/static
- `ue_lat`, `ue_lng` — real-time GPS position
- `rsrp`, `sinr` — computed signal quality
- `dso4_probability` — ML handover recommendation probability
- `handover_recommended` — final yes/no decision
