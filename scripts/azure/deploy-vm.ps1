# ============================================================
# 5G Dashboard - Azure VM Deployment (validation-ready)
# Reuses existing ACR acr5gdb6626 and rg-5g-dashboard
# Run from project root: .\scripts\azure\deploy-vm.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

$Suffix    = "6626"
$Rg        = "rg-5g-dashboard"
$Location  = "swedencentral"
$AcrName   = "acr5gdb6626"
$AcrServer = "acr5gdb6626.azurecr.io"
$VmName    = "vm5gdash"
$PgPass    = "5gDb!Secure6626"
$JwtAccess  = "jwt-access-$(New-Guid)"
$JwtRefresh = "jwt-refresh-$(New-Guid)"

Write-Host ""
Write-Host "=== 5G Dashboard -> Azure VM Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Step 0: Resource group + ACR
Write-Host "[0/7] Resource group + ACR..." -ForegroundColor Yellow
az group create --name $Rg --location $Location -o none
az acr show --name $AcrName -o none 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating ACR..." -ForegroundColor Gray
    az acr create --name $AcrName --resource-group $Rg --sku Basic --admin-enabled true --location $Location -o none
    if ($LASTEXITCODE -ne 0) { Write-Host "ACR creation failed" -ForegroundColor Red; exit 1 }
}
Write-Host "  ACR ready: $AcrServer" -ForegroundColor Green
$AcrUser = az acr credential show --name $AcrName --query username -o tsv
$AcrPass = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv
Write-Host "  ACR: $AcrServer" -ForegroundColor Green

# Build all images now (with fixed .dockerignore - should be fast)
Write-Host "[1/6] Building all images via ACR Tasks..." -ForegroundColor Yellow
$images = @(
    @{ tag="inference";          file="Dockerfile" },
    @{ tag="api-gateway";        file="docker/platform/api-gateway.Dockerfile" },
    @{ tag="user-service";       file="docker/platform/user-service.Dockerfile" },
    @{ tag="prediction-service"; file="docker/platform/prediction-service.Dockerfile" },
    @{ tag="dashboard-service";  file="docker/platform/dashboard-service.Dockerfile" },
    @{ tag="kafka-producer";     file="docker/platform/kafka_producer.Dockerfile" }
)
foreach ($img in $images) {
    Write-Host "  Building $($img.tag)..." -ForegroundColor Gray
    az acr build --registry $AcrName --image "$($img.tag):latest" --file $img.file . -o none
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed for $($img.tag)"; exit 1 }
    Write-Host "  OK $($img.tag)" -ForegroundColor Green
}

# Create VM with Docker pre-installed via cloud-init
Write-Host "[2/7] Creating VM (Standard_B2s, Ubuntu 22.04)..." -ForegroundColor Yellow

$CloudInit = @'
#cloud-config
packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
runcmd:
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  - echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable docker
  - systemctl start docker
  - usermod -aG docker azureuser
'@

$CloudInit | Out-File "$env:TEMP\cloud-init.yml" -Encoding utf8 -NoNewline

az vm create `
    --resource-group $Rg `
    --name $VmName `
    --image Ubuntu2204 `
    --size Standard_B2s `
    --admin-username azureuser `
    --generate-ssh-keys `
    --public-ip-sku Standard `
    --location $Location `
    --custom-data "$env:TEMP\cloud-init.yml" `
    -o table

if ($LASTEXITCODE -ne 0) { Write-Error "VM creation failed"; exit 1 }

$VmIp = az vm show -d --resource-group $Rg --name $VmName --query publicIps -o tsv
Write-Host "  VM IP: $VmIp" -ForegroundColor Green

# Open ports
Write-Host "[3/7] Opening firewall ports..." -ForegroundColor Yellow
az vm open-port --resource-group $Rg --name $VmName --port 80   --priority 100 -o none
az vm open-port --resource-group $Rg --name $VmName --port 3000 --priority 110 -o none
az vm open-port --resource-group $Rg --name $VmName --port 3003 --priority 120 -o none
Write-Host "  Ports 80, 3000, 3003 open" -ForegroundColor Green

# Build web image with VM's actual public IP baked in
Write-Host "[4/7] Building web frontend with VM IP ($VmIp)..." -ForegroundColor Yellow
az acr build `
    --registry $AcrName `
    --image "web:latest" `
    --file docker/platform/web.Dockerfile `
    --build-arg "VITE_API_BASE_URL=http://$VmIp`:3000" `
    --build-arg "VITE_WS_URL=http://$VmIp`:3003" `
    . -o none
Write-Host "  Web image built" -ForegroundColor Green

# Generate docker-compose.yml content and push to VM
Write-Host "[5/7] Deploying services on VM (this takes ~5 min to pull images)..." -ForegroundColor Yellow

# Wait for cloud-init Docker install to finish
Write-Host "  Waiting 3 min for VM to finish installing Docker..." -ForegroundColor Gray
Start-Sleep -Seconds 180

