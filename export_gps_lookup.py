"""
export_gps_lookup.py
Reads the real lat/lng per cell_index from the dataset and exports
a JSON lookup used by the frontend map.
"""
import json, os
import pandas as pd

BASE = r'C:\Users\azizb\Downloads\DATASET (1)\DATASET'
OUT  = r'C:\Users\azizb\5G_Dashboard\logs\cell_gps.json'

cell_gps: dict[str, dict] = {}

for scenario in ['mobile', 'hbahn', 'static']:
    path = os.path.join(BASE, scenario, scenario, 'cell_data.csv')
    if not os.path.exists(path):
        continue
    df = pd.read_csv(path, sep=';', low_memory=False)
    if 'latitude' not in df.columns or 'longitude' not in df.columns:
        print(f"  Skipping {scenario} — no lat/lng columns")
        continue
    df = df[['cell_index','latitude','longitude']].dropna()
    df['cell_index'] = df['cell_index'].astype(int).astype(str)

    agg = df.groupby('cell_index')[['latitude','longitude']].mean().reset_index()
    for _, row in agg.iterrows():
        cid = row['cell_index']
        if cid not in cell_gps:
            cell_gps[cid] = {
                'lat': round(row['latitude'], 6),
                'lng': round(row['longitude'], 6),
                'scenario': scenario,
            }

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(cell_gps, f, indent=2)

print(f"Exported {len(cell_gps)} cell GPS entries -> {OUT}")
for cid, v in list(cell_gps.items())[:5]:
    print(f"  cell {cid}: {v}")
