import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { Roles } from "./auth/roles.decorator";
import { RolesGuard } from "./auth/roles.guard";
import { GatewayService } from "./gateway.service";

@Controller()
export class GatewayController {
  constructor(@Inject(GatewayService) private readonly gatewayService: GatewayService) {}

  @Get("health")
  health() {
    return { status: "ok", service: "api-gateway" };
  }

  // ── Auth ──

  @Post("auth/signup")
  signup(@Body() body: unknown) {
    return this.gatewayService.proxyToUser("/auth/signup", "POST", body);
  }

  @Post("auth/signin")
  signin(@Body() body: unknown) {
    return this.gatewayService.proxyToUser("/auth/signin", "POST", body);
  }

  @Post("auth/refresh")
  refresh(@Body() body: unknown) {
    return this.gatewayService.proxyToUser("/auth/refresh", "POST", body);
  }

  @Post("auth/signout")
  @UseGuards(JwtAuthGuard)
  signout(@Headers("authorization") authHeader: string, @Body() body: unknown) {
    return this.gatewayService.proxyToUser("/auth/signout", "POST", body, authHeader);
  }

  @Get("auth/me")
  @UseGuards(JwtAuthGuard)
  me(@Headers("authorization") authHeader: string) {
    return this.gatewayService.proxyToUser("/auth/me", "GET", undefined, authHeader);
  }

  // ── Admin ──

  @Get("admin/users")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  users(@Headers("authorization") authHeader: string) {
    return this.gatewayService.proxyToUser("/users", "GET", undefined, authHeader);
  }

  @Post("admin/users")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  createUser(@Headers("authorization") authHeader: string, @Body() body: unknown) {
    return this.gatewayService.proxyToUser("/users", "POST", body, authHeader);
  }

  @Delete("admin/users/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  deleteUser(@Headers("authorization") authHeader: string, @Param("id") id: string) {
    return this.gatewayService.proxyToUser(`/users/${id}`, "DELETE", undefined, authHeader);
  }

  // ── Prediction ──

