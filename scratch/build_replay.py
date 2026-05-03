"""
build_replay.py — Export real UE GPS tracks from raw dataset CSVs
into logs/ue_replay_tracks.parquet for use by replay_city.py.
"""
import pandas as pd
import os

BASE = r'C:\Users\azizb\Downloads\DATASET (1)\DATASET'

frames = []
for scenario in ['mobile', 'hbahn']:
    path = os.path.join(BASE, scenario, scenario, 'cell_data.csv')
    needed = ['physical_cellid', 'latitude', 'longitude', 'rsrp', 'rsrq',
              'sinr', 'ta', 'velocity', 'bearing', 'device']
    df = pd.read_csv(path, sep=';', usecols=needed, low_memory=False)
    df = df.dropna(subset=['physical_cellid', 'latitude', 'longitude'])
    df['scenario'] = scenario
    df['physical_cellid'] = df['physical_cellid'].astype(int)
    frames.append(df)
    devs = df['device'].nunique()
    rows = len(df)
    print(f'[{scenario}] rows={rows} | devices={devs}')

full = pd.concat(frames, ignore_index=True)
print(f'\nTotal rows: {len(full)} | Total devices: {full["device"].nunique()}')
print(full[["device", "scenario"]].drop_duplicates().to_string())

# Rename for consistency
full = full.rename(columns={
    'latitude': 'ue_lat',
    'longitude': 'ue_lng',
    'device': 'master_id',
    'bearing': 'heading',
})

full = full[[
    'master_id', 'scenario', 'ue_lat', 'ue_lng',
    'physical_cellid', 'rsrp', 'rsrq', 'sinr',
    'ta', 'velocity', 'heading'
]]

out = r'C:\Users\azizb\5G_Dashboard\logs\ue_replay_tracks.parquet'
full.to_parquet(out, index=False)
print(f'\nSaved -> {out} ({len(full)} rows)')
print(full.head(5).to_string())
