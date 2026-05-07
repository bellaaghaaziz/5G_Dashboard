# MLOps Pipeline — Step-by-Step Execution & Validation Guide

This document walks you through every step of the pipeline exactly as the professor will ask to see it.
Each step tells you: **what to do**, **what to click**, and **what to say**.

---

## Before You Start — Make Sure Everything is Running

Open PowerShell and run:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
```

You should see all these containers with `healthy` or `Up`:

```
platform-postgres          healthy
platform-redis             Up
platform-user-service      healthy
platform-prediction-service healthy
platform-dashboard-service  healthy
platform-api-gateway        healthy
platform-web               Up
platform-inference         healthy
platform-mlflow            Up
platform-prometheus        Up
platform-grafana           Up
platform-kafka             healthy
platform-kafka-producer    Up
platform-kafka-consumer    Up
5g-airflow                 Up
```

If anything is down:
```powershell
docker compose -f docker-compose.platform.yml restart
docker compose -f docker-compose.airflow.yml restart
```

---

---

# STEP 1 — Modularisation du Code

**What the professor wants to see:** The ML code is split into clean, separate functions — not one big messy script.

**What to do:**

Open the file `src/model_pipeline.py` in VS Code.

Show the professor these 4 functions:

```
prepare_data()    → loads the parquet file, builds train/test splits
train_all()       → trains DSO1, DSO3, DSO4 models
evaluate_all()    → computes AUC, MCC, F1 for every model
save_artifacts()  → saves all trained models as .pkl files
```

**What to say:**
> "The ML pipeline is fully modular. Each function has one responsibility. `prepare_data` only loads and splits data. `train_all` only trains. `evaluate_all` only computes metrics. `save_artifacts` only saves. This makes the code testable, reusable, and easy to maintain."

**Also show:** The folder structure in VS Code:
```
src/
  model_pipeline.py     ← core ML logic
  calibration.py        ← model calibration
mlops/
  pipeline_runner.py    ← orchestrates the full pipeline
train_mlflow.py         ← MLflow tracking wrapper
api.py                  ← FastAPI serving layer
```

---

---

# STEP 2 — CI/CD Automatique (GitHub Actions)

## STEP 2A — Automatisation CI (déclenché par push)

**What the professor wants to see:** Every time code is pushed to GitHub, a quality check runs automatically without anyone doing anything.

**What to do:**

1. Open your browser and go to:
   `https://github.com/bellaaghaaziz/5G_Dashboard/actions`

2. Click on the most recent run of **"CI Pipeline"**

3. Show the professor the 4 jobs that ran automatically:
   - **code-quality** — Black, Flake8, Bandit
   - **test** — pytest unit tests
   - **build** — Docker image build check
   - **security-scan**

4. Click on **code-quality** to expand it. Show the steps inside:
   - `Black — code formatting check`
   - `Flake8 — lint`
   - `Bandit — security scan`
   - `Safety — dependency vulnerabilities`

**What to say:**
> "Every time I do `git push`, GitHub automatically runs this CI pipeline. It checks that the code is properly formatted with Black, has no syntax errors with Flake8, and has no security vulnerabilities with Bandit. I never have to remember to run these manually."

**To prove it triggers automatically:** Make a tiny change, push, and show the pipeline start within seconds:
```powershell
# In PowerShell from the project directory
git add .
git commit -m "ci: trigger demo"
git push origin main
# Then refresh the Actions page — new run appears immediately
```

---

## STEP 2B — Lancer manuellement le CD Pipeline

**What the professor wants to see:** You manually trigger the full CD pipeline (train → build Docker → push to DockerHub).

**What to do:**

1. Go to: `https://github.com/bellaaghaaziz/5G_Dashboard/actions`

2. In the left sidebar, click **"5G MLOps — CD Pipeline"**

3. Click the **"Run workflow"** blue button (top right)

4. Leave the options as default, click **"Run workflow"** (green button)

5. Refresh the page — a new yellow/orange run appears at the top

6. Click it and show the 4 jobs running in order:
   - **Build & Test** — installs dependencies, runs quality checks
   - **MLflow Training** — trains the model and logs to MLflow
   - **Docker Build + Push** — builds and pushes images to DockerHub
   - **Deploy** — pulls image from DockerHub, runs health check