# Build compose file content with values filled in
$ComposeContent = @"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: platform
      POSTGRES_PASSWORD: platform123
      POSTGRES_DB: platform_users
    restart: unless-stopped
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U platform\"]
      interval: 10s
      retries: 5

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
    restart: unless-stopped

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: \"true\"
    depends_on:
      - zookeeper
    restart: unless-stopped

  user-service:
    image: ${AcrServer}/user-service:latest
    environment:
      USER_SERVICE_PORT: 3001
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_USER: platform
      POSTGRES_PASSWORD: platform123
      POSTGRES_DB: platform_users
      JWT_ACCESS_SECRET: ${JwtAccess}
      JWT_REFRESH_SECRET: ${JwtRefresh}
      JWT_ACCESS_EXPIRES: 15m
      JWT_REFRESH_EXPIRES: 7d
      ADMIN_EMAIL: admin@5g-dashboard.com
      ADMIN_PASSWORD: Admin5G!2024
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  inference:
    image: ${AcrServer}/inference:latest
    environment:
      PYTHONPATH: /app
    restart: unless-stopped

  prediction-service:
    image: ${AcrServer}/prediction-service:latest
    environment:
      PREDICTION_SERVICE_PORT: 3002
      PYTHON_INFERENCE_BASE_URL: http://inference:8000
    restart: unless-stopped

  dashboard-service:
    image: ${AcrServer}/dashboard-service:latest
    environment:
      DASHBOARD_SERVICE_PORT: 3003
      KAFKA_BROKER: kafka:29092
      KAFKA_TOPIC: 5g-telemetry
      KAFKA_GROUP_ID: dashboard-group
      INFERENCE_URL: http://inference:8000
      AI_ENABLED: "true"
    ports:
      - "3003:3003"
    restart: unless-stopped

  api-gateway:
    image: ${AcrServer}/api-gateway:latest
    environment:
      API_GATEWAY_PORT: 3000
      USER_SERVICE_URL: http://user-service:3001
      PREDICTION_SERVICE_URL: http://prediction-service:3002
      DASHBOARD_SERVICE_URL: http://dashboard-service:3003
      ML_SERVICE_URL: http://inference:8000
      JWT_ACCESS_SECRET: ${JwtAccess}
      LLM_API_KEY: sk-ea7d2d1704574e36b3c606de752fb653
      LLM_BASE_URL: https://tokenfactory.esprit.tn/api
      LLM_MODEL: hosted_vllm/Llama-3.1-70B-Instruct
    ports:
      - "3000:3000"
    restart: unless-stopped

  kafka-producer:
    image: ${AcrServer}/kafka-producer:latest
    environment:
      KAFKA_BROKER: kafka:29092
      KAFKA_TOPIC: 5g-telemetry
      DATASET_PATH: DATASET/df_master_engineered.parquet
      CELL_GPS_PATH: logs/cell_gps.json
    depends_on:
      - kafka
    restart: unless-stopped

  web:
    image: ${AcrServer}/web:latest
    ports:
      - "80:5173"
    restart: unless-stopped
"@

# Write compose to temp file
$ComposeContent | Out-File "$env:TEMP\vm-compose.yml" -Encoding utf8 -NoNewline

# Base64 encode it to safely pass through run-command
$ComposeBytes = [System.IO.File]::ReadAllBytes("$env:TEMP\vm-compose.yml")
$ComposeB64 = [Convert]::ToBase64String($ComposeBytes)

$SetupScript = "mkdir -p /app && echo '$ComposeB64' | base64 -d > /app/docker-compose.yml && docker login $AcrServer -u $AcrUser -p '$AcrPass' && cd /app && docker compose pull && docker compose up -d"

az vm run-command invoke `
    --resource-group $Rg `
    --name $VmName `
    --command-id RunShellScript `
    --scripts $SetupScript `
    -o none

if ($LASTEXITCODE -ne 0) { Write-Error "VM setup failed"; exit 1 }

# Step 6: Done
Write-Host ""
Write-Host "[7/7] Checking service health..." -ForegroundColor Yellow
Start-Sleep -Seconds 30
$HealthCheck = az vm run-command invoke `
    --resource-group $Rg --name $VmName `
    --command-id RunShellScript `
    --scripts "cd /app && docker compose ps --format 'table {{.Name}}\t{{.Status}}'" `
    --query "value[0].message" -o tsv 2>$null
Write-Host $HealthCheck

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  VALIDATION URLS (open on professor phone)" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Dashboard:   http://$VmIp" -ForegroundColor Cyan
Write-Host "  API Gateway: http://$VmIp:3000" -ForegroundColor Cyan
Write-Host "  Admin login: admin@5g-dashboard.com / Admin5G!2024" -ForegroundColor Yellow
Write-Host ""
Write-Host "  VM SSH (if needed): ssh azureuser@$VmIp" -ForegroundColor DarkGray
Write-Host "  Logs: ssh azureuser@$VmIp 'cd /app && docker compose logs -f'" -ForegroundColor DarkGray
Write-Host ""
Write-Host "To tear down after validation:" -ForegroundColor DarkGray
Write-Host "  az group delete --name $Rg --yes --no-wait" -ForegroundColor DarkGray
