# ============================================================
# 5G Dashboard - Azure Container Apps Deployment
# Run from project root: .\scripts\azure\deploy.ps1
# Prerequisites: az login completed
# Estimated cost: ~$55-65/month (student credits: ~1.5 months)
# ============================================================

param(
    [string]$Suffix    = (Get-Random -Maximum 9999).ToString().PadLeft(4, "0"),
    [string]$Location  = "swedencentral",
    [string]$Rg        = "rg-5g-dashboard"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

# Resource names (globally unique where required)
$AcrName    = "acr5gdb$Suffix"
$PgServer   = "pg-5g-db-$Suffix"
$EhNs       = "eh5gkafka$Suffix"
$EhTopic    = "5g-telemetry"
$EnvName    = "env-5g-dashboard"
$LogWs      = "log-5g-dashboard-$Suffix"

# Secrets
$PgUser     = "pgadmin"
$PgPass     = "5gDb!Secure$Suffix"
$PgDb       = "platform_users"
$JwtAccess  = "azure-jwt-access-$(New-Guid)"
$JwtRefresh = "azure-jwt-refresh-$(New-Guid)"

Write-Host ""
Write-Host "=== 5G Dashboard -> Azure Container Apps ===" -ForegroundColor Cyan
Write-Host "    Suffix : $Suffix   Location : $Location" -ForegroundColor Cyan
Write-Host "    SAVE THIS SUFFIX: $Suffix" -ForegroundColor Yellow
Write-Host ""

# 1. Resource Group
Write-Host "[1/9] Resource group..." -ForegroundColor Yellow
az group create --name $Rg --location $Location -o table

# 2. Azure Container Registry
Write-Host "[2/9] Container Registry ($AcrName)..." -ForegroundColor Yellow
az acr create --name $AcrName --resource-group $Rg --sku Basic --admin-enabled true --location $Location -o table
if ($LASTEXITCODE -ne 0) { Write-Error "ACR creation failed - check region policy"; exit 1 }
$AcrServer = az acr show --name $AcrName --query loginServer -o tsv
$AcrUser   = az acr credential show --name $AcrName --query username -o tsv
$AcrPass2  = az acr credential show --name $AcrName --query "passwords[0].value" -o tsv
Write-Host "  ACR: $AcrServer" -ForegroundColor Green

# 3. PostgreSQL Flexible Server
Write-Host "[3/9] PostgreSQL ($PgServer) - takes ~3-5 min..." -ForegroundColor Yellow
az postgres flexible-server create `
    --name $PgServer --resource-group $Rg --location $Location `
    --admin-user $PgUser --admin-password $PgPass `
    --sku-name Standard_B1ms --tier Burstable --storage-size 32 --version 16 `
    --public-access 0.0.0.0 -o table
$PgHost = az postgres flexible-server show `
    --name $PgServer --resource-group $Rg `
    --query fullyQualifiedDomainName -o tsv
az postgres flexible-server db create `
    --server-name $PgServer --resource-group $Rg --database-name $PgDb -o none
Write-Host "  PostgreSQL: $PgHost" -ForegroundColor Green

# 4. Event Hubs (Kafka-compatible)
Write-Host "[4/9] Event Hubs ($EhNs)..." -ForegroundColor Yellow
az eventhubs namespace create `
    --name $EhNs --resource-group $Rg --location $Location `
    --sku Standard --capacity 1 -o table
az eventhubs eventhub create `
    --name $EhTopic --namespace-name $EhNs --resource-group $Rg `
    --partition-count 4 --retention-time 1 -o none
$EhConnStr = az eventhubs namespace authorization-rule keys list `
    --resource-group $Rg --namespace-name $EhNs `
    --name RootManageSharedAccessKey --query primaryConnectionString -o tsv
$KafkaBroker = "$EhNs.servicebus.windows.net:9093"
Write-Host "  Kafka endpoint: $KafkaBroker" -ForegroundColor Green

# 5. Container Apps Environment
Write-Host "[5/9] Container Apps environment..." -ForegroundColor Yellow
az monitor log-analytics workspace create `
    --resource-group $Rg --workspace-name $LogWs -o none
$LogId  = az monitor log-analytics workspace show `
    --resource-group $Rg --workspace-name $LogWs --query customerId -o tsv
$LogKey = az monitor log-analytics workspace get-shared-keys `
    --resource-group $Rg --workspace-name $LogWs --query primarySharedKey -o tsv
az containerapp env create `
    --name $EnvName --resource-group $Rg --location $Location `
    --logs-workspace-id $LogId --logs-workspace-key $LogKey -o table

# 6. Build backend images via ACR Tasks
Write-Host "[6/9] Building images (15-25 min)..." -ForegroundColor Yellow
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
    Write-Host "  OK $($img.tag)" -ForegroundColor Green
}

