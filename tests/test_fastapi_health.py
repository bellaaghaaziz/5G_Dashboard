import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def _import_app():
    """
    Import FastAPI app from repo root `api.py`.
    In CI we avoid running heavy model loading; tests only hit lightweight endpoints.
    """
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    import api  # type: ignore

    return api.app


def test_health_endpoint_works():
    app = _import_app()
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert "uptime_seconds" in body


def test_models_info_endpoint_works():
    """
    This endpoint requires model artifacts, so we only assert it doesn't 500.
    If artifacts aren't present in CI, it may still succeed because repo includes pickles.
    """
    app = _import_app()
    client = TestClient(app)
    r = client.get("/models/info")
    assert r.status_code == 200
    body = r.json()
    assert "dso1" in body and "dso4" in body

