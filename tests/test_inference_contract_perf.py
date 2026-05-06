import time

from fastapi.testclient import TestClient

import api


def _fake_artifacts():
    return {"feature_lists": {}}


def _fake_predict_single(inputs, artifacts):
    return {
        "dso1_risk_score": 0.42,
        "dso3_cluster": 1,
        "dso3_label": "H-Bahn (Rail)",
        "dso4_probability": 0.73,
        "dso4_threshold": 0.5,
        "handover_recommended": True,
        "decision_source": "calibrated_controller",
        "latency_ms": 1.5,
    }


def test_predict_contract_shape(monkeypatch):
    monkeypatch.setattr(api, "get_artifacts", _fake_artifacts)
    import src.model_pipeline as mp

    monkeypatch.setattr(mp, "predict_single", _fake_predict_single)
    client = TestClient(api.app)

    payload = {"rsrp": -94.0, "sinr": 12.0, "velocity": 10.0}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200

    body = response.json()
    expected_keys = {
        "dso1_risk_score",
        "dso3_cluster",
        "dso3_label",
        "dso4_probability",
        "dso4_threshold",
        "handover_recommended",
        "decision_source",
        "latency_ms",
    }
    assert expected_keys.issubset(body.keys())
    assert isinstance(body["handover_recommended"], bool)


def test_predict_latency_guardrail(monkeypatch):
    monkeypatch.setattr(api, "get_artifacts", _fake_artifacts)
    import src.model_pipeline as mp

    monkeypatch.setattr(mp, "predict_single", _fake_predict_single)
    client = TestClient(api.app)

    samples = 100
    payload = {"rsrp": -93.0, "sinr": 14.0, "velocity": 8.0}

    t0 = time.perf_counter()
    for _ in range(samples):
        response = client.post("/predict", json=payload)
        assert response.status_code == 200
    avg_ms = ((time.perf_counter() - t0) / samples) * 1000

    # CI guardrail for API path overhead under mocked inference.
    assert avg_ms < 75.0, f"Average /predict latency too high: {avg_ms:.2f} ms"
