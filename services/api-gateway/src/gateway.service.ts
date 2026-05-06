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

  private get prometheusBase() {
    return this.config.get<string>("PROMETHEUS_URL", "http://localhost:9090");
  }

  private get grafanaBase() {
    return this.config.get<string>("GRAFANA_URL", "http://localhost:3000");
  }

  private get mlflowBase() {
    return this.config.get<string>("MLFLOW_URL", "http://localhost:5000");
  }

  private get k8sBase() {
    return this.config.get<string>("K8S_DASHBOARD_URL", "http://localhost:8001");
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

  proxyToPrometheus(path: string, method: Method, body?: unknown, token?: string) {
    // Prometheus often returns plain text; increase timeout for complex queries
    return this.proxy(this.prometheusBase, path, method, body, token, 20000);
  }

  proxyToGrafana(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.grafanaBase, path, method, body, token);
  }

  proxyToMLflow(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.mlflowBase, path, method, body, token);
  }

  proxyToK8s(path: string, method: Method, body?: unknown, token?: string) {
    return this.proxy(this.k8sBase, path, method, body, token);
  }
}