# Helper: create a Container App
function New-App {
    param($Name, $Image, $Cpu, $Mem, $Min, $Max, $Ingress, $Port, [string[]]$Env)
    $imgFull = if ($Image -notmatch "\.azurecr\.io") { "$AcrServer/$Image" } else { $Image }
    $argList = @(
        "--name", $Name, "--resource-group", $Rg, "--environment", $EnvName,
        "--image", $imgFull,
        "--registry-server", $AcrServer,
        "--registry-username", $AcrUser,
        "--registry-password", $AcrPass2,
        "--min-replicas", $Min, "--max-replicas", $Max,
        "--cpu", $Cpu, "--memory", $Mem
    )
    if ($Ingress) { $argList += @("--ingress", $Ingress, "--target-port", $Port) }
    if ($Env.Count -gt 0) { $argList += @("--env-vars") + $Env }
    $argList += "-o", "none"
    az containerapp create @argList
}

# 7. Deploy backend Container Apps
Write-Host "[7/9] Deploying container apps..." -ForegroundColor Yellow

Write-Host "  user-service..." -ForegroundColor Gray
New-App -Name "user-service" -Image "user-service:latest" `
    -Cpu 0.25 -Mem "0.5Gi" -Min 1 -Max 2 -Ingress "internal" -Port 3001 `
    -Env @(
        "USER_SERVICE_PORT=3001",
        "POSTGRES_HOST=$PgHost",
        "POSTGRES_PORT=5432",
        "POSTGRES_USER=$PgUser",
        "POSTGRES_PASSWORD=$PgPass",
        "POSTGRES_DB=$PgDb",
        "JWT_ACCESS_SECRET=$JwtAccess",
        "JWT_REFRESH_SECRET=$JwtRefresh",
        "JWT_ACCESS_EXPIRES=15m",
        "JWT_REFRESH_EXPIRES=7d",
        "ADMIN_EMAIL=admin@5g-dashboard.com",
        "ADMIN_PASSWORD=Admin5G!2024"
    )
Write-Host "  OK user-service" -ForegroundColor Green

Write-Host "  inference..." -ForegroundColor Gray
New-App -Name "inference" -Image "inference:latest" `
    -Cpu 0.5 -Mem "1.0Gi" -Min 1 -Max 2 -Ingress "internal" -Port 8000 `
    -Env @("PYTHONPATH=/app")
Write-Host "  OK inference" -ForegroundColor Green

Write-Host "  prediction-service..." -ForegroundColor Gray
New-App -Name "prediction-service" -Image "prediction-service:latest" `
    -Cpu 0.25 -Mem "0.5Gi" -Min 0 -Max 2 -Ingress "internal" -Port 3002 `
    -Env @(
        "PREDICTION_SERVICE_PORT=3002",
        "PYTHON_INFERENCE_BASE_URL=http://inference"
    )
Write-Host "  OK prediction-service" -ForegroundColor Green

Write-Host "  dashboard-service..." -ForegroundColor Gray
New-App -Name "dashboard-service" -Image "dashboard-service:latest" `
    -Cpu 0.5 -Mem "1.0Gi" -Min 1 -Max 2 -Ingress "external" -Port 3003 `
    -Env @(
        "DASHBOARD_SERVICE_PORT=3003",
        "KAFKA_BROKER=$KafkaBroker",
        "KAFKA_TOPIC=$EhTopic",
        "KAFKA_GROUP_ID=dashboard-group",
        "KAFKA_SASL_ENABLED=true",
        "KAFKA_CONNECTION_STRING=$EhConnStr",
        "CELL_GPS_PATH=/app/logs/cell_gps.json",
        "INFERENCE_URL=http://inference",
        "AI_ENABLED=true"
    )
