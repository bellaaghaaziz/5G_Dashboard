"""
run_city.py - Minimal city simulator launcher (no health check wait loop)
Skips the slow health check and directly starts the 60-UE simulation.
"""
import json, math, random, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

# ── Config
API_URL   = "http://localhost:8000/predict"
LOG_FILE  = "logs/predictions.json"
GPS_FILE  = "logs/cell_gps.json"
STATE_FILE = "logs/playback_state.json"
LAT_MIN, LAT_MAX = 51.40, 51.60
LNG_MIN, LNG_MAX = 7.15,  7.60
N_UES = 60
TICK_INTERVAL = 1.5
MAX_LOG_LINES = 2000

def log(msg):
    print(msg, flush=True)

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((phi2-phi1)/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(math.radians(lng2-lng1)/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def compute_rsrp(dist_m, tx=43.0):
    d = max(10, dist_m)
    pl = 32.4 + 20*math.log10(3.5) + 30*math.log10(d)
    return max(-140, min(-40, round(tx - pl + random.gauss(0, 4), 1)))

def compute_sinr(rsrp, n_nb):
    return round(max(-10, min(30, rsrp - (-100 + 10*math.log10(max(n_nb,1))) + random.gauss(0,2))), 1)

# Load cells
data = json.load(open(GPS_FILE))
cells = [{"cell_id": int(k), "lat": v["lat"], "lng": v["lng"]}
         for k, v in data.items()
         if LAT_MIN <= v["lat"] <= LAT_MAX and LNG_MIN <= v["lng"] <= LNG_MAX]
log(f"[SIM] Loaded {len(cells)} real cell towers in Ruhr region")

# UE movement profiles
PROFILES = [
    ("pedestrian", 0.30, (0.5, 1.5), 0.15),
    ("car",        0.40, (5, 20),    0.08),
    ("hbahn",      0.15, (25, 60),   0.02),
    ("static",     0.15, (0, 0),     0.00),
]
names    = [p[0] for p in PROFILES]
weights  = [p[1] for p in PROFILES]
speed_r  = {p[0]: p[2] for p in PROFILES}
dir_chg  = {p[0]: p[3] for p in PROFILES}

class UE:
    _n = 0
    def __init__(self):
        UE._n += 1
        self.uid = f"UE-{UE._n:03d}"
        self.scenario = random.choices(names, weights=weights)[0]
        sp = speed_r[self.scenario]
        self.speed = random.uniform(sp[0], sp[1])
        self.heading = random.uniform(0, 360)
        self.lat = random.uniform(LAT_MIN, LAT_MAX)
        self.lng = random.uniform(LNG_MIN, LNG_MAX)
        self.phase = random.uniform(0, 60)

    def move(self, dt):
        if self.scenario == "static":
            return
        if random.random() < dir_chg[self.scenario]:
            self.heading += random.gauss(0, 40)
        if self.scenario == "hbahn":
            self.phase += dt
            if self.phase > 180:
                self.heading = (self.heading + 180) % 360
                self.phase = 0
        d = self.speed * dt
        r = math.radians(self.heading)
        self.lat += (d * math.cos(r)) / 111320
        self.lng += (d * math.sin(r)) / (111320 * math.cos(math.radians(self.lat)))
        if not (LAT_MIN < self.lat < LAT_MAX):
            self.heading = 180 - self.heading
            self.lat = max(LAT_MIN+0.001, min(LAT_MAX-0.001, self.lat))
        if not (LNG_MIN < self.lng < LNG_MAX):
            self.heading = 360 - self.heading
            self.lng = max(LNG_MIN+0.001, min(LNG_MAX-0.001, self.lng))

    def measure(self):
        best, bd = None, float("inf")
        for c in cells:
            d = haversine_m(self.lat, self.lng, c["lat"], c["lng"])
            if d < bd:
                bd = d; best = c
        if not best:
            return None, None
        nb = sorted([c for c in cells if c["cell_id"] != best["cell_id"]],
                    key=lambda c: haversine_m(self.lat, self.lng, c["lat"], c["lng"]))[:6]
        rsrp = compute_rsrp(bd)
        sinr = compute_sinr(rsrp, len(nb))
        rsrq = round(rsrp - 10*math.log10(max(len(nb),1)+1) + random.gauss(0,2), 1)
        ta   = max(0, int(bd/78))
        nb_rsrp = compute_rsrp(haversine_m(self.lat, self.lng, nb[0]["lat"], nb[0]["lng"])) if nb else rsrp-5
        api_payload = {
            "physical_cellid": best["cell_id"],
            "rsrp": rsrp, "rsrq": rsrq, "sinr": sinr,
            "ta": ta, "velocity": round(self.speed*3.6, 2),
            "num_neighbors": len(nb),
            "delta_rsrp": round(nb_rsrp - rsrp, 2),
            "best_neighbor_rsrp": nb_rsrp,
            # UE metadata — logged by elk_logger into inputs
            "master_id": self.uid,
            "scenario": self.scenario,
            "ue_lat": round(self.lat, 6),
            "ue_lng": round(self.lng, 6),
        }
        return api_payload

def write_log(payload, meta, result):
    entry = {
        "event_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "inputs": {
            "physical_cellid": payload["physical_cellid"],
            "rsrp": payload["rsrp"], "rsrq": payload["rsrq"],
            "sinr": payload["sinr"], "ta": payload["ta"],
            "velocity": payload["velocity"],
            "master_id": meta["_ue_id"],
            "scenario": meta["_scenario"],
            "num_neighbors": payload["num_neighbors"],
            "ue_lat": meta["_ue_lat"],
            "ue_lng": meta["_ue_lng"],
        },
        "outputs": {
            "dso1_risk_score":      result.get("dso1_risk_score", 0),
            "dso3_cluster":         result.get("dso3_cluster", 0),
            "dso3_label":           result.get("dso3_label", "Unknown"),
            "dso4_probability":     result.get("dso4_probability", 0),
            "handover_recommended": result.get("handover_recommended", False),
            "latency_ms":           result.get("latency_ms", 0),
        },
    }
    Path(LOG_FILE).parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")

def get_speed():
    try:
        if Path(STATE_FILE).exists():
            return float(json.load(open(STATE_FILE)).get("speed", 1.0))
    except Exception:
        pass
    return 1.0

def trim_log():
    p = Path(LOG_FILE)
    if not p.exists(): return
    try:
        lines = p.read_text().strip().split("\n")
        if len(lines) > MAX_LOG_LINES:
            p.write_text("\n".join(lines[-MAX_LOG_LINES:]) + "\n")
    except Exception:
        pass

# ── Main ──────────────────────────────────────────────────────────────────────
log("[SIM] *** Production City Simulator - Ruhr Region, Germany ***")
log(f"[SIM] Spawning {N_UES} UEs...")
ues = [UE() for _ in range(N_UES)]
counts = {}
for ue in ues:
    counts[ue.scenario] = counts.get(ue.scenario, 0) + 1
log(f"[SIM] UE breakdown: {counts}")

# Clear log
if Path(LOG_FILE).exists():
    Path(LOG_FILE).write_text("")
log("[SIM] Starting simulation - open http://localhost:5173/app/operator")

tick = 0
last_trim = 0

while True:
    speed = get_speed()
    tick += 1

    for ue in ues:
        ue.move(TICK_INTERVAL)

    batch_size = max(8, N_UES // 4)
    batch = random.sample(ues, min(batch_size, len(ues)))

    ok = err = 0
    def send_one(ue_item):
        ue = ue_item
        payload = ue.measure()
        if payload is None:
            return False
        try:
            r = requests.post(API_URL, json=payload, timeout=8)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        return False

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(send_one, ue) for ue in batch]
        for f in as_completed(futures):
            if f.result(): ok += 1
            else: err += 1

    if tick - last_trim > 80:
        trim_log()
        last_trim = tick

    if tick % 5 == 0:
        log(f"[SIM] Tick {tick:4d} | Batch: {len(batch)} OK={ok} ERR={err} | Speed: {speed}x")

    time.sleep(max(0.2, TICK_INTERVAL / max(speed, 0.1)))
