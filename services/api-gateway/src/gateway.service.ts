import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { Method } from "axios";

@Injectable()
export class GatewayService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private get userServiceBase() {
    return this.config.get<string>("USER_SERVICE_URL", "http://localhost:3001");
  }

  private get predictionServiceBase() {
    return this.config.get<string>("PREDICTION_SERVICE_URL", "http://localhost:3002");
  }

  private get dashboardServiceBase() {
    return this.config.get<string>("DASHBOARD_SERVICE_URL", "http://localhost:3003");
  }

  private get mlServiceBase() {
    return this.config.get<string>("ML_SERVICE_URL", "http://localhost:8000");
  }

  async proxy(baseUrl: string, path: string, method: Method, body?: unknown, token?: string, timeout = 10000) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = token;
    const { data } = await axios.request({
      url: `${baseUrl}${path}`,
      method,
      data: body,
      headers,
      timeout,
    });
    return data;
  }

  proxyToUser(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.userServiceBase, path, method, body, token);
  }

  proxyToPrediction(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.predictionServiceBase, path, method, body, token);
  }

  proxyToDashboard(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.dashboardServiceBase, path, method, body, token);
  }

  /** Long-timeout proxy for training requests (up to 120s). */
  proxyToDashboardLong(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.dashboardServiceBase, path, method, body, token, 120000);
  }

  proxyToML(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.mlServiceBase, path, method, body, token);
  }
}
