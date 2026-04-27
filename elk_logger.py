"""
src/elk_logger.py — Atelier 7: Elasticsearch + Kibana Logging
==============================================================
Sends prediction events and model metrics to Elasticsearch so
Kibana can visualise them as real-time dashboards.

Every call to /predict in the FastAPI server calls log_prediction().
Every training run calls log_training_run().

Index schema
──────────────────────────────────────────────────────────────
predictions-5g      — one doc per /predict call
  @timestamp        ISO timestamp
  inputs.*          all telemetry features
  outputs.*         all DSO predictions
  latency_ms        inference time
  handover_recommended  bool

training-runs-5g    — one doc per training run
  @timestamp
  run_id
  metrics.*         all DSO evaluation metrics
  params.*          hyperparameters
"""

from __future__ import annotations

import datetime
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

# ── Elasticsearch client (optional dependency) ─────────────────────────────
try:
    from elasticsearch import Elasticsearch
    _ES_AVAILABLE = True
except ImportError:
    _ES_AVAILABLE = False
    log.warning("elasticsearch-py not installed — ELK logging disabled. "
                "Run: pip install elasticsearch")

ES_HOST  = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ES_INDEX_PREDICTIONS = "predictions-5g"
ES_INDEX_TRAINING    = "training-runs-5g"

_client: "Elasticsearch | None" = None


def _get_client():
    global _client
    if not _ES_AVAILABLE:
        return None
    if _client is None:
        try:
            _client = Elasticsearch(ES_HOST, request_timeout=5)
            if not _client.ping():
                log.warning("Elasticsearch not reachable at %s — logging disabled", ES_HOST)
                _client = None
        except Exception as e:
            log.warning("Failed to connect to Elasticsearch: %s", e)
    return _client


def _now() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def log_prediction(inputs: dict[str, Any], outputs: dict[str, Any]) -> None:
    """
    Log one prediction event.
    - Always writes a JSON line to logs/predictions.json (for Filebeat).
    - Optionally indexes to Elasticsearch if reachable.

    Parameters
    ----------
    inputs  : the TelemetryInput dict
    outputs : the PredictionResponse dict
    """
    import json as _json
    from pathlib import Path as _Path

    doc = {
        "@timestamp": _now(),
        "inputs":     inputs,
        "outputs":    outputs,
        "latency_ms": outputs.get("latency_ms", 0),
        "handover_recommended": outputs.get("handover_recommended", False),
        "dso1_risk_score":   outputs.get("dso1_risk_score"),
        "dso2_neighbor_gain": outputs.get("dso2_neighbor_gain"),
        "dso3_cluster":       outputs.get("dso3_cluster"),
        "dso4_probability":   outputs.get("dso4_probability"),
        # Key radio features promoted to top level for easy Kibana filtering
        "rsrp":     inputs.get("rsrp"),
        "sinr":     inputs.get("sinr"),
        "velocity": inputs.get("velocity"),
        "datarate": inputs.get("datarate"),
    }

    # --- File-based logging (always works, picked up by Filebeat) ---
    try:
        log_dir = _Path("logs")
        log_dir.mkdir(exist_ok=True)
        with open(log_dir / "predictions.json", "a", encoding="utf-8") as f:
            f.write(_json.dumps(doc, default=str) + "\n")
    except Exception as e:
        log.warning("Failed to write prediction to log file: %s", e)

    # --- Elasticsearch direct logging (optional) ---
    client = _get_client()
    if client is None:
        return

    try:
        client.index(index=ES_INDEX_PREDICTIONS, document=doc)
    except Exception as e:
        log.warning("Failed to log prediction to Elasticsearch: %s", e)


def log_training_run(run_id: str, metrics: dict, params: dict) -> None:
    """
    Index a training run summary to Elasticsearch.
    Called by train_mlflow.py after each training cycle.

    Parameters
    ----------
    run_id  : MLflow run ID
    metrics : output of evaluate_model()
    params  : hyperparameters dict
    """
    client = _get_client()
    if client is None:
        return

    doc = {
        "@timestamp": _now(),
        "run_id":     run_id,
        "metrics": {
            "dso1_auc":   metrics.get("dso1", {}).get("auc_roc"),
            "dso1_f1":    metrics.get("dso1", {}).get("f1_score"),
            "dso2_rmse":  metrics.get("dso2", {}).get("rmse"),
            "dso2_r2":    metrics.get("dso2", {}).get("r2"),
            "dso3_inertia": metrics.get("dso3", {}).get("inertia"),
            "dso4_rmse":  metrics.get("dso4", {}).get("rmse"),
            "dso4_r2":    metrics.get("dso4", {}).get("r2"),
            "dso4_mae":   metrics.get("dso4", {}).get("mae"),
        },
        "params": params,
    }

    try:
        client.index(index=ES_INDEX_TRAINING, document=doc)
        log.info("Training run logged to Elasticsearch index '%s'", ES_INDEX_TRAINING)
    except Exception as e:
        log.warning("Failed to log training run to Elasticsearch: %s", e)


def create_index_templates() -> None:
    """
    Create Elasticsearch index templates with correct field mappings.
    Call once on first setup.
    """
    client = _get_client()
    if client is None:
        log.warning("Elasticsearch not available — cannot create templates")
        return

    pred_template = {
        "index_patterns": ["predictions-5g*"],
        "template": {
            "mappings": {
                "properties": {
                    "@timestamp":         {"type": "date"},
                    "latency_ms":         {"type": "float"},
                    "handover_recommended": {"type": "boolean"},
                    "dso1_risk_score":    {"type": "float"},
                    "dso2_neighbor_gain": {"type": "float"},
                    "dso3_cluster":       {"type": "integer"},
                    "dso4_probability":   {"type": "float"},
                    "rsrp":               {"type": "float"},
                    "sinr":               {"type": "float"},
                    "velocity":           {"type": "float"},
                    "datarate":           {"type": "float"},
                }
            }
        }
    }

    train_template = {
        "index_patterns": ["training-runs-5g*"],
        "template": {
            "mappings": {
                "properties": {
                    "@timestamp":       {"type": "date"},
                    "run_id":           {"type": "keyword"},
                    "metrics.dso1_auc": {"type": "float"},
                    "metrics.dso4_r2":  {"type": "float"},
                    "metrics.dso4_rmse": {"type": "float"},
                }
            }
        }
    }

    try:
        client.indices.put_index_template(name="predictions-5g-template", body=pred_template)
        client.indices.put_index_template(name="training-runs-5g-template", body=train_template)
        log.info("Elasticsearch index templates created")
    except Exception as e:
        log.warning("Could not create index templates: %s", e)
