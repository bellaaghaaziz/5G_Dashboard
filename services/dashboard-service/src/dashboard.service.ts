import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";

type PredictionLog = {
  event_timestamp?: string;
  inputs?: {
    latitude?: number;
    longitude?: number;
    velocity?: number;
  };
  outputs?: {
    dso4_probability?: number;
    handover_recommended?: boolean;
    latency_ms?: number;
  };
  latency_ms?: number;
  handover_recommended?: boolean;
};

@Injectable()
export class DashboardService {
  private readonly logsPath = process.env.PREDICTIONS_LOG_PATH ?? "/app/shared-logs/predictions.json";

  private readPredictionLogs(): PredictionLog[] {
    if (!existsSync(this.logsPath)) return [];
    const raw = readFileSync(this.logsPath, "utf-8").trim();
    if (!raw) return [];

    return raw
      .split("\n")
      .slice(-300)
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

  getOperatorOverview() {
    const rows = this.readPredictionLogs();
    const now = Date.now();
    const lastHour = rows.filter((r) => now - this.toMs(r.event_timestamp) <= 60 * 60 * 1000);
    const last15Min = rows.filter((r) => now - this.toMs(r.event_timestamp) <= 15 * 60 * 1000);

    const recommendationsLastHour = lastHour.filter(
      (r) => (r.outputs?.handover_recommended ?? r.handover_recommended) === true,
    ).length;

    const highRiskLastHour = lastHour.filter((r) => (r.outputs?.dso4_probability ?? 0) >= 0.7).length;
    const latencyRows = lastHour.map((r) => r.outputs?.latency_ms ?? r.latency_ms ?? 0).filter((x) => x > 0);
    const avgLatency =
      latencyRows.length > 0 ? Number((latencyRows.reduce((a, b) => a + b, 0) / latencyRows.length).toFixed(2)) : 0;

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
      },
    };
  }

  getMapEvents() {
    const rows = this.readPredictionLogs();
    const fallbackCenter = { lat: 51.495, lng: 7.44 };

    return rows.slice(-50).map((row, idx) => {
      const lat = row.inputs?.latitude ?? 0;
      const lng = row.inputs?.longitude ?? 0;
      const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001;

      return {
        id: `m${idx}`,
        lat: hasGps ? lat : fallbackCenter.lat + (idx % 10) * 0.002 - 0.008,
        lng: hasGps ? lng : fallbackCenter.lng + (idx % 8) * 0.002 - 0.006,
        risk: Number((row.outputs?.dso4_probability ?? 0).toFixed(4)),
        recommended: (row.outputs?.handover_recommended ?? row.handover_recommended ?? false) === true,
        timestamp: row.event_timestamp,
        hasGps,
      };
    });
  }

  getScientistMetrics() {
    return {
      latestExperiment: "5G-Handover-AI",
      dso1_roc_auc: 0.88,
      dso4_roc_auc: 0.85,
      dso4_mcc: 0.42,
      dso4_threshold: 0.82,
    };
  }
}
