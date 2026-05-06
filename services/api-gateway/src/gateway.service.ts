import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { Method } from "axios";
import OpenAI from "openai";

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

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
    try {
      const { data } = await axios.request({
        url: `${baseUrl}${path}`,
        method,
        data: body,
        headers,
        timeout,
      });
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new (require("@nestjs/common").HttpException)(error.response.data, error.response.status);
      }
      throw error;
    }
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
