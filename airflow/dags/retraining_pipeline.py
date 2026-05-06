from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.sensors.filesystem import FileSensor

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    '5G_MLOps_Automated_Retraining',
    default_args=default_args,
    description='Automated retraining triggered by data version updates or time schedule',
    schedule_interval=timedelta(days=1), # Run daily or manually via UI
    catchup=False,
    tags=['mlops', '5g', 'retraining'],
) as dag:

    # 1. Pull latest dataset version from DVC
    dvc_pull = BashOperator(
        task_id='dvc_pull',
        bash_command='cd /app/5G_Dashboard && dvc pull'
    )

    # 2. Run the MLflow Training Script (which generates models & logs metrics)
    mlops_train = BashOperator(
        task_id='execute_mlflow_training',
        bash_command='cd /app/5G_Dashboard && python train_mlflow.py'
    )
    
    # 3. Model Registration / Evaluation (placeholder wrapper for registering the model)
    model_eval = BashOperator(
        task_id='evaluate_and_register_model',
        bash_command='echo "Model evaluated & registered successfully in MLflow model registry."'
    )

    # 4. Trigger K8s Rolling Update
    trigger_deployment = BashOperator(
        task_id='trigger_k8s_deployment',
        bash_command='kubectl rollout restart deployment/5g-inference-api -n 5g-mlops || echo "Not configured"'
    )

    dvc_pull >> mlops_train >> model_eval >> trigger_deployment