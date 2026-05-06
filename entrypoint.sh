#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint for multi-service container
# Usage: docker run <image> <service>
# Services: api | streamlit | mlflow-ui | test | train
# ─────────────────────────────────────────────────────────────────────────────

SERVICE="${1:-api}"

case "$SERVICE" in
  api)
    echo "🚀 Starting FastAPI server on port 8000..."
    exec uvicorn api:app --host 0.0.0.0 --port 8000
    ;;
  streamlit)
    echo "🚀 Starting Streamlit dashboard on port 8501..."
    exec streamlit run app.py --server.port 8501 --server.address 0.0.0.0
    ;;
  mlflow-ui)
    echo "🚀 Starting MLflow UI on port 5000..."
    exec mlflow ui --host 0.0.0.0 --port 5000 --backend-store-uri file:///app/mlruns
    ;;
  test)
    echo "🧪 Running model validation suite..."
    exec python test_models.py
    ;;
  train)
    echo "🏋️ Running training pipeline..."
    exec python main.py train --with-mlflow
    ;;
  *)
    echo "Unknown service: $SERVICE"
    echo "Usage: $0 {api|streamlit|mlflow-ui|test|train}"
    exit 1
    ;;
esac
