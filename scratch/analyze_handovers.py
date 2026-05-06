"""Analyze handover patterns in the replay tracks."""
import pandas as pd

df = pd.read_parquet('logs/ue_replay_tracks.parquet')

for uid in df['master_id'].unique():
    sub = df[df['master_id'] == uid].reset_index(drop=True)
    changes = 0
    for i in range(1, len(sub)):
        if sub['physical_cellid'].iloc[i] != sub['physical_cellid'].iloc[i-1]:
            changes += 1
    unique_cells = sub['physical_cellid'].nunique()
    print(f"{uid}: {changes} handovers across {unique_cells} unique cells in {len(sub)} rows ({sub.iloc[0]['scenario']})")

# Show first 5 handovers of first UE
uid = df['master_id'].unique()[0]
sub = df[df['master_id'] == uid].reset_index(drop=True)
print(f"\nFirst 10 handovers for {uid}:")
count = 0
for i in range(1, len(sub)):
    if sub['physical_cellid'].iloc[i] != sub['physical_cellid'].iloc[i-1]:
        row = sub.iloc[i]
        prev = sub.iloc[i-1]
        print(f"  Row {i}: Cell {int(prev['physical_cellid'])} -> {int(row['physical_cellid'])} | pos=({row['ue_lat']:.4f},{row['ue_lng']:.4f}) | RSRP={row['rsrp']:.0f}")
        count += 1
        if count >= 10:
            break
