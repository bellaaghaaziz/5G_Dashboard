import pandas as pd, os, glob

BASE = r'C:\Users\azizb\Downloads\DATASET (1)\DATASET'

# Check static locations for GPS
for scenario in ['static', 'mobile', 'hbahn']:
    path = os.path.join(BASE, scenario, scenario, 'static_locations.csv')
    if os.path.exists(path):
        df = pd.read_csv(path, sep=';', nrows=5)
        print(f"\n=== {scenario}/static_locations ===")
        print("Columns:", list(df.columns))
        print(df.head(3).to_string())

# Also check cell_data for lat/lon columns
for scenario in ['static', 'mobile', 'hbahn']:
    path = os.path.join(BASE, scenario, scenario, 'cell_data.csv')
    if os.path.exists(path):
        df = pd.read_csv(path, sep=';', nrows=3)
        cols = [c for c in df.columns if any(x in c.lower() for x in ['lat','lon','gps','coord','x','y'])]
        print(f"\n=== {scenario}/cell_data GPS-like cols: {cols} ===")
        if cols:
            print(df[cols].head(3).to_string())
        else:
            print("All columns:", list(df.columns))
