import json
with open('logs/predictions.json', 'r') as f:
    lines = f.readlines()[-50:]
for l in lines:
    d = json.loads(l)
    print(f"Risk: {d.get('dso1_risk_score',0):.3f} | Prob: {d.get('dso4_probability',0):.3f} | HO: {d.get('handover_recommended',False)} | RSRP: {d.get('inputs',{}).get('rsrp',0):.1f} | SINR: {d.get('inputs',{}).get('sinr',0):.1f}")
