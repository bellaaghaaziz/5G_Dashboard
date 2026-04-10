FROM python:3.10-slim

WORKDIR /app

# Install curl for the health check (slim image doesn't include it)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Security: create a non-root user
RUN useradd -m appuser

# Copy all files with correct ownership
COPY --chown=appuser:appuser . ./

# Switch to non-root user
USER appuser

EXPOSE 8501

# Health check — restarts container automatically if app becomes unresponsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8501/_stcore/health || exit 1

CMD ["streamlit", "run", "app.py", \
     "--server.port=8501", \
     "--server.address=0.0.0.0", \
     "--server.headless=true"]