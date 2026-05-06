import json
with open('logs/predictions.json', 'r') as f:
    lines = f.readlines()[-20:]

for l in lines:
    try:
        data = json.loads(l)
        inputs = data.get('inputs', {})
        outputs = data.get('outputs', {})
        print(f"RSRP: {inputs.get('rsrp'):.1f} | Risk: {outputs.get('dso1_risk_score'):.3f} | Prob: {outputs.get('dso4_probability'):.3f} | Rec: {outputs.get('handover_recommended')} | Source: {outputs.get('decision_source')}")
    except:
        pass
