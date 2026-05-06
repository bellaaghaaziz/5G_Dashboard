# Microservices — CellPilot

This folder contains all NestJS backend microservices. Each service runs in its own Docker container and communicates with others over the internal Docker network.

## Services

### api-gateway (Port 3000)
The **single entry point** for the browser. Validates JWTs, enforces role-based access, and routes requests to the correct downstream service.

```
/auth/*          → user-service:3001
/admin/*         → user-service:3001
/operator/*      → dashboard-service:3003
/scientist/*     → dashboard-service:3003
/predict         → prediction-service:3002
```

### user-service (Port 3001)
Manages users and authentication. Backed by PostgreSQL.

- **Database:** PostgreSQL 16 — `platform_users` DB, `users` table
- **Auth:** bcrypt password hashing + JWT access/refresh tokens
- **Seeding:** Admin user auto-created on startup from env vars

```bash
# Access the database directly
docker exec -it platform-postgres psql -U platform -d platform_users
# Or: psql -h localhost -p 5433 -U platform -d platform_users (password: platform123)

SELECT id, email, role, created_at FROM users;
```

### dashboard-service (Port 3003)
Reads the ML prediction log and serves formatted data to the frontend.

- Reads `logs/predictions.json` (mounted as a read-only Docker volume)
- Aggregates KPIs, UE positions, cell risk scores
- Polls every 3 seconds from the frontend

### prediction-service (Port 3002)
Thin proxy that forwards manual prediction requests from the frontend to the FastAPI ML API.

## Starting Services

```bash
# All services at once (via docker compose)
docker compose -f ../docker-compose.platform.yml up --build

# Individual service (development)
npm run dev -w services/api-gateway
npm run dev -w services/user-service
```

## Inter-Service Communication

All services communicate by **Docker container name** (not localhost):

```
api-gateway   → http://user-service:3001
api-gateway   → http://dashboard-service:3003
api-gateway   → http://prediction-service:3002
prediction-service → http://host.docker.internal:8000  (FastAPI on host)
```

No service exposes its port to the internet — only the API Gateway's port 3000 is needed.