Write-Host "  OK dashboard-service" -ForegroundColor Green

Write-Host "  api-gateway..." -ForegroundColor Gray
New-App -Name "api-gateway" -Image "api-gateway:latest" `
    -Cpu 0.5 -Mem "1.0Gi" -Min 1 -Max 3 -Ingress "external" -Port 3000 `
    -Env @(
        "API_GATEWAY_PORT=3000",
        "USER_SERVICE_URL=http://user-service",
        "PREDICTION_SERVICE_URL=http://prediction-service",
        "DASHBOARD_SERVICE_URL=http://dashboard-service",
        "ML_SERVICE_URL=http://inference",
        "JWT_ACCESS_SECRET=$JwtAccess",
        "LLM_API_KEY=sk-ea7d2d1704574e36b3c606de752fb653",
        "LLM_BASE_URL=https://tokenfactory.esprit.tn/api",
        "LLM_MODEL=hosted_vllm/Llama-3.1-70B-Instruct"
    )
Write-Host "  OK api-gateway" -ForegroundColor Green

Write-Host "  kafka-producer..." -ForegroundColor Gray
New-App -Name "kafka-producer" -Image "kafka-producer:latest" `
    -Cpu 0.25 -Mem "0.5Gi" -Min 1 -Max 1 -Ingress $null -Port $null `
    -Env @(
        "KAFKA_BROKER=$KafkaBroker",
        "KAFKA_TOPIC=$EhTopic",
        "KAFKA_SASL_ENABLED=true",
        "KAFKA_CONNECTION_STRING=$EhConnStr",
        "DATASET_PATH=DATASET/df_master_engineered.parquet",
        "CELL_GPS_PATH=logs/cell_gps.json"
    )
Write-Host "  OK kafka-producer" -ForegroundColor Green

# 8. Get FQDNs, build web image with correct URLs
Write-Host "[8/9] Building web frontend with Azure URLs..." -ForegroundColor Yellow

$GwFqdn   = az containerapp show --name api-gateway --resource-group $Rg `
    --query "properties.configuration.ingress.fqdn" -o tsv
$DashFqdn = az containerapp show --name dashboard-service --resource-group $Rg `
    --query "properties.configuration.ingress.fqdn" -o tsv

$ApiUrl = "https://$GwFqdn"
$WsUrl  = "https://$DashFqdn"

Write-Host "  API Gateway:       $ApiUrl" -ForegroundColor Gray
Write-Host "  Dashboard Service: $WsUrl" -ForegroundColor Gray
Write-Host "  Building web image..." -ForegroundColor Gray

az acr build `
    --registry $AcrName `
    --image "web:latest" `
    --file docker/platform/web.Dockerfile `
    --build-arg "VITE_API_BASE_URL=$ApiUrl" `
    --build-arg "VITE_WS_URL=$WsUrl" `
    . -o none

New-App -Name "web-frontend" -Image "web:latest" `
    -Cpu 0.25 -Mem "0.5Gi" -Min 1 -Max 2 -Ingress "external" -Port 5173 `
    -Env @()
Write-Host "  OK web-frontend" -ForegroundColor Green

# 9. Done
$WebFqdn = az containerapp show --name web-frontend --resource-group $Rg `
    --query "properties.configuration.ingress.fqdn" -o tsv

Write-Host ""
Write-Host "=== Deployment complete! ===" -ForegroundColor Green
Write-Host "  Dashboard:   https://$WebFqdn" -ForegroundColor Green
Write-Host "  API Gateway: $ApiUrl" -ForegroundColor Green
Write-Host "  WS / Dash:   $WsUrl" -ForegroundColor Green
Write-Host "  Resource group: $Rg" -ForegroundColor Green
Write-Host "  Suffix (save!): $Suffix" -ForegroundColor Yellow
Write-Host ""
Write-Host "To tear everything down:" -ForegroundColor DarkGray
Write-Host "  az group delete --name $Rg --yes --no-wait" -ForegroundColor DarkGray
