import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import axios from "axios";

type PredictionLog = {
  event_timestamp?: string;
  inputs?: {
    physical_cellid?: number;
    rsrp?: number;
    rsrq?: number;
    sinr?: number;
    ta?: number;
    velocity?: number;
    master_id?: string;
    scenario?: string;
    cqi?: number;
    datarate?: number;
    num_neighbors?: number;
  };
  outputs?: {
    dso1_risk_score?: number;
    dso3_cluster?: number;
    dso3_label?: string;
    dso4_probability?: number;
    handover_recommended?: boolean;
    latency_ms?: number;
    decision_source?: string;
  };
  latency_ms?: number;
  handover_recommended?: boolean;
};

@Injectable()
export class DashboardService {
  private readonly logsPath =
    process.env.PREDICTIONS_LOG_PATH ?? "/app/shared-logs/predictions.json";
  private readonly playbackPath =
    process.env.PLAYBACK_STATE_PATH ?? "/app/shared-logs/playback_state.json";
  private readonly metricsPath =
    process.env.METRICS_PATH ?? "/app/shared-logs/metrics.json";
  private readonly mlServiceUrl =
    process.env.ML_SERVICE_URL ?? "http://localhost:8000";
  private readonly gpsPath =
    process.env.CELL_GPS_PATH ??
    require("path").join(process.cwd(), "..", "..", "logs", "cell_gps.json");

  getCellGps(): Record<string, { lat: number; lng: number; scenario: string }> {
    if (!existsSync(this.gpsPath)) return {};
    try {
      return JSON.parse(readFileSync(this.gpsPath, "utf-8"));
    } catch {
      return {};
    }
  }

  private readPredictionLogs(): PredictionLog[] {
    if (!existsSync(this.logsPath)) return [];
    const raw = readFileSync(this.logsPath, "utf-8").trim();
    if (!raw) return [];

    return raw
      .split("\n")
      .slice(-500)
      .map((line) => {
        try {
          return JSON.parse(line) as PredictionLog;
        } catch {
          return null;
        }
      })
      .filter((item): item is PredictionLog => item !== null);
  }

  private toMs(iso?: string): number {
    if (!iso) return 0;
    const value = Date.parse(iso);
    return Number.isFinite(value) ? value : 0;
  }

  getHealth() {
    return { status: "ok", service: "dashboard-service", logsPath: this.logsPath };
  }

  // ── Playback Controls ──

  setPlaybackState(state: { status?: "playing" | "paused"; timestamp?: number; speed?: number }) {
    let current: any = { status: "playing", timestamp: null, speed: 1.0 };
    try {
      if (existsSync(this.playbackPath)) {
        current = JSON.parse(readFileSync(this.playbackPath, "utf-8"));
      }
    } catch (e) {}

    const nextState = { ...current, ...state };
    writeFileSync(this.playbackPath, JSON.stringify(nextState));
    return nextState;
  }

  getPlaybackState() {
    try {
      if (existsSync(this.playbackPath)) {
        return JSON.parse(readFileSync(this.playbackPath, "utf-8"));
      }
    } catch (e) {}
    return { status: "playing", timestamp: null, speed: 1.0 };
  }

  // ── Operator Overview ──

  getOperatorOverview() {
    const rows = this.readPredictionLogs();
    const latestTimestampMs =
      rows.length > 0 ? this.toMs(rows[rows.length - 1].event_timestamp) : Date.now();

    const lastHour = rows.filter(
      (r) => latestTimestampMs - this.toMs(r.event_timestamp) <= 60 * 60 * 1000,
    );
    const last15Min = rows.filter(
      (r) => latestTimestampMs - this.toMs(r.event_timestamp) <= 15 * 60 * 1000,
    );

    const recommendationsLastHour = lastHour.filter(
      (r) => (r.outputs?.handover_recommended ?? r.handover_recommended) === true,
    ).length;

    const highRiskLastHour = lastHour.filter((r) => (r.outputs?.dso4_probability ?? 0) >= 0.7).length;
    const latencyRows = lastHour
      .map((r) => r.outputs?.latency_ms ?? r.latency_ms ?? 0)
      .filter((x) => x > 0);
    const avgLatency =
      latencyRows.length > 0
        ? Number((latencyRows.reduce((a, b) => a + b, 0) / latencyRows.length).toFixed(2))
        : 0;

    const alerts: Array<{ id: string; severity: "high" | "medium"; message: string }> = [];
    if (highRiskLastHour > 0) {
      alerts.push({
        id: "risk-spike",
        severity: "high",
        message: `${highRiskLastHour} high-risk prediction(s) in the last hour (dso4_probability >= 0.70).`,
      });
    }
    if (recommendationsLastHour > 0) {
      alerts.push({
        id: "ho-rec",
        severity: "medium",
        message: `${recommendationsLastHour} handover recommendation(s) generated in the last hour.`,
      });
    }

    return {
      kpis: {
        recentPredictions15m: last15Min.length,
        handoverRecommendationsLastHour: recommendationsLastHour,
        avgLatencyMs: avgLatency,
        highRiskPredictionsLastHour: highRiskLastHour,
      },
      alerts,
      source: {
        type: "prediction_logs",
        path: this.logsPath,
        simulatedTime: latestTimestampMs,
      },
    };
  }

  // ── Map Events with UE type info ──

