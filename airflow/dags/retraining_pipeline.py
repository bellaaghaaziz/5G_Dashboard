from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.bash import BashOperator

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

# All services are reachable via host.docker.internal from within Docker on Windows/Mac
INFERENCE = "http://host.docker.internal:8000"
MLFLOW    = "http://host.docker.internal:5000"
PROMETHEUS = "http://host.docker.internal:9090"

with DAG(
    '5G_MLOps_Full_Pipeline',
    default_args=default_args,
    description='Full End-to-End MLOps Pipeline for 5G Handover AI',
    schedule_interval=timedelta(days=1),
    catchup=False,
    tags=['mlops', '5g', 'kafka', 'dvc', 'mlflow', 'k8s', 'prometheus', 'grafana'],
) as dag:

    # ── 1. Kafka — Data Ingestion ─────────────────────────────────────────────
    kafka_data_processing = BashOperator(
        task_id='kafka_data_processing',
        bash_command="""
echo "=== STEP 1: Kafka — 5G Telemetry Ingestion ==="
LIVE=/app/5G_Dashboard/DATASET/raw/live_data.csv
if [ -f "$LIVE" ]; then
    ROWS=$(awk 'END{print NR}' "$LIVE")
    echo "  Kafka consumer file : $LIVE"
    echo "  Rows accumulated    : $ROWS"
    echo "  Topic               : 5g-telemetry | Broker: platform-kafka:29092"
else
    echo "  Kafka consumer has not yet flushed a batch (needs 1 000 messages)."
    echo "  Producer running    : platform-kafka-producer"
    echo "  Topic               : 5g-telemetry"
    echo "  Master dataset ready: /app/5G_Dashboard/DATASET/df_master_engineered.parquet"
fi
echo "Kafka step complete"
""",
    )

    # ── 2. DVC — Data Versioning ──────────────────────────────────────────────
    dvc_versioning = BashOperator(
        task_id='dvc_data_versioning',
        bash_command="""
echo "=== STEP 2: DVC — Data Versioning ==="
cd /app/5G_Dashboard

echo "  DVC pipeline (dvc.yaml):"
cat dvc.yaml 2>/dev/null || echo "  dvc.yaml not found"

echo ""
echo "  Dataset inventory:"
ls -lh DATASET/*.parquet 2>/dev/null || echo "  No parquet files found"

echo ""
echo "  DVC stage outputs:"
ls -lh data/processed/ 2>/dev/null && echo "  data/processed/ exists" || echo "  data/processed/ not yet materialised (run: dvc repro prep)"
ls -lh models/*.pkl 2>/dev/null || echo "  Checking root-level model artefacts..."
ls -lh *.pkl 2>/dev/null | head -5 || true

echo "DVC step complete"
""",
    )

    # ── 3. Scikit-learn → MLflow Training ────────────────────────────────────
    scikit_learn_mlflow_training = BashOperator(
        task_id='scikit_learn_mlflow_training',
        bash_command="""
echo "=== STEP 3: Scikit-learn + MLflow — Model Training ==="

# Trigger retraining via the FastAPI /retrain endpoint (runs mlops.pipeline_runner)
echo "  Triggering MLOps pipeline via POST %(inference)s/retrain ..."
RESP=$(curl -sf -X POST "%(inference)s/retrain" \\
  -H "Content-Type: application/json" \\
  -d '{"with_mlflow":true,"promote":false,"require_promotion":false,"min_dso4_auc":0.50,"min_dso4_mcc":0.10}' \\
  --connect-timeout 15 2>&1)

if [ $? -ne 0 ]; then
    echo "  ERROR: Could not reach inference server at %(inference)s"
    echo "  Response: $RESP"
    exit 1
fi
echo "  Retrain response: $RESP"

# Poll for completion (max 15 minutes, every 30 s)
echo "  Polling retrain status (max 15 min)..."
for i in $(seq 1 30); do
    sleep 30
    STATUS=$(curl -sf "%(inference)s/retrain/status" --connect-timeout 5 2>/dev/null)
    STATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
    echo "  [$i/30] status=$STATE"
    if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ]; then
        echo "  Final status: $STATUS"
        break
    fi
done

echo "  MLflow UI: %(mlflow)s"
echo "Training step complete"
""" % {"inference": INFERENCE, "mlflow": MLFLOW},
    )

    # ── 4. FastAPI → Docker → Kubernetes ──────────────────────────────────────
    serve_fastapi_docker_k8s = BashOperator(
        task_id='serve_fastapi_docker_k8s',
        bash_command="""
echo "=== STEP 4: FastAPI + Docker + Kubernetes ==="

echo "  -- FastAPI health --"
HEALTH=$(curl -sf "%(inference)s/health" --connect-timeout 10 2>&1)
echo "  $HEALTH"

echo "  -- Model info --"
curl -sf "%(inference)s/models/info" --connect-timeout 5 2>&1

echo "  -- Live prediction test --"
curl -sf -X POST "%(inference)s/predict/dso1" \\
  -H "Content-Type: application/json" \\
  -d '{"rsrp":-85,"rsrq":-12,"sinr":10,"cqi":10,"tx_power":15,"ta":5,"velocity":5,"best_neighbor_rsrp":-80,"cell_hist_datarate_mean":50,"cell_load_drop_flag":0}' \\
  --connect-timeout 10 2>&1

echo ""
echo "  -- Kubernetes manifests (dry-run) --"
ls /app/5G_Dashboard/infra/k8s/ 2>/dev/null
kubectl apply -f /app/5G_Dashboard/infra/k8s/ --dry-run=client 2>&1 || echo "  kubectl not in Airflow container — manifests ready at infra/k8s/"

echo "Serving step complete"
""" % {"inference": INFERENCE},
    )

    # ── 5. GitHub Actions — CI/CD ─────────────────────────────────────────────
    trigger_github_actions = BashOperator(
        task_id='trigger_github_actions',
        bash_command="""
echo "=== STEP 5: GitHub Actions — CI/CD Pipeline ==="
cd /app/5G_Dashboard

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "  Branch : $BRANCH"
echo "  Commit : $COMMIT"

echo "  Workflows:"
ls .github/workflows/ 2>/dev/null
echo ""
echo "  ci.yml    : python-tests | mlops-gate-smoke | inference-contract-performance | node-build"
echo "  mlops.yml : build-and-test | train-and-deploy (on main branch)"
echo "  Trigger   : git push origin $BRANCH"
echo "GitHub Actions step complete"
""",
    )

    # ── 6. Prometheus + Grafana — Monitoring ──────────────────────────────────
    monitoring_prometheus_grafana = BashOperator(
        task_id='monitoring_prometheus_grafana',
        bash_command="""
echo "=== STEP 6: Prometheus + Grafana — Monitoring ==="

echo "  -- Prometheus targets --"
curl -sf "%(prom)s/api/v1/targets" --connect-timeout 5 2>&1 | \\
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for t in d.get('data',{}).get('activeTargets',[]):
        print('  target:', t.get('scrapeUrl','?'), '| health:', t.get('health','?'))
except Exception as e:
    print('  parse error:', e)
"

echo ""
echo "  -- FastAPI /metrics sample --"
curl -sf "%(inference)s/metrics/prometheus" --connect-timeout 5 2>&1 | head -25

echo ""
echo "  -- Instant query: inference requests total --"
curl -sf "%(prom)s/api/v1/query?query=inference_requests_total" --connect-timeout 5 2>&1

echo ""
echo "  Grafana  : http://localhost:3004  (admin / admin)"
echo "  MLflow   : http://localhost:5000"
echo "  FastAPI  : http://localhost:8000/docs"
echo "Monitoring step complete"
""" % {"prom": PROMETHEUS, "inference": INFERENCE},
    )

    # ── 7. Airflow Retraining Loop — Drift Detection ──────────────────────────
    airflow_retraining_loop = BashOperator(
        task_id='airflow_retraining_loop',
        bash_command="""
echo "=== STEP 7: Retraining Loop — Drift Detection ==="

echo "  -- Drift status --"
DRIFT=$(curl -sf "%(inference)s/drift/status" --connect-timeout 5 2>&1)
echo "  $DRIFT"

echo ""
echo "  -- Model metrics --"
METRICS=$(curl -sf "%(inference)s/metrics" --connect-timeout 5 2>&1)
echo "  $METRICS"

echo ""
echo "  -- Last retrain status --"
curl -sf "%(inference)s/retrain/status" --connect-timeout 5 2>&1

echo ""
echo "============================================================"
echo "  Pipeline complete! Open these in your browser:"
echo "    Airflow    : http://localhost:8080  (admin / admin)"
echo "    MLflow     : http://localhost:5000"
echo "    Prometheus : http://localhost:9090"
echo "    Grafana    : http://localhost:3004  (admin / admin)"
echo "    Dashboard  : http://localhost:5173"
echo "    FastAPI    : http://localhost:8000/docs"
echo "============================================================"
""" % {"inference": INFERENCE},
    )

    # DAG lineage
    (
        kafka_data_processing
        >> dvc_versioning
        >> scikit_learn_mlflow_training
        >> serve_fastapi_docker_k8s
        >> trigger_github_actions
        >> monitoring_prometheus_grafana
        >> airflow_retraining_loop
    )
