# CellPilot: Complete MLOps Implementation Journey

This report details the exact engineering steps taken to transition the CellPilot 5G Handover project from a static Jupyter Notebook into a production-grade, containerized MLOps platform.

---

## Phase 1: Code Modularization
The original project existed as a monolithic, 2MB+ Jupyter Notebook (`5G_Handover_Pipeline_v9.ipynb`). While great for exploration, notebooks cannot be deployed to production. 

**Implementation Steps:**
1.  **Refactoring into Modules:** We extracted the core machine learning logic into isolated Python scripts within the `mlops/src/` directory.
    *   `model_pipeline.py`: Handles data splitting, training the 4 DSO models, threshold calibration, and inference logic.
    *   `calibration.py`: Extracts the custom `IsotonicCalibrator` logic so it can be cleanly pickled and imported during API inference.
2.  **Artifact Generation:** Instead of keeping models in memory, the pipeline was modified to serialize all models, scalers, and the mathematically optimized `0.70` threshold into binary `.pkl` files using `joblib`. Feature lists were exported to `model_feature_lists.json` to guarantee exact column mapping in production.

---

## Phase 2: MLflow Integration (Experiment Tracking)
To ensure reproducibility, we implemented **MLflow**.

**Implementation Steps:**
1.  **`train_mlflow.py`:** We built a dedicated training orchestrator script. 
2.  **Tracking:** When a Data Scientist runs the script, MLflow creates a new `run_id`. It tracks hyperparameters (e.g., XGBoost depth, learning rate), records all evaluation metrics (ROC-AUC, F1, MCC for DSO1-4), and logs them to a local SQLite database (`mlflow.db`) and the `mlruns/` directory.
3.  **Versioning:** This allows the team to compare different versions of the Handover models over time without losing historical context.

---

## Phase 3: Model Serving with FastAPI
To serve the pickled models to the simulation engine, we built a high-performance REST API.

**Implementation Steps:**
1.  **FastAPI (`api.py`):** We created a lightweight web server that exposes a `POST /predict` endpoint.
2.  **Pydantic Data Validation:** We defined a strict `TelemetryInput` schema. If the simulator sends invalid data (e.g., a string instead of a float for velocity), FastAPI instantly rejects it. It also supplies safe default values for missing temporal features to prevent the pipeline from crashing.
3.  **Inference Execution:** The API loads the `.pkl` files into RAM on startup. When a JSON payload arrives, `predict_single()` pushes the telemetry through the KMeans profiler, the DSO1 Risk classifier, the Gate, and the DSO4 Controller in under 15 milliseconds.

---

## Phase 4: Observability with the ELK Stack
A production ML model requires real-time monitoring to detect Data Drift and model degradation.

**Implementation Steps:**
1.  **`elk_logger.py` Middleware:** We wrote a custom logging script injected directly into the FastAPI endpoint. 
2.  **JSON Streaming:** Every time a prediction is made, `elk_logger.py` grabs the exact inputs (RSRP, velocity) and the AI's exact outputs (Risk Score, Handover Recommendation) and appends them to a shared `logs/predictions.json` file.
3.  **Elasticsearch & Kibana:** The system is wired to allow **Filebeat** to securely forward these JSON logs into an **Elasticsearch** cluster. Data Scientists can then open Kibana to visualize live handover metrics and monitor for anomalies in real-time.

---

## Phase 5: Containerization (Docker)
To guarantee the platform runs identically on a developer's laptop or a cloud production server, we containerized the entire ecosystem.

**Implementation Steps:**
1.  **`Dockerfile`:** We created a multi-stage Dockerfile that installs system dependencies, copies the `requirements_mlops.txt`, installs Python libraries, and sets up the FastAPI server.
2.  **Docker Compose (`docker-compose.platform.yml`):** We mapped out a microservice architecture. With a single command, Docker spins up:
    *   The PostgreSQL Database (for User Authentication).
    *   The NestJS Dashboard Service (Backend).
    *   The React/Vite Frontend (UI).
    *   The Python MLOps API.
3.  **Shared Volumes:** We mounted the `logs/` directory as a shared volume so the Python API can write to `predictions.json` while the NestJS backend reads from it simultaneously.

---

## Phase 6: Developer Automation (Makefile)
To orchestrate this massive ecosystem, we eliminated the need for developers to memorize long terminal commands.

**Implementation Steps:**
We created a `Makefile` at the root of the project. Now, the team operates the platform using simple aliases:
*   `make train`: Automatically triggers the MLflow training pipeline to rebuild the `.pkl` models.
*   `make api`: Starts the FastAPI uvicorn server.
*   `make sim`: Launches the `run_city.py` physics simulator to spawn the 60 UEs.
*   `make up`: Spins up the entire Docker Compose production stack.

---

## Summary
The engineering journey from a Jupyter Notebook to a microservice MLOps platform involved strict code decoupling, robust Pydantic API schemas, MLflow versioning, ELK stack observability, and Dockerized microservices. The result is the CellPilot platform: scalable, mathematically authentic, and entirely automated.