  getMapEvents() {
    const rows = this.readPredictionLogs();

    return rows.slice(-300).map((row, idx) => {
      const anyRow = row as any;
      // Support both formats: new elk_logger (top-level) and old simulate_traffic (inputs)
      const masterId = anyRow.master_id ?? row.inputs?.master_id ?? `Cell-${row.inputs?.physical_cellid ?? idx}`;
      const uelat = anyRow.ue_lat ?? (row.inputs as any)?.ue_lat ?? null;
      const uelng = anyRow.ue_lng ?? (row.inputs as any)?.ue_lng ?? null;
      const scenario = anyRow.scenario ?? row.inputs?.scenario ?? "unknown";
      return {
        id: `m${idx}_${masterId}`,
        ue_id: masterId,
        cell_id: row.inputs?.physical_cellid ?? anyRow.inputs?.physical_cellid ?? 0,
        ta: row.inputs?.ta ?? 0,
        rsrp: anyRow.rsrp ?? row.inputs?.rsrp ?? -140,
        sinr: anyRow.sinr ?? row.inputs?.sinr ?? 0,
        velocity: anyRow.velocity ?? row.inputs?.velocity ?? 0,
        scenario,
        risk: Number((row.outputs?.dso4_probability ?? anyRow.dso4_probability ?? 0).toFixed(4)),
        dso1_risk: Number((row.outputs?.dso1_risk_score ?? anyRow.dso1_risk_score ?? 0).toFixed(4)),
        recommended: (row.outputs?.handover_recommended ?? anyRow.handover_recommended ?? false) === true,
        cluster: row.outputs?.dso3_cluster ?? anyRow.dso3_cluster ?? -1,
        cluster_label: row.outputs?.dso3_label ?? "Unknown",
        timestamp: anyRow.event_timestamp ?? anyRow["@timestamp"],
        ue_lat: uelat,
        ue_lng: uelng,
      };
    });
  }

  // ── Scientist: Real Metrics from metrics.json ──

  getScientistMetrics() {
    // Try to read real metrics.json
    const metricsFile = this.metricsPath;
    try {
      if (existsSync(metricsFile)) {
        const raw = JSON.parse(readFileSync(metricsFile, "utf-8"));
        return {
          latestExperiment: "5G-Handover-AI v9",
          dso1_roc_auc: raw.dso1?.roc_auc ?? 0,
          dso1_pr_auc: raw.dso1?.pr_auc ?? 0,
          dso1_mcc: raw.dso1?.mcc ?? 0,
          dso1_accuracy: raw.dso1?.accuracy ?? 0,
          dso3_n_clusters: raw.dso3?.n_clusters ?? 4,
          dso4_roc_auc: raw.dso4?.roc_auc ?? 0,
          dso4_pr_auc: raw.dso4?.pr_auc ?? 0,
          dso4_mcc: raw.dso4?.mcc ?? 0,
          dso4_kappa: raw.dso4?.kappa ?? 0,
          dso4_accuracy: raw.dso4?.accuracy ?? 0,
          dso4_ho_recall: raw.dso4?.ho_recall ?? 0,
          dso4_stay_recall: raw.dso4?.stay_recall ?? 0,
          dso4_threshold: raw.dso4?.threshold ?? 0.5,
        };
      }
    } catch (e) {}

    // Fallback
    return {
      latestExperiment: "5G-Handover-AI",
      dso1_roc_auc: 0.89,
      dso4_roc_auc: 0.98,
      dso4_mcc: 0.83,
      dso4_threshold: 0.82,
    };
  }

  // ── Proxied endpoints (ML Service) ──

  async getDriftStatus() {
    try {
      const { data } = await axios.get(`${this.mlServiceUrl}/drift/status`, { timeout: 5000 });
      return data;
    } catch (e: any) {
      return { status: "unavailable", error: e.message };
    }
  }

  async startRetraining() {
    try {
      const { data } = await axios.post(`${this.mlServiceUrl}/retrain`, {}, { timeout: 10000 });
      return data;
    } catch (e: any) {
      return { status: "error", error: e.message };
    }
  }

  async getRetrainingStatus() {
    try {
      const { data } = await axios.get(`${this.mlServiceUrl}/retrain/status`, { timeout: 5000 });
      return data;
    } catch (e: any) {
      return { status: "unavailable", error: e.message };
    }
  }

  async getDatasetInfo() {
    try {
      const { data } = await axios.get(`${this.mlServiceUrl}/dataset/info`, { timeout: 5000 });
      return data;
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async getUETypes() {
    try {
      const { data } = await axios.get(`${this.mlServiceUrl}/dataset/ue-types`, { timeout: 5000 });
      return data;
    } catch (e: any) {
      return { types: [] };
    }
  }

  // ── System Health (aggregated) ──

  async getSystemHealth() {
    const services = [
      { name: "API Gateway", url: "http://localhost:3000/health" },
      { name: "User Service", url: "http://localhost:3001/health" },
      { name: "Prediction Service", url: "http://localhost:3002/health" },
      { name: "Dashboard Service", url: "http://localhost:3003/health" },
      { name: "ML Engine", url: `${this.mlServiceUrl}/health` },
    ];

    const results = await Promise.all(
      services.map(async (svc) => {
        const start = Date.now();
        try {
          const { data } = await axios.get(svc.url, { timeout: 3000 });
          return {
            name: svc.name,
            status: "healthy",
            responseMs: Date.now() - start,
            details: data,
          };
        } catch (e: any) {
          return {
            name: svc.name,
            status: "unhealthy",
            responseMs: Date.now() - start,
            error: e.message,
          };
        }
      }),
    );

    const allHealthy = results.every((r) => r.status === "healthy");
    return {
      overall: allHealthy ? "healthy" : "degraded",
      services: results,
      timestamp: new Date().toISOString(),
    };
  }
}
