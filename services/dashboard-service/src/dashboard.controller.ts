import { Controller, Get } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("health")
  health() {
    return this.dashboardService.getHealth();
  }

  @Get("operator/overview")
  operatorOverview() {
    return this.dashboardService.getOperatorOverview();
  }

  @Get("operator/map-events")
  mapEvents() {
    return this.dashboardService.getMapEvents();
  }

  @Get("scientist/metrics")
  scientistMetrics() {
    return this.dashboardService.getScientistMetrics();
  }
}