**Wait ~5 minutes** for it to finish (all jobs turn green).

**What to say:**
> "The CD pipeline is triggered manually — like when we're ready to release a new version. It trains a new model, logs everything to MLflow, builds Docker images for both the backend and frontend, and pushes them to DockerHub automatically."

---

---

# STEP 3 — Déploiement avec FastAPI

## STEP 3A — Montrer que FastAPI fonctionne

**What the professor wants to see:** A running FastAPI server that serves ML predictions.

**What to do:**

1. Open: `http://localhost:8000/docs`

2. You see the **Swagger UI** — automatic API documentation generated from the code.

3. Click on **POST /predict** to expand it

4. Click **"Try it out"**

5. Replace the example JSON with:
```json
{
  "rsrp": -85,
  "rsrq": -12,
  "sinr": 8,
  "ue_speed": 45,
  "cell_load": 0.7,
  "neighbor_rsrp": -78,
  "neighbor_rsrq": -10
}
```

6. Click **Execute**

7. Show the professor the response:
```json
{
  "handover_decision": true,
  "confidence": 0.87,
  "dso1_degrading": true,
  "dso4_probability": 0.87
}
```

**What to say:**
> "This is our FastAPI inference server. The Swagger documentation is automatically generated from the Python type annotations in the code — I don't write it manually. When I call /predict with 5G signal metrics, it runs all 4 stages of the DSO pipeline and returns a handover decision with a confidence score."

---

## STEP 3B — Montrer la documentation des paramètres

**What to do:**

Still on `http://localhost:8000/docs`, scroll down and show the **Schemas** section at the bottom.

It shows `PredictRequest` with every parameter documented: name, type, description.

**What to say:**
> "Every API parameter has a name, type, and description. FastAPI generates this automatically from the Python code using Pydantic models. This is what API documentation means — the professor or any developer can understand how to use the API without reading the source code."

---

---

# STEP 4 — Intégration avec MLflow

## STEP 4A — Voir les runs d'expériences

**What the professor wants to see:** MLflow is tracking every training run with metrics.

**What to do:**

1. Open: `http://localhost:5000`

2. Click on the experiment **"5G-Handover-AI"** (or "5G_Handover_Prediction")

3. You see a table of runs. Show the professor:
   - Each row is one training run
   - Columns show: start time, duration, metrics (AUC, MCC, accuracy)
   - The run with best DSO4 ROC-AUC ≈ 0.98

4. Click on the most recent run to open it

5. Show the **Metrics** tab:
   - `dso4_roc_auc` = 0.98
   - `dso4_accuracy` = 0.91
   - `dso1_roc_auc` = 0.88
   - `training_time_s` = (how long training took)

6. Show the **Parameters** tab:
   - `n_estimators`, `max_depth`, `learning_rate` — the hyperparameters used

7. Show the **Artifacts** tab:
   - `model_dso1_xgb/` — the saved DSO1 model
   - `model_dso4_controller/` — the saved DSO4 model
   - `metrics_summary.json` — all metrics as a JSON file

**What to say:**
> "MLflow tracks every single training run automatically. I can see the exact parameters used, the metrics achieved, and I can download the model artifacts. If a new model performs worse than the previous one, I can roll back by loading the previous run's artifacts."

---

## STEP 4B — Gestion des versions de modèles (Model Registry)

**What the professor wants to see:** Model versioning — the ability to manage and promote model versions.

**What to do:**

1. Still on `http://localhost:5000`, click **"Models"** in the top navigation

2. You see **"5G-DSO4-Controller"** — click it

3. You see a list of versions: Version 1, Version 2, Version 3...

4. Click on the latest version

5. Show:
   - The version number
   - Which run it came from (Run ID)
   - The current stage: `None`, `Staging`, or `Production`

6. To show version promotion: Click **"Stage"** dropdown → select **"Staging"** → confirm

**What to say:**
> "The Model Registry is where we manage model versions in production. Each version is linked to an exact training run so we know exactly what data and parameters produced it. We can promote a model from None → Staging → Production, and roll back to any previous version if we detect a problem."

