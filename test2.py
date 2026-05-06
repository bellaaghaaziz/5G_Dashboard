import json
import traceback

print("Checking predictions...")
valid_preds = []
try:
    with open('logs/predictions.json', 'r') as f:
        lines = f.readlines()
    for l in lines[-100:]:
        try:
            d = json.loads(l.strip())
            valid_preds.append(d)
        except Exception:
            pass
    
    for d in valid_preds[-20:]:
        risk = d.get('outputs', {}).get('dso1_risk_score', 0)
        prob = d.get('outputs', {}).get('dso4_probability', 0)
        ho = d.get('outputs', {}).get('handover_recommended', False)
        rsrp = d.get('inputs', {}).get('rsrp', 0)
        delta3 = d.get('inputs', {}).get('rsrp_delta_3', 0)
        print(f"Risk: {risk:.3f} | Prob: {prob:.3f} | HO: {ho} | RSRP: {rsrp} | d3: {delta3}")
        
    ho_count = sum(1 for d in valid_preds if d.get('outputs', {}).get('handover_recommended', False))
    print(f"\nTotal HO recommended in last {len(valid_preds)} logs: {ho_count}")
except Exception as e:
    traceback.print_exc()
