import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
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

  // ── Prediction ──

  @Post("predict")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "data_scientist", "admin")
  predict(@Body() body: unknown) {
    return this.gatewayService.proxyToPrediction("/predict", "POST", body);
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

  @Get("operator/dataset-handovers")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "admin")
  getDatasetHandovers() {
    return this.gatewayService.proxyToDashboard("/operator/dataset-handovers", "GET");
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
  @Roles("data_scientist", "admin")
  scientistMetrics() {
    return this.gatewayService.proxyToDashboard("/scientist/metrics", "GET");
  }

  @Get("scientist/drift")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "admin")
  getDrift() {
    return this.gatewayService.proxyToDashboard("/scientist/drift", "GET");
  }

  @Post("scientist/retrain")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "admin")
  startRetrain() {
    return this.gatewayService.proxyToDashboardLong("/scientist/retrain", "POST");
  }

  @Get("scientist/retrain-status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "admin")
  getRetrainStatus() {
    return this.gatewayService.proxyToDashboard("/scientist/retrain-status", "GET");
  }

  // ── System Health ──

  @Get("system/health")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  systemHealth() {
    return this.gatewayService.proxyToDashboard("/system/health", "GET");
  }
}