---

---

# STEP 5 — Docker

## STEP 5A — Image Docker créée (FastAPI backend)

**What the professor wants to see:** A Docker image was built for the FastAPI inference server.

**What to do:**

1. Go to GitHub Actions and open the CD pipeline run

2. Click on **"Docker Build + Push"** job

3. Expand the step **"Build & Push — Backend (5g-handover-ai)"**

4. Show the build log — it shows Docker building each layer

**Alternatively, show the local image:**
```powershell
docker images | Select-String "5g"
```
Output:
```
5g_dashboard-api    latest    ...    (size)
```

---

## STEP 5B — Image Docker pushée sur DockerHub

**What to do:**

1. Open your browser: `https://hub.docker.com/u/bellaaghaaziz`

2. Show two repositories:
   - `bellaaghaaziz/5g-handover-ai` — backend FastAPI
   - `bellaaghaaziz/5g-dashboard-web` — frontend React

3. Click on `5g-handover-ai` → click **Tags** tab

4. Show the `latest` tag with **today's date** as the push time

**What to say:**
> "After every CD pipeline run, both Docker images are automatically pushed to DockerHub. Anyone can pull and run this platform with a single command — no Python, no Node.js needed."

---

## STEP 5C — Lancer le conteneur et tester /predict

**What to do:**

Show the running containers:
```powershell
docker ps --filter "name=platform-inference" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Output:
```
platform-inference    Up 2 hours (healthy)    0.0.0.0:8000->8000/tcp
```

Then test it live:
```powershell
curl -X POST http://localhost:8000/predict `
  -H "Content-Type: application/json" `
  -d '{"rsrp":-85,"rsrq":-12,"sinr":8,"ue_speed":45,"cell_load":0.7,"neighbor_rsrp":-78,"neighbor_rsrq":-10}'
```

Show the JSON response with `handover_decision` and `confidence`.

**What to say:**
> "The FastAPI container is running and healthy. I just called /predict directly and got a real-time handover prediction from the trained model."

---

## STEP 5D — Lancer le conteneur frontend

**What to do:**

```powershell
docker ps --filter "name=platform-web" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Then open: `http://localhost:5173`

Log in with `admin@5g.local` / `admin12345`

Show the live dashboard with the animated network map.

**What to say:**
> "The frontend is also running inside Docker — the `platform-web` container. It connects to the API Gateway which connects to all backend services. The map shows live handover events as the Kafka stream feeds data in real time."

---

---

# STEP 6 — Monitoring

## STEP 6A — Prometheus (métriques en temps réel)

**What the professor wants to see:** Prometheus is scraping the FastAPI server and storing metrics.

**What to do:**

1. Open: `http://localhost:9090`

2. Click **Status → Targets** in the top menu

3. Find the row with `platform-inference:8000` — State should be **UP** (green)

4. Go back to the main page, click in the query box

5. Type: `cellpilot_predictions_total` → click **Execute**

6. Switch to **Graph** tab — shows total predictions over time

7. Try: `rate(cellpilot_predictions_total[1m])` → shows predictions per second

**What to say:**
> "Prometheus automatically scrapes our FastAPI server every 15 seconds. The target is UP meaning it's reachable and returning metrics. This counter shows the total number of predictions the model has served since it started."

---

## STEP 6B — Grafana (tableaux de bord)

**What the professor wants to see:** A visual dashboard showing model metrics.

**What to do:**

1. Open: `http://localhost:3004` → Login: `admin` / `admin123`

2. Click the **Explore** icon (compass) in the left sidebar

3. Make sure **prometheus** is selected as the data source at the top

4. In the Metric field type: `cellpilot_handover_recommended_total`

5. Click **+ Operations** → **Rate** → set to `1m`

6. Click **Run query** (blue button top right)

7. A graph appears showing handover recommendations per second

8. Try another metric: `http_request_duration_seconds_bucket` — shows API latency

**What to say:**
> "Grafana connects to Prometheus and turns the raw numbers into visual graphs. I can see handover rate, API latency, prediction throughput — all updating in real time. I can set alerts here too, for example if latency exceeds 500ms."

