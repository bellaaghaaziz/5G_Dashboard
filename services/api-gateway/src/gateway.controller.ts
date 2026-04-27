import { Body, Controller, Get, Headers, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { Roles } from "./auth/roles.decorator";
import { RolesGuard } from "./auth/roles.guard";
import { GatewayService } from "./gateway.service";

@Controller()
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Get("health")
  health() {
    return { status: "ok", service: "api-gateway" };
  }

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

  @Post("predict")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("network_operator", "data_scientist", "admin")
  predict(@Body() body: unknown) {
    return this.gatewayService.proxyToPrediction("/predict", "POST", body);
  }

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

  @Get("scientist/metrics")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("data_scientist", "admin")
  scientistMetrics() {
    return this.gatewayService.proxyToDashboard("/scientist/metrics", "GET");
  }
}
