import json
import os
from pathlib import Path


def test_elk_logger_writes_jsonl(tmp_path, monkeypatch):
    # Make sure we don't touch real repo logs in tests
    monkeypatch.chdir(tmp_path)

    import sys
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))

    from elk_logger import log_prediction  # type: ignore

    inputs = {"rsrp": -95.0, "sinr": 10.0, "velocity": 3.0, "datarate": 40.0, "master_id": "ue-1"}
    outputs = {"latency_ms": 12.3, "handover_recommended": True, "dso4_probability": 0.91}

    log_prediction(inputs, outputs)

    p = Path("logs/predictions.json")
    assert p.exists()
    lines = p.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    doc = json.loads(lines[0])
    assert "inputs" in doc and "outputs" in doc
    assert doc["handover_recommended"] is True