---

---

# STEP 7 — Airflow (Pipeline Orchestration)

**What the professor wants to see:** A DAG that orchestrates the full retraining pipeline.

**What to do:**

1. Open: `http://localhost:8080` → Login: `admin` / `airflow123`

2. Find the DAG named **`5G_MLOps_Full_Pipeline`** (or `5g_handover_retraining_pipeline`)

3. Click the **graph icon** (or DAG name) to see the pipeline graph

4. Show the professor the 7 tasks connected by arrows:
   ```
   validate_data → dvc_pull → train_dso1 → train_dso3 → train_dso4 → evaluate_models → register_mlflow
   ```

5. Click the **play button** (▶) on the right side of the DAG to trigger a run

6. Click on the DAG name → **Grid** view — watch the boxes turn green as tasks complete

7. Click on any completed task box → click **Logs** — show the actual output

**What to say:**
> "Airflow orchestrates the 7-step retraining pipeline. Each box is one task. Airflow handles the order — it won't start training until data validation passes. If one step fails, it stops and shows exactly which step failed and why. I can schedule this to run every night automatically or trigger it manually like I just did."

---

---

# STEP 8 — ELK Stack (Bonus — Log Analytics)

**What the professor wants to see:** Prediction logs are indexed and searchable.

**What to do:**

1. Open: `http://localhost:5601`

2. Click **Discover** (compass icon in the left sidebar)

3. If it asks for an index pattern: type `predictions-5g-*` → Next → select `@timestamp` → Create

4. You see **630,000+ documents** — each one is a prediction the model made

5. In the search bar type: `handover_decision: true` → press Enter

6. Shows only predictions where the model said YES to handover

7. Click the bar chart at the top — it shows prediction volume over time

8. Expand one document to show all its fields: `rsrp`, `sinr`, `confidence`, `handover_decision`...

**What to say:**
> "The ELK stack collects every single prediction as a searchable log event. Filebeat automatically ships the logs from the FastAPI server to Elasticsearch. With Kibana I can search across 630,000 predictions instantly — for example 'show me all handovers where confidence was below 60%'. This is for auditing and debugging production issues."

---

---

# Quick Reference — All Credentials

| Tool | URL | Username | Password |
|------|-----|----------|----------|
| Frontend | http://localhost:5173 | admin@5g.local | admin12345 |
| Airflow | http://localhost:8080 | admin | airflow123 |
| Grafana | http://localhost:3004 | admin | admin123 |
| MLflow | http://localhost:5000 | — | — |
| Prometheus | http://localhost:9090 | — | — |
| Kibana | http://localhost:5601 | — | — |
| FastAPI Docs | http://localhost:8000/docs | — | — |

---

# Professor Grading Checklist

| Criterion | Points | Validated in Step |
|-----------|--------|-------------------|
| Modularisation | 1pt | Step 1 — show src/model_pipeline.py functions |
| Code formatting (Black) | 0.5pt | Step 2A — GitHub Actions CI → code-quality job |
| Code quality + security (Flake8 + Bandit) | 0.5pt | Step 2A — GitHub Actions CI → code-quality job |
| FastAPI fonctionnel | 1pt | Step 3A — localhost:8000/docs → try /predict |
| API documentation / param naming | 1pt | Step 3B — Swagger schemas section |
| MLflow Tracking | 1pt | Step 4A — localhost:5000 → runs with metrics |
| Gestion des versions de modèles | 1pt | Step 4B — Models tab → 5G-DSO4-Controller versions |
| Création image Docker FastAPI | 0.5pt | Step 5A — docker images or GitHub Actions logs |
| Push image Docker | 0.5pt | Step 5B — hub.docker.com/u/bellaaghaaziz |
| Lancement conteneur + test /predict | 1pt | Step 5C — docker ps + curl /predict |
| Lancement conteneur frontend | 1pt | Step 5D — docker ps + localhost:5173 |
| Monitoring | 1.5pt | Step 6A (Prometheus target UP) + Step 6B (Grafana graph) |
| **Total** | **/11pt** | |