  @Post("predict")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "data_scientist", "ml_engineer", "admin")
  predict(@Body() body: unknown) {
    return this.gatewayService.proxyToPrediction("/predict", "POST", body);
  }

  // ── MLOps (ML service) ──

  @Post("mlops/run")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlopsRun(@Body() body: unknown) {
    return this.gatewayService.proxyToML("/mlops/run", "POST", body);
  }

  @Get("mlops/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlopsStatus() {
    return this.gatewayService.proxyToML("/mlops/status", "GET");
  }

  @Get("mlops/history")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlopsHistory() {
    return this.gatewayService.proxyToML("/mlops/history", "GET");
  }

  @Get("mlops/mlflow-summary")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlflowSummary() {
    return this.gatewayService.proxyToML("/mlops/mlflow-summary", "GET");
  }

  @Get("mlops/shap/:dso")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlopsShap(@Param("dso") dso: string) {
    return this.gatewayService.proxyToML(`/shap/${dso}`, "GET");
  }

  @Get("mlops/dvc/dag")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  dvcDag() {
    return this.gatewayService.proxyToML("/dvc/dag", "GET");
  }

  @Get("mlops/dvc/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  dvcStatus() {
    return this.gatewayService.proxyToML("/dvc/status", "GET");
  }

  @Post("mlops/dvc/repro")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  dvcRepro(@Body() body: unknown) {
    return this.gatewayService.proxyToMLLong("/dvc/repro", "POST", body);
  }

  @Post("mlops/auto-retrain")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  autoRetrain() {
    return this.gatewayService.proxyToMLLong("/mlops/auto-retrain", "POST");
  }

  @Get("mlops/champion-metrics")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  championMetrics() {
    return this.gatewayService.proxyToML("/mlops/champion-metrics", "GET");
  }

  // ── Prometheus / Grafana / MLflow UI proxies ──

  @Get("prometheus/query")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  prometheusQuery(@Headers("authorization") authHeader: string, @Inject("REQUEST") req: any) {
    const q = req.query?.query || req.query?.q || "";
    const start = req.query?.start ? `&start=${encodeURIComponent(req.query.start)}` : "";
    const end = req.query?.end ? `&end=${encodeURIComponent(req.query.end)}` : "";
    const step = req.query?.step ? `&step=${encodeURIComponent(req.query.step)}` : "";
    const path = `/api/v1/query?query=${encodeURIComponent(q)}${start}${end}${step}`;
    return this.gatewayService.proxyToPrometheus(path, "GET", undefined, authHeader);
  }

  @Get("prometheus/query_range")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  prometheusQueryRange(@Headers("authorization") authHeader: string, @Inject("REQUEST") req: any) {
    const q = req.query?.query || req.query?.q || "";
    const start = req.query?.start || "";
    const end = req.query?.end || "";
    const step = req.query?.step || "";
    const path = `/api/v1/query_range?query=${encodeURIComponent(q)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&step=${encodeURIComponent(step)}`;
    return this.gatewayService.proxyToPrometheus(path, "GET", undefined, authHeader);
  }

  @Get("grafana/search")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  grafanaSearch(@Headers("authorization") authHeader: string, @Inject("REQUEST") req: any) {
    const q = req.query?.query || req.query?.q || "";
    const path = `/api/search?query=${encodeURIComponent(q)}`;
    return this.gatewayService.proxyToGrafana(path, "GET", undefined, authHeader);
  }

  @Get("grafana/dashboards/:uid")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  grafanaDashboard(@Headers("authorization") authHeader: string, @Inject("REQUEST") req: any) {
    const uid = req.params?.uid;
    const path = `/api/dashboards/uid/${uid}`;
    return this.gatewayService.proxyToGrafana(path, "GET", undefined, authHeader);
  }

  @Get("mlflow/ui")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ml_engineer", "admin")
  mlflowUi(@Headers("authorization") authHeader: string) {
    // Proxy to MLflow UI root
    return this.gatewayService.proxyToMLflow("/", "GET", undefined, authHeader);
  }

  // ── Operator ──

  @Get("operator/overview")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  operatorOverview() {
    return this.gatewayService.proxyToDashboard("/operator/overview", "GET");
  }

  @Get("operator/map-events")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  mapEvents() {
    return this.gatewayService.proxyToDashboard("/operator/map-events", "GET");
  }

  @Get("operator/trip-paths")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getTripPaths() {
    return this.gatewayService.proxyToDashboard("/operator/trip-paths", "GET");
  }

  @Post("operator/playback")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  setPlayback(@Body() body: unknown) {
    return this.gatewayService.proxyToDashboard("/operator/playback", "POST", body);
  }

  @Get("operator/playback")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getPlayback() {
    return this.gatewayService.proxyToDashboard("/operator/playback", "GET");
  }

  @Get("operator/ue-types")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getUETypes() {
    return this.gatewayService.proxyToDashboard("/operator/ue-types", "GET");
  }

  @Get("operator/cell-gps")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getCellGps() {
    return this.gatewayService.proxyToDashboard("/operator/cell-gps", "GET");
  }

  @Get("operator/all-towers")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getAllTowers() {
    return this.gatewayService.proxyToDashboard("/operator/all-towers", "GET");
  }

  @Get("operator/handover-log")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getHandoverLogs() {
    return this.gatewayService.proxyToDashboard("/operator/handover-log", "GET");
  }

  @Get("operator/handover-history")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getHandoverHistory() {
    return this.gatewayService.proxyToDashboard("/operator/handover-history", "GET");
  }

  @Get("operator/dataset-map")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getDatasetMap() {
    return this.gatewayService.proxyToDashboard("/operator/dataset-map", "GET");
  }

  @Get("operator/dataset-handovers")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getDatasetHandovers() {
    return this.gatewayService.proxyToDashboard("/operator/dataset-handovers", "GET");
  }

  @Get("operator/dataset-overview")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getDatasetOverview() {
    return this.gatewayService.proxyToDashboard("/operator/dataset-overview", "GET");
  }

  @Get("operator/tower-stats")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getTowerStats() {
    return this.gatewayService.proxyToDashboard("/operator/tower-stats", "GET");
  }

  @Get("operator/dataset-info")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getDatasetInfo() {
    return this.gatewayService.proxyToDashboard("/operator/dataset-info", "GET");
  }

  // ── Scientist ──

  @Get("scientist/metrics")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "ml_engineer", "admin")
  scientistMetrics() {
    return this.gatewayService.proxyToDashboard("/scientist/metrics", "GET");
  }

  @Get("scientist/drift")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "ml_engineer", "admin")
  getDrift() {
    return this.gatewayService.proxyToDashboard("/scientist/drift", "GET");
  }

  @Post("scientist/retrain")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "ml_engineer", "admin")
  startRetrain() {
    return this.gatewayService.proxyToDashboardLong("/scientist/retrain", "POST");
  }

  @Get("scientist/retrain-status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "ml_engineer", "admin")
  getRetrainStatus() {
    return this.gatewayService.proxyToDashboard("/scientist/retrain-status", "GET");
  }

  // ── System Health ──

  @Get("system/health")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "ml_engineer")
  systemHealth() {
    return this.gatewayService.proxyToDashboard("/system/health", "GET");
  }
}
