import json
with open('logs/predictions.json', 'r') as f:
    lines = f.readlines()[-200:]

data = []
for l in lines:
    try:
        data.append(json.loads(l))
    except:
        pass

recs = [d for d in data if d.get('outputs', {}).get('handover_recommended')]
pos_delta = [d for d in recs if d.get('inputs', {}).get('delta_rsrp', 0) > 0]

print(f"Total Recommendations: {len(recs)}")
print(f"Successful (Delta > 0): {len(pos_delta)}")
if len(recs) > 0:
    print(f"Success Rate: {len(pos_delta)/len(recs)*100:.1f}%")
