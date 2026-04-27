# ─────────────────────────────────────────────────────────────────────────────
# 5G Handover AI — Production Dockerfile (v9)
# Multi-service: api | streamlit | mlflow-ui | test | train
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install curl for health checks
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies (cached layer) ─────────────────────────────────────────────
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Security: non-root user ─────────────────────────────────────────────────
RUN useradd -m appuser

# ── Source code ──────────────────────────────────────────────────────────────
COPY --chown=appuser:appuser src/               ./src/
COPY --chown=appuser:appuser api.py             ./
COPY --chown=appuser:appuser app.py             ./
COPY --chown=appuser:appuser main.py            ./
COPY --chown=appuser:appuser train_mlflow.py    ./
COPY --chown=appuser:appuser elk_logger.py      ./
COPY --chown=appuser:appuser test_models.py     ./
COPY --chown=appuser:appuser entrypoint.sh      ./

# ── v9 Model artifacts ──────────────────────────────────────────────────────
COPY --chown=appuser:appuser model_feature_lists.json    ./
COPY --chown=appuser:appuser scaler_dso1.pkl             ./
COPY --chown=appuser:appuser scaler_dso3.pkl             ./
COPY --chown=appuser:appuser model_dso1_xgb.pkl          ./
COPY --chown=appuser:appuser model_dso2_ranker.pkl       ./
COPY --chown=appuser:appuser model_dso3_kmeans.pkl       ./
COPY --chown=appuser:appuser model_dso3_lr_classifier.pkl ./
COPY --chown=appuser:appuser model_dso4_controller.pkl   ./
COPY --chown=appuser:appuser model_dso4_calibrated.pkl   ./
COPY --chown=appuser:appuser model_dso4_stage1_gate.pkl  ./
COPY --chown=appuser:appuser model_dso4_stage2_benefit.pkl ./
COPY --chown=appuser:appuser model_dso4_threshold.pkl    ./
COPY --chown=appuser:appuser model_dso4_stage1_gate_threshold.pkl ./
COPY --chown=appuser:appuser model_dso4_hbahn_controller.pkl  ./
COPY --chown=appuser:appuser model_dso4_mobile_controller.pkl ./

# ── Streamlit config, MLflow volume & Logs ──────────────────────────────────
RUN mkdir -p .streamlit /app/mlruns /app/logs \
    && chown -R appuser:appuser .streamlit /app/mlruns /app/logs
COPY --chown=appuser:appuser .streamlit/ ./.streamlit/

# ── Entrypoint ───────────────────────────────────────────────────────────────
RUN chmod +x ./entrypoint.sh

ENV PYTHONPATH=/app
USER appuser

EXPOSE 8501 8000 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || curl -f http://localhost:8501/_stcore/health || curl -f http://localhost:5000/ || exit 1

ENTRYPOINT ["./entrypoint.sh"]