import json

lines = open("logs/predictions.json").readlines()
city = [l for l in lines if "UE-" in l]
print("Total log lines:", len(lines), "| City UE entries:", len(city))
if city:
    e = json.loads(city[-1])
    inp = e["inputs"]
    out = e["outputs"]
    print("Latest UE:", inp["master_id"], "| Cell:", inp["physical_cellid"])
    print("RSRP:", inp["rsrp"], "| Risk:", out["dso4_probability"], "| HO:", out["handover_recommended"])
    print("GPS: lat=", inp.get("ue_lat"), "lng=", inp.get("ue_lng"))
    unique_ues = len(set(json.loads(l)["inputs"]["master_id"] for l in city))
    unique_cells = len(set(json.loads(l)["inputs"]["physical_cellid"] for l in city))
    print("Unique UEs:", unique_ues, "| Unique cells:", unique_cells)
else:
    print("No city UE entries yet - still warming up")
    if lines:
        last = json.loads(lines[-1])
        print("Last entry source:", last.get("inputs", {}).get("master_id", "unknown"))
