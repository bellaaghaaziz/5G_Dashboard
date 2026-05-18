<div align="center">

# Nexo — AI-Driven 5G Handover Intelligence Platform

**Real-time 5G handover prediction and network monitoring powered by a four-stage AI pipeline.**

[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org)
[![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)](https://nestjs.com)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)

Developed at **Esprit School of Engineering – Tunisia**
PIDATA – 4DATA | Academic Year 2025–2026

</div>

---

## Overview

Nexo is an end-to-end MLOps platform that predicts, in real time, when a 5G device should switch (hand over) from one cell tower to a better one — before the signal degrades.

The system was trained on **199,990 real 5G measurements** collected in the Ruhr region, Germany, and visualizes live inference results on an interactive map with real cell tower positions and moving virtual user devices.

This project was developed as part of the **PIDATA – 4th Year Engineering Program** at **Esprit School of Engineering** (Academic Year 2025–2026).

---

## Features

- **Live Network Map** — real-time device movement across city towers with AI-driven handover decisions shown as they happen
- **AI Results Dashboard** — accuracy metrics, reliability trends, and health status of the prediction models
- **Automated Handover Decisions** — four-stage AI pipeline that decides when and where to switch each device, under 30ms
- **Data Drift Detection** — monitors whether incoming signal data has shifted from training distribution (PSI-based)
- **In-Platform Model Retraining** — trigger a full retraining pipeline from the dashboard without touching the command line
- **Role-Based Access** — separate workspaces for Network Operators, Data Scientists, and Admins
- **User Management** — create and delete platform users, assign roles
- **System Health Monitoring** — live status of all microservices

---

## Tech Stack

### Frontend
- **React 18** + **Vite** — fast SPA with TypeScript
- **Material UI** — component library
- **Leaflet** — interactive map with real tower GPS positions
- **Socket.io-client** — real-time WebSocket updates

### Backend
- **NestJS** — microservices architecture (API Gateway, User Service, Dashboard Service, Prediction Service)
- **FastAPI** (Python) — ML inference server
- **PostgreSQL** — user data and authentication
- **Kafka** — real-time event streaming between services
- **Redis** — caching
- **MLflow** — experiment tracking and model registry
- **Prometheus + Grafana** — metrics and observability

---

## Architecture

```
Browser (React + Leaflet)
        │
        │ HTTP + WebSocket (port 3000)
        ▼
  API Gateway (NestJS)        ← JWT validation, role-based routing, WS proxy
        │
        ├── /auth/*     ──▶  User Service (NestJS + TypeORM + PostgreSQL)
        ├── /operator/* ──▶  Dashboard Service (NestJS + Socket.io + Kafka)
        ├── /scientist/*──▶  Dashboard Service
        └── /predict    ──▶  Prediction Service ──▶ FastAPI ML API (Python)

Kafka Producer ──▶ Kafka ──▶ Kafka Consumer ──▶ Dashboard Service ──▶ WebSocket ──▶ Browser
```

**AI Pipeline (4-stage):**
```
Signal Data ──▶ DSO3 (context cluster) ──▶ DSO1 (risk gate)
                                                  │
                                          high risk ──▶ DSO4 (handover decision)
                                                              │
                                                    > threshold → HANDOVER
                                                    ≤ threshold → STAY
```

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.11+

### Run with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/bellaaghaaziz/5G_Dashboard.git
cd 5G_Dashboard

# Start the full platform
docker compose -f docker-compose.platform.yml up --build

# Open the dashboard
open http://localhost:5173
```

### Default Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@5g.local` | `admin12345` |
| Network Operator | `operator@5g.local` | `admin12345` |
| Data Scientist | `scientist@5g.local` | `admin12345` |

### Local Development

```bash
# 1. Install Node dependencies
npm install

# 2. Start NestJS services
npm run dev

# 3. Start the frontend
cd apps/web && npm run dev

# 4. Start the ML inference API
pip install -r mlops/requirements.txt
uvicorn mlops.api:app --host 0.0.0.0 --port 8000
```

---

## Contributors

| Name | Role |
|---|---|
| Aziz Bella | ML Pipeline, Backend Architecture, System Design |
| Zakaria Zarrouk | Frontend & ML Pipeline Engineering |
| The Best Team Group | Research & Development |

---

## Academic Context

This platform was developed as part of the **PIDATA** program at **Esprit School of Engineering – Tunisia**.

| | |
|---|---|
| **Institution** | Esprit School of Engineering – Tunisia |
| **Program** | PIDATA – 4th Year Engineering |
| **Academic Year** | 2025–2026 |
| **Domain** | 5G Networks, Machine Learning, MLOps |
| **Dataset** | 199,990 real 5G measurements — Ruhr region, Germany |
| **Inference Latency** | ~30ms end-to-end |
| **Model Accuracy** | ~98% (DSO4 ROC AUC 0.979) |

---

## Acknowledgments

- **Esprit School of Engineering** for supporting this research project
- The open-source 5G measurement dataset from the Ruhr region, Germany
- The NestJS, React, FastAPI, and MLflow communities
