import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller()
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get("health")
  health() {
    return this.dashboardService.getHealth();
  }

  // ── Operator ──

  @Get("operator/overview")
  operatorOverview() {
    return this.dashboardService.getOperatorOverview();
  }

  @Get("operator/map-events")
  mapEvents() {
    return this.dashboardService.getMapEvents();
  }

  @Post("operator/playback")
  setPlaybackState(@Body() state: { status?: "playing" | "paused"; timestamp?: number; speed?: number }) {
    return this.dashboardService.setPlaybackState(state);
  }

  @Get("operator/playback")
  getPlaybackState() {
    return this.dashboardService.getPlaybackState();
  }

  @Get("operator/ue-types")
  async getUETypes() {
    return this.dashboardService.getUETypes();
  }

  @Get("operator/cell-gps")
  getCellGps() {
    return this.dashboardService.getCellGps();
  }

  @Get("operator/dataset-handovers")
  async getDatasetHandovers() {
    return this.dashboardService.getDatasetHandovers();
  }

  @Get("operator/dataset-info")
  async getDatasetInfo() {
    return this.dashboardService.getDatasetInfo();
  }

  @Get("operator/handover-log")
  getHandoverLogs() {
    return this.dashboardService.getHandoverLogs();
  }

  @Get("operator/handover-history")
  getHandoverHistory() {
    return this.dashboardService.getHandoverHistoryComparison();
  }

  @Get("operator/all-towers")
  getAllTowers() {
    return this.dashboardService.getAllTowers();
  }

  // ── Scientist ──

  @Get("scientist/metrics")
  scientistMetrics() {
    return this.dashboardService.getScientistMetrics();
  }

  @Get("scientist/drift")
  async getDriftStatus() {
    return this.dashboardService.getDriftStatus();
  }

  @Post("scientist/retrain")
  async startRetrain() {
    return this.dashboardService.startRetraining();
  }

  @Get("scientist/retrain-status")
  async getRetrainStatus() {
    return this.dashboardService.getRetrainingStatus();
  }

  // ── System ──

  @Get("system/health")
  async systemHealth() {
    return this.dashboardService.getSystemHealth();
  }
}
