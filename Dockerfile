# ─── Base ────────────────────────────────────────────────────────────────────
FROM python:3.10-slim

WORKDIR /app

# ─── Dependencies first (cached layer) ───────────────────────────────────────
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ─── App code ─────────────────────────────────────────────────────────────────
COPY app.py ./

# ─── Model files (.pkl) — copy only if they exist ────────────────────────────
# Using a shell glob: if no .pkl files are present the COPY is simply skipped
# (Docker 20+ silently skips a glob that matches nothing when the source ends
#  with / — we work around older versions by using a no-fail copy trick below)
COPY . ./
# ↑ copies everything (app.py, *.pkl, any other assets).
#   Adjust .dockerignore to exclude files you don't want in the image.

# ─── Expose Streamlit port ────────────────────────────────────────────────────
EXPOSE 8501

# ─── Run ──────────────────────────────────────────────────────────────────────
CMD ["streamlit", "run", "app.py", \
     "--server.port=8501", \
     "--server.address=0.0.0.0", \
     "--server.headless=true"]
