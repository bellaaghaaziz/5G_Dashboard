# ═══════════════════════════════════════════════════════════════════════════
# Makefile — 5G Handover AI MLOps Pipeline (v9)
#
# Usage:
#   make help          — show all targets
#   make train         — full training pipeline
#   make test          — run model validation suite
#   make api           — start FastAPI server
#   make app           — start Streamlit dashboard
#   make mlflow-train  — train with MLflow tracking
#   make mlflow-ui     — open MLflow UI
#   make docker-build  — build Docker image
#   make compose-up    — start all services (API + Dashboard + MLflow)
#   make elk-up        — start ELK monitoring stack
#   make all           — train → test → docker-build
# ═══════════════════════════════════════════════════════════════════════════

PYTHON      := python
PIP         := pip
IMAGE       := 5g-handover-ai:latest
PORT_APP    := 8501
PORT_API    := 8000
PORT_MLFLOW := 5000

.DEFAULT_GOAL := help

# ─── Colours ──────────────────────────────────────────────────────────────────
CYAN  := \033[1;36m
GREEN := \033[1;32m
RED   := \033[1;31m
RESET := \033[0m

.PHONY: help
help:
	@echo ""
	@echo "$(CYAN)5G Handover AI — MLOps Pipeline (v9)$(RESET)"
	@echo "════════════════════════════════════════════"
	@echo ""
	@echo "  $(GREEN)Training & Evaluation$(RESET)"
	@echo "    make train          Full training pipeline (prepare → train → evaluate → save)"
	@echo "    make evaluate       Load saved models and re-evaluate metrics"
	@echo "    make test           Run AI model validation suite (test_models.py)"
	@echo ""
	@echo "  $(GREEN)Serving$(RESET)"
	@echo "    make api            Start FastAPI on http://localhost:$(PORT_API)"
	@echo "    make app            Start Streamlit on http://localhost:$(PORT_APP)"
	@echo ""
	@echo "  $(GREEN)MLflow$(RESET)"
	@echo "    make mlflow-train   Train with MLflow experiment tracking"
	@echo "    make mlflow-ui      Open MLflow UI on http://localhost:$(PORT_MLFLOW)"
	@echo ""
	@echo "  $(GREEN)Docker$(RESET)"
	@echo "    make docker-build   Build Docker image ($(IMAGE))"
	@echo "    make compose-up     Start all services (API + Dashboard + MLflow)"
	@echo "    make compose-down   Stop all services"
	@echo ""
	@echo "  $(GREEN)Monitoring$(RESET)"
	@echo "    make elk-up         Start Elasticsearch + Kibana + Filebeat"
	@echo "    make elk-down       Stop ELK stack"
	@echo "    make perf-test      Run inference contract + latency guardrail tests"
	@echo ""
	@echo "  $(GREEN)Platform$(RESET)"
	@echo "    make platform-up    Start NestJS microservices + React app"
	@echo "    make platform-down  Stop platform microservices"
	@echo "    make k8s-apply      Apply Kubernetes stack (inference + Prometheus + Grafana)"
	@echo "    make k8s-delete     Delete Kubernetes stack manifests"
	@echo "    make tf-fmt         Terraform fmt (infra/terraform)"
	@echo "    make tf-validate    Terraform init -backend=false + validate"
	@echo "    make tf-plan        Terraform init + plan"
	@echo "    make tf-apply       Terraform init + apply"
	@echo "    make tf-destroy     Terraform init + destroy"
	@echo ""
	@echo "  $(GREEN)Utilities$(RESET)"
	@echo "    make install        Install Python dependencies"
	@echo "    make clean          Remove logs, caches, temp files"
	@echo "    make all            train → test → docker-build"
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────
.PHONY: install
install:
	$(PIP) install -r requirements.txt
	@echo "$(GREEN)✅ Dependencies installed$(RESET)"

# ─── Training ─────────────────────────────────────────────────────────────────
.PHONY: train
train:
	@echo "$(CYAN)▶ Running full training pipeline…$(RESET)"
	$(PYTHON) main.py train
	@echo "$(GREEN)✅ Training complete$(RESET)"

.PHONY: evaluate
evaluate:
	@echo "$(CYAN)▶ Evaluating saved models…$(RESET)"
	$(PYTHON) main.py evaluate

# ─── Testing ──────────────────────────────────────────────────────────────────
.PHONY: test
test:
	@echo "$(CYAN)▶ Running model validation suite…$(RESET)"
	$(PYTHON) -m pytest -q
	@echo "$(GREEN)✅ All tests passed$(RESET)"

# ─── FastAPI ──────────────────────────────────────────────────────────────────
.PHONY: api
api:
	@echo "$(CYAN)▶ Starting FastAPI on http://localhost:$(PORT_API)$(RESET)"
	$(PYTHON) -m uvicorn api:app --host 127.0.0.1 --port $(PORT_API) --reload

# ─── Streamlit ────────────────────────────────────────────────────────────────
.PHONY: app
app:
	@echo "$(CYAN)▶ Starting Streamlit on http://localhost:$(PORT_APP)$(RESET)"
	streamlit run app.py --server.port $(PORT_APP) --server.address 0.0.0.0

# ─── MLflow ───────────────────────────────────────────────────────────────────
.PHONY: mlflow-train
mlflow-train:
	@echo "$(CYAN)▶ Training with MLflow tracking…$(RESET)"
	$(PYTHON) main.py train --with-mlflow

.PHONY: mlflow-ui
mlflow-ui:
	@echo "$(CYAN)▶ Starting MLflow UI on http://localhost:$(PORT_MLFLOW)$(RESET)"
	$(PYTHON) -m mlflow ui --port $(PORT_MLFLOW) --host 0.0.0.0 --backend-store-uri sqlite:///mlflow.db

# ─── Docker ───────────────────────────────────────────────────────────────────
.PHONY: docker-build
docker-build:
	@echo "$(CYAN)▶ Building Docker image: $(IMAGE)$(RESET)"
	docker build -t $(IMAGE) .
	@echo "$(GREEN)✅ Image built: $(IMAGE)$(RESET)"

.PHONY: docker-run
docker-run:
	@echo "$(CYAN)▶ Running API container on http://localhost:$(PORT_API)$(RESET)"
	docker run --rm -p $(PORT_API):8000 $(IMAGE) api

.PHONY: compose-up
compose-up:
	@echo "$(CYAN)▶ Starting all services…$(RESET)"
	docker compose up -d --build
	@echo "$(GREEN)✅ API:       http://localhost:$(PORT_API)$(RESET)"
	@echo "$(GREEN)✅ Dashboard: http://localhost:$(PORT_APP)$(RESET)"
	@echo "$(GREEN)✅ MLflow:    http://localhost:$(PORT_MLFLOW)$(RESET)"

.PHONY: compose-down
compose-down:
	docker compose down

# ─── ELK Stack ────────────────────────────────────────────────────────────────
.PHONY: elk-up
elk-up:
	@echo "$(CYAN)▶ Starting ELK stack…$(RESET)"
	docker compose -f docker-compose.elk.yml up -d
	@echo "$(GREEN)✅ Kibana:        http://localhost:5601$(RESET)"
	@echo "$(GREEN)✅ Elasticsearch: http://localhost:9200$(RESET)"

.PHONY: elk-down
elk-down:
	docker compose -f docker-compose.elk.yml down

# ─── Platform Microservices ───────────────────────────────────────────────────
.PHONY: platform-up
platform-up:
	@echo "$(CYAN)▶ Starting platform microservices stack…$(RESET)"
	docker compose -f docker-compose.platform.yml up -d --build
	@echo "$(GREEN)✅ Gateway:    http://localhost:3000$(RESET)"
	@echo "$(GREEN)✅ Web App:    http://localhost:5173$(RESET)"
	@echo "$(GREEN)✅ User Svc:   http://localhost:3001/health$(RESET)"
	@echo "$(GREEN)✅ Predict Svc:http://localhost:3002/health$(RESET)"
	@echo "$(GREEN)✅ Dash Svc:   http://localhost:3003/health$(RESET)"

.PHONY: platform-down
platform-down:
	docker compose -f docker-compose.platform.yml down

# ─── End-to-end MLOps pipeline (data → train → eval → gate → mlflow) ──────────
.PHONY: mlops-pipeline
mlops-pipeline:
	@echo "$(CYAN)▶ Running end-to-end MLOps pipeline (with quality gate)…$(RESET)"
	$(PYTHON) -m mlops.pipeline_runner --data-path DATASET/df_master_engineered.parquet --with-mlflow --promote

# ─── Performance & Contract Checks ────────────────────────────────────────────
.PHONY: perf-test
perf-test:
	@echo "$(CYAN)▶ Running inference contract + performance tests…$(RESET)"
	$(PYTHON) -m pytest -q tests/test_inference_contract_perf.py

# ─── Kubernetes Ops ───────────────────────────────────────────────────────────
.PHONY: k8s-apply
k8s-apply:
	@echo "$(CYAN)▶ Applying Kubernetes manifests…$(RESET)"
	kubectl apply -f infra/k8s/namespace.yaml
	kubectl apply -f infra/k8s/inference-configmap.yaml
	kubectl apply -f infra/k8s/inference-deployment.yaml
	kubectl apply -f infra/k8s/inference-service.yaml
	kubectl apply -f infra/k8s/inference-hpa.yaml
	kubectl apply -f infra/k8s/prometheus-deployment.yaml
	kubectl apply -f infra/k8s/prometheus-service.yaml
	kubectl apply -f infra/k8s/grafana-deployment.yaml
	kubectl apply -f infra/k8s/grafana-service.yaml

.PHONY: k8s-delete
k8s-delete:
	@echo "$(CYAN)▶ Deleting Kubernetes manifests…$(RESET)"
	-kubectl delete -f infra/k8s/grafana-service.yaml
	-kubectl delete -f infra/k8s/grafana-deployment.yaml
	-kubectl delete -f infra/k8s/prometheus-service.yaml
	-kubectl delete -f infra/k8s/prometheus-deployment.yaml
	-kubectl delete -f infra/k8s/inference-hpa.yaml
	-kubectl delete -f infra/k8s/inference-service.yaml
	-kubectl delete -f infra/k8s/inference-deployment.yaml
	-kubectl delete -f infra/k8s/inference-configmap.yaml
	-kubectl delete -f infra/k8s/namespace.yaml

# ─── Terraform Ops ────────────────────────────────────────────────────────────
.PHONY: tf-fmt
tf-fmt:
	@echo "$(CYAN)▶ Terraform fmt…$(RESET)"
	terraform -chdir=infra/terraform fmt -recursive

.PHONY: tf-validate
tf-validate:
	@echo "$(CYAN)▶ Terraform validate…$(RESET)"
	terraform -chdir=infra/terraform init -backend=false
	terraform -chdir=infra/terraform validate

.PHONY: tf-plan
tf-plan:
	@echo "$(CYAN)▶ Terraform plan…$(RESET)"
	terraform -chdir=infra/terraform init
	terraform -chdir=infra/terraform plan

.PHONY: tf-apply
tf-apply:
	@echo "$(CYAN)▶ Terraform apply…$(RESET)"
	terraform -chdir=infra/terraform init
	terraform -chdir=infra/terraform apply -auto-approve

.PHONY: tf-destroy
tf-destroy:
	@echo "$(CYAN)▶ Terraform destroy…$(RESET)"
	terraform -chdir=infra/terraform init
	terraform -chdir=infra/terraform destroy -auto-approve

# ─── Full pipeline ────────────────────────────────────────────────────────────
.PHONY: all
all: train test docker-build
	@echo "$(GREEN)✅ Full pipeline complete$(RESET)"

# ─── Clean ────────────────────────────────────────────────────────────────────
.PHONY: clean
clean:
	@echo "$(CYAN)▶ Cleaning…$(RESET)"
	-$(PYTHON) -c "import shutil, pathlib; [shutil.rmtree(p) for p in pathlib.Path('.').rglob('__pycache__')]" 2>NUL
	-del /q logs\*.log 2>NUL
	-del /q mlflow.db 2>NUL
	@echo "$(GREEN)✅ Clean$(RESET)"
