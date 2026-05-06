import json, os
import pandas as pd

BASE = r'DATASET\DATASET'
OUT  = r'logs\cell_gps.json'

cell_gps: dict[str, dict] = {}

for scenario in ['mobile', 'hbahn', 'static']:
    path = os.path.join(BASE, scenario, 'cell_data.csv')
    if not os.path.exists(path):
        print(f"  Path not found: {path}")
        continue
    
    print(f"Processing {scenario}...")
    # Check header first to see if columns exist
    header = pd.read_csv(path, sep=';', nrows=0)
    cols = ['cell_index', 'latitude', 'longitude']
    if not all(col in header.columns for col in cols):
        print(f"  Skipping {scenario} — missing required columns")
        continue

    # Use chunking to save memory
    chunks = pd.read_csv(path, sep=';', low_memory=False, chunksize=50000, usecols=cols)
    
    for chunk in chunks:
        df = chunk.dropna()
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
