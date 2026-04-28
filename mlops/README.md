# MLOps Pipeline — CellPilot

This folder contains everything related to machine learning: model training, inference API, logging, and drift detection.

## Contents

| File / Folder | Description |
|---|---|
| `api.py` | FastAPI inference server — runs the DSO1/3/4 pipeline, exposes `/predict` |
| `train.py` | CLI training entry point (`python train.py train`) |
| `train_mlflow.py` | Training with MLflow experiment tracking |
| `elk_logger.py` | Writes predictions to `../logs/predictions.json` after every `/predict` call |
| `src/model_pipeline.py` | Core training logic — `prepare_data()`, `train_all()`, `evaluate_all()`, `save_artifacts()` |
| `src/drift_detector.py` | PSI-based data drift detection (compares live data to training baseline) |
| `notebooks/` | Jupyter exploration notebooks |
| `requirements.txt` | Core Python dependencies |
| `requirements_mlops.txt` | Extended dependencies (MLflow, Elasticsearch, etc.) |

## How to run

```bash
# Install dependencies
pip install -r requirements.txt

# Start the inference API
uvicorn api:app --host 0.0.0.0 --port 8000

# Train models (from project root)
python train.py train --data-path ../DATASET/df_master_engineered.parquet

# With MLflow tracking
python train.py train --with-mlflow
mlflow ui  # http://localhost:5000
```

## DSO Pipeline

| Stage | Model | Input | Output |
|---|---|---|---|
| DSO3 | K-Means (k=4) | RSRP, SINR, velocity, datarate | Cell scenario cluster (0–3) |
| DSO1 | LightGBM + XGBoost | 36 telemetry features + cluster | Risk score [0,1] — gates DSO4 |
| DSO2 | XGBoost Ranker | Serving + neighbor signals | Best candidate cell + predicted RSRP |
| DSO4 | GBT + Venn-Abers | All features + DSO1/3 outputs | Handover probability + yes/no |

## API Endpoints

```
POST http://localhost:8000/predict     Run full DSO1-4 inference
GET  http://localhost:8000/health      Server health + prediction count
GET  http://localhost:8000/docs        Swagger UI
GET  http://localhost:8000/models/info Feature lists per DSO model
```
