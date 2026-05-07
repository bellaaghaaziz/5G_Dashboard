<div align="center">

# 🚀 CellPilot — AI-Driven 5G Handover Intelligence Platform

**Production-grade MLOps platform for real-time 5G handover prediction and network monitoring.**  
Trained on real German 5G measurements. Deployed on a containerized microservices architecture.

[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org)
[![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)](https://nestjs.com)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)

</div>

---

## What Is CellPilot?

CellPilot is an end-to-end MLOps platform that predicts, in real time, when a 5G device should switch (hand over) from one cell tower to a better one — before the signal degrades.

The system was trained on **199,990 real 5G measurements** collected in the Ruhr region, Germany, and visualizes live inference results on an interactive map of real cell towers with moving virtual user devices.

**The platform proves that a production-ready AI inference system can be built on top of real telecom data, containerized as independent microservices, and monitored through a professional dashboard.**

---

## Project Structure

```
CellPilot/
│
├── 📁 apps/web/                 React + Vite frontend (the dashboard UI)
├── 📁 services/                 NestJS microservices (backend)
│   ├── api-gateway/             Single HTTP entry point — routes, JWT validation
│   ├── user-service/            Auth + user management → PostgreSQL
│   ├── dashboard-service/       Serves map events, KPIs, drift data
│   └── prediction-service/      Proxies ML predictions to FastAPI
│
├── 📁 mlops/                    Everything ML — training, inference, logging
│   ├── api.py                   FastAPI inference server (DSO1–4 pipeline)
│   ├── train.py                 CLI training entry point
│   ├── train_mlflow.py          MLflow experiment tracking
│   ├── elk_logger.py            Writes predictions → logs/predictions.json
│   ├── src/                     Core model pipeline source code
│   │   ├── model_pipeline.py    Training logic for all 4 DSO models
│   │   └── drift_detector.py    PSI-based data drift detection
│   ├── notebooks/               Jupyter notebooks (exploratory work)
│   └── requirements.txt         Python dependencies
│
├── 📁 simulator/                City network simulator
│   ├── run_city.py              ★ Main simulator — 60 UEs, 3GPP physics
│   ├── simulate_city.py         Extended simulator variant
│   ├── simulate_traffic.py      Dataset-replay simulator (legacy)
│   ├── export_gps_lookup.py     Extracts cell GPS from parquet dataset
│   └── check_city.py            Verifies simulator log output
│
├── 📁 docker/platform/          Dockerfiles for each service
├── 📁 DATASET/                  Raw 5G measurement data (parquet)
├── 📁 logs/                     Runtime logs (predictions, GPS, drift)
├── 📁 models/                   Saved trained model artifacts (.pkl)
│
├── docker-compose.platform.yml  ★ Full platform (all containers)
├── docker-compose.yml           Minimal dev compose
├── docker-compose.elk.yml       ELK stack (Elasticsearch + Kibana)
├── Makefile                     Quick commands (make train, make run, ...)
├── Jenkinsfile                  CI/CD pipeline definition
└── README.md                    This file
```

---

## Quick Start

### Option 1: Full Containerized Platform (Recommended)

```bash
# Start all 6 containers (PostgreSQL, User Service, Dashboard, Prediction, Gateway, Web)
docker compose -f docker-compose.platform.yml up --build

# Open the dashboard
open http://localhost:5173
```

### Option 2: Local Development

```bash
# 1. Start the ML inference API
pip install -r mlops/requirements.txt
cd mlops && uvicorn api:app --host 0.0.0.0 --port 8000

# 2. Start the NestJS backend services
npm install
npm run dev   # starts all NestJS services in watch mode

# 3. Start the frontend
cd apps/web && npm run dev

# 4. Start the city simulator (generates live network traffic)
cd simulator && python run_city.py
```

### Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@5g.local` | `admin12345` |
| Network Operator | `operator@5g.local` | `admin12345` |
| Data Scientist | `scientist@5g.local` | `admin12345` |

---

## System Architecture

```
Browser (React)
     │
     │ HTTP (port 3000)
     ▼
API Gateway (NestJS)          ← JWT validation, role-based routing
     │
     ├── /auth/*  ──────────▶ User Service (NestJS + TypeORM)
     │                              │
     │                              ▼
     │                        PostgreSQL :5432
     │                        DB: platform_users
     │                        Table: users (UUID, bcrypt, JWT tokens)
     │
     ├── /operator/* ────────▶ Dashboard Service (NestJS)
     │   /scientist/*               │ reads logs/predictions.json
     │                              │ (shared Docker volume)
     │
     └── /predict ──────────▶ Prediction Service (NestJS)
                                    │
                                    │ proxies to
                                    ▼
                             FastAPI ML API :8000
                             (Python — DSO1/3/4 inference)
                                    ▲
                                    │ POST /predict (parallel)
                             run_city.py (Simulator)
                             60 UEs × 3GPP physics × real GPS
```

---

## ML Pipeline — The 4 DSO Models

Each UE measurement flows through a 4-stage AI pipeline:

### DSO3 — Cell Scenario Classifier (runs first)
- **Algorithm:** K-Means clustering (k=4)
- **Purpose:** Identifies what kind of network situation the UE is in
- **Output:** One of 4 clusters: Indoor/Static, Vehicular, Cell Edge, High Mobility

### DSO1 — Risk Gate (second)
- **Algorithm:** LightGBM + XGBoost ensemble
- **Purpose:** Fast binary filter — if risk is low, skip DSO4 entirely
- **Output:** `risk_score` ∈ [0, 1]

### DSO2 — Neighbor Ranker (parallel, non-blocking)
- **Algorithm:** XGBoost ranker + regression
- **Purpose:** Ranks candidate cells for handover target selection
- **Output:** Best candidate cell + predicted RSRP gain

### DSO4 — Final Handover Decision (last)
- **Algorithm:** Gradient Boosted Trees + Venn-Abers calibration
- **Threshold:** ~0.82 (learned from calibration set, not fixed at 0.5)
- **Output:** `dso4_probability` + `handover_recommended: true/false`
- **Latency:** ~17–25ms end to end

```
Telemetry ──▶ DSO3 (context) ──▶ DSO1 (risk gate)
                                       │
                               low risk: "stay"
                                       │
                               high risk ──▶ DSO4 (final decision)
                                                  │
                                         > 0.82 → HANDOVER ⚡
                                         ≤ 0.82 → STAY ✓
```

---

## Data Sources

| Source | What it is |
|---|---|
| `DATASET/df_master_engineered.parquet` | 199,990 real 5G measurements from Ruhr, Germany (training only) |
| `logs/cell_gps.json` | 2,283 real cell tower GPS positions (extracted from dataset) |
| `logs/predictions.json` | Rolling log of ML predictions written by the inference API |
| `simulator/run_city.py` | Generates synthetic but physically realistic UE measurements using 3GPP UMa path loss |

### Why the simulator uses real physics

The simulator uses the **3GPP TR 38.901 UMa NLOS path loss formula**:

```
RSRP = Tx_power − (32.4 + 20·log₁₀(3.5 GHz) + 30·log₁₀(dist_m)) + N(0, 4dB)
```

This is the same formula used by Nokia and Ericsson for real 5G network planning.

---

## Microservices & Containers

### user-service (Port 3001)
- **Stack:** NestJS + TypeORM + PostgreSQL
- **Why PostgreSQL?** ACID transactions, UUID primary keys, persistent volumes across restarts
- **Tables:** `users` (id, email, passwordHash [bcrypt], role, refreshTokenHash, timestamps)
- **Auth:** JWT access tokens (15min) + refresh tokens (7 days) with rotation and hash storage

### dashboard-service (Port 3003)
- **Stack:** NestJS
- **Data:** Reads `logs/predictions.json` (mounted as read-only Docker volume)
- **Endpoints:** `/operator/map-events`, `/operator/kpis`, `/operator/cell-gps`, `/scientist/metrics`, `/scientist/drift`

### prediction-service (Port 3002)
- **Stack:** NestJS (proxy)
- **Role:** Forwards prediction requests from the frontend to the FastAPI ML API

### api-gateway (Port 3000)
- **Stack:** NestJS
- **Role:** Single entry point for the browser. Validates JWTs, enforces RBAC, routes to services by URL prefix

### PostgreSQL (Port 5433 on host)
```bash
# Access directly
docker exec -it platform-postgres psql -U platform -d platform_users

# Or from host
psql -h localhost -p 5433 -U platform -d platform_users
# password: platform123

# Useful queries
SELECT id, email, role, created_at FROM users;
SELECT role, COUNT(*) FROM users GROUP BY role;
```

---

## API Reference

All endpoints go through the API Gateway at `http://localhost:3000`.

### Authentication
```
POST /auth/signin     { email, password }       → { accessToken, refreshToken, user }
POST /auth/signup     { email, password, role } → { accessToken, refreshToken, user }
POST /auth/refresh    { refreshToken }          → { accessToken, refreshToken }
POST /auth/signout                              → { success: true }
```

### Operator Dashboard
```
GET /operator/map-events   → Last 300 predictions with UE GPS positions
GET /operator/kpis         → Aggregated KPIs (UE count, HO alerts, risk)
GET /operator/cell-gps     → 2,283 cell tower GPS coordinates
```

### Scientist Dashboard
```
GET  /scientist/metrics    → Model evaluation metrics (AUC, MCC, recall)
GET  /scientist/drift      → PSI drift scores per feature
POST /scientist/retrain    → Trigger model retraining pipeline
```

### ML Inference (FastAPI — direct)
```
POST http://localhost:8000/predict    → { dso4_probability, handover_recommended, ... }
GET  http://localhost:8000/health     → { status, predictions_served, uptime }
GET  http://localhost:8000/docs       → Swagger UI
```

---

## Training the Models

```bash
# Full training pipeline (all 4 DSOs)
make train

# Or directly
python mlops/train.py train --data-path ./DATASET/df_master_engineered.parquet

# With MLflow experiment tracking
python mlops/train.py train --with-mlflow

# View MLflow experiments
mlflow ui   # → http://localhost:5000
```

Training takes ~5–10 minutes on a modern laptop. Models are saved to the project root as `.pkl` files.

---

## Environment Variables

The platform is fully configured via environment variables (see `docker-compose.platform.yml`):

| Variable | Default | Used By |
|---|---|---|
| `POSTGRES_USER` | `platform` | postgres, user-service |
| `POSTGRES_PASSWORD` | `platform123` | postgres, user-service |
| `POSTGRES_DB` | `platform_users` | postgres, user-service |
| `JWT_ACCESS_SECRET` | `change-me-access` | user-service, api-gateway |
| `JWT_REFRESH_SECRET` | `change-me-refresh` | user-service |
| `JWT_ACCESS_EXPIRES` | `15m` | user-service |
| `JWT_REFRESH_EXPIRES` | `7d` | user-service |
| `ADMIN_EMAIL` | `admin@5g.local` | user-service (seed) |
| `ADMIN_PASSWORD` | `admin12345` | user-service (seed) |
| `PYTHON_INFERENCE_BASE_URL` | `http://host.docker.internal:8000` | prediction-service |

> ⚠️ **Change `JWT_ACCESS_SECRET` and `POSTGRES_PASSWORD` before any real deployment.**

---

## CI/CD

The `Jenkinsfile` defines an automated pipeline:
1. **Checkout** — pull from Git
2. **Install** — `npm install` for all Node services
3. **Build** — compile TypeScript
4. **Test** — run unit tests
5. **Docker Build** — build all container images
6. **Deploy** — `docker compose up` on target host

---

## Team

| Name | Role |
|---|---|
| Aziz Bella | ML Pipeline, Backend, System Architecture |
| [Teammate] | [Role] |
| [Teammate] | [Role] |

---

## Academic Context

This platform was built as a **5G MLOps research project** to demonstrate:
- End-to-end AI pipeline from real telecom data to live production inference
- Containerized microservices with proper separation of concerns
- Production-grade authentication (JWT + PostgreSQL)
- Real-time spatial visualization of network events
- Data drift monitoring and in-platform model retraining

**Dataset:** Real 5G drive test measurements, Ruhr region, Germany  
**Models:** Trained using scikit-learn, LightGBM, XGBoost  
**Inference latency:** ~20ms per prediction  
**Throughput:** ~10 predictions/second (simulator) — scalable to 1000+/s in production

---

<div align="center">
Made with ☕ and way too many Python warnings about sklearn feature names.
</div>
#   M L O p s   P i p e l i n e      5 G   H a n d o v e r   A I  
 