import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { Method } from "axios";

@Injectable()
export class GatewayService {
  constructor(private readonly config: ConfigService) {}

  private get userServiceBase() {
    return this.config.get<string>("USER_SERVICE_URL", "http://localhost:3001");
  }

  private get predictionServiceBase() {
    return this.config.get<string>("PREDICTION_SERVICE_URL", "http://localhost:3002");
  }

  private get dashboardServiceBase() {
    return this.config.get<string>("DASHBOARD_SERVICE_URL", "http://localhost:3003");
  }

  async proxy(baseUrl: string, path: string, method: Method, body?: unknown, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = token;
    const { data } = await axios.request({
      url: `${baseUrl}${path}`,
      method,
      data: body,
      headers,
      timeout: 10000,
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
}
