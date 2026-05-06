import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
  private readonly logsPath: string;
  private readonly playbackPath: string;
  private readonly metricsPath: string;
  private readonly mlServiceUrl: string;
  private readonly gpsPath: string;
  private readonly handoverLogPath: string;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.logsPath = this.config.get<string>("PREDICTIONS_LOG_PATH", "logs/predictions.json");
    this.playbackPath = this.config.get<string>("PLAYBACK_STATE_PATH", "logs/playback_state.json");
    this.metricsPath = this.config.get<string>("METRICS_PATH", "logs/metrics.json");
    this.mlServiceUrl = this.config.get<string>("ML_SERVICE_URL", "http://localhost:8000");
    this.gpsPath = this.config.get<string>("CELL_GPS_PATH", "logs/cell_gps.json");
    this.handoverLogPath = this.config.get<string>("HANDOVER_LOG_PATH", "logs/handover_log.json");
  }

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
      .split(/\r?\n/)
      .slice(-1500)
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

  private rowSuggestsHandover(r: PredictionLog): boolean {
    const o = r.outputs as Record<string, unknown> | undefined;
    return (
      o?.handover_recommended === true ||
      o?.guidance_handover === true ||
      r.handover_recommended === true
    );
  }

  getHealth() {
    return { status: "ok", service: "dashboard-service", logsPath: this.logsPath };
  }

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

  getOperatorOverview() {
    const rows = this.readPredictionLogs();
    const getTs = (r: any) => this.toMs(r.event_timestamp ?? r["@timestamp"]);
    const latestTimestampMs = rows.length > 0 ? getTs(rows[rows.length - 1]) : Date.now();

    const lastHour = rows.filter((r) => latestTimestampMs - getTs(r) <= 60 * 60 * 1000);
    const last15Min = rows.filter((r) => latestTimestampMs - getTs(r) <= 15 * 60 * 1000);

    const recommendationsLastHour = lastHour.filter((r) => this.rowSuggestsHandover(r));

    const successfulHandovers = recommendationsLastHour.filter((r) => {
      const delta = (r.inputs as any)?.delta_rsrp ?? (r as any).delta_rsrp ?? 0;
      return delta > -3;
    }).length;

    const hoSuccessRate = recommendationsLastHour.length > 0
      ? Math.round((successfulHandovers / recommendationsLastHour.length) * 100)
      : 0;

    const highRiskLastHour = lastHour.filter((r) => {
      const d4 = Number(r.outputs?.dso4_probability ?? 0);
      const d1 = Number(r.outputs?.dso1_risk_score ?? 0);
      return d4 >= 0.28 || d1 >= 0.32;
    }).length;

    const latencyRows = lastHour.map((r) => r.outputs?.latency_ms ?? r.latency_ms ?? 0).filter((x) => x > 0);
    const avgLatency = latencyRows.length > 0 ? Number((latencyRows.reduce((a, b) => a + b, 0) / latencyRows.length).toFixed(2)) : 0;

    const alerts: Array<{ id: string; severity: "high" | "medium"; message: string }> = [];
    if (highRiskLastHour > 0) {
      alerts.push({ id: "risk-spike", severity: "high", message: `${highRiskLastHour} elevated-risk prediction(s) in the last hour (DSO4 ≥ 0.28 or DSO1 ≥ 0.32).` });
    }
    if (recommendationsLastHour.length > 0) {
      alerts.push({ id: "ho-rec", severity: "medium", message: `${recommendationsLastHour.length} handover recommendation(s) generated in the last hour.` });
    }

    return {
      kpis: {
        recentPredictions15m: last15Min.length,
        handoverRecommendationsLastHour: recommendationsLastHour.length,
        avgLatencyMs: avgLatency,
        highRiskPredictionsLastHour: highRiskLastHour,
        hoSuccessRate,
      },
      alerts,
      source: { type: "prediction_logs", path: this.logsPath, simulatedTime: latestTimestampMs },
    };
  }

  getMapEvents() {
    const rows = this.readPredictionLogs();
    return rows.slice(-300).map((row, idx) => {
      const anyRow = row as any;
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
        recommended: this.rowSuggestsHandover(row),
        cluster: row.outputs?.dso3_cluster ?? anyRow.dso3_cluster ?? -1,
        cluster_label: row.outputs?.dso3_label ?? "Unknown",
        timestamp: anyRow.event_timestamp ?? anyRow["@timestamp"],
        ue_lat: uelat,
        ue_lng: uelng,
      };
    });
  }

  getHandoverLogs() {
    if (!existsSync(this.handoverLogPath)) return [];
    try {
      const raw = readFileSync(this.handoverLogPath, "utf-8").trim();
      if (!raw) return [];
      return raw.split("\n").slice(-400).map(line => JSON.parse(line)).reverse();
    } catch {
      return [];
    }
  }

  getHandoverHistoryComparison() {
    const all = this.getHandoverLogs();
    const legacy = all.filter((h: any) => h.kind === "reactive_legacy" || h.kind === "reactive");
    const predictiveHo = all.filter((h: any) => h.kind === "predictive_ho");

    const rows = this.readPredictionLogs();
    const predictiveFromLogs: any[] = [];
    for (const r of rows) {
      if (!this.rowSuggestsHandover(r)) continue;
      const anyRow = r as any;
      const inputs = anyRow.inputs ?? {};
      predictiveFromLogs.push({
        kind: "predictive_inference",
        timestamp: String(anyRow.event_timestamp ?? anyRow["@timestamp"] ?? ""),
        ue_id: String(inputs.master_id ?? anyRow.master_id ?? "unknown"),
        scenario: String(inputs.scenario ?? anyRow.scenario ?? "unknown"),
        cell_id: Number(inputs.physical_cellid ?? 0),
        dso4_probability: Number(r.outputs?.dso4_probability ?? anyRow.dso4_probability ?? 0),
        dso1_risk: Number(r.outputs?.dso1_risk_score ?? anyRow.dso1_risk_score ?? 0),
        rsrp_dbm: Number(inputs.rsrp ?? anyRow.rsrp ?? 0),
      });
    }
    predictiveFromLogs.reverse();

    return {
      reactive: legacy,
      predictive: predictiveHo.slice(0, 200),
      predictiveInferenceTicks: predictiveFromLogs.slice(0, 200),
      summary: {
        reactiveCount: legacy.length,
        predictiveHoCount: predictiveHo.length,
        predictiveInferenceCount: predictiveFromLogs.length,
      },
    };
  }

  getAllTowers() {
    const rawGps = this.getCellGps();
    return Object.entries(rawGps).map(([cell_id, data]) => ({
      cell_id: Number(cell_id),
      lat: data.lat,
      lng: data.lng,
      scenario: data.scenario
    }));
  }

  getScientistMetrics() {
    if (existsSync(this.metricsPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.metricsPath, "utf-8"));
        return {
          latestExperiment: "5G-Handover-AI v9",
          dso1_roc_auc: raw.dso1?.roc_auc ?? 0,
          dso4_roc_auc: raw.dso4?.roc_auc ?? 0,
          dso4_threshold: raw.dso4?.threshold ?? 0.5,
        };
      } catch (e) {}
    }
    return {
      latestExperiment: "5G-Handover-AI",
      dso1_roc_auc: 0.89,
      dso4_roc_auc: 0.98,
      dso4_mcc: 0.83,
      dso4_threshold: 0.82,
    };
  }

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

  async getDatasetHandovers() {
    try {
      const { data } = await axios.get(`${this.mlServiceUrl}/dataset/handovers`, { timeout: 5000 });
      return data;
    } catch (e: any) {
      return {};
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

  async getSystemHealth() {
    const services = [
      { name: "API Gateway", url: "http://localhost:3000/health" },
      { name: "User Service", url: "http://localhost:3001/health" },
      { name: "Prediction Service", url: "http://localhost:3002/health" },
      { name: "Dashboard Service", url: "http://localhost:3003/health" },
      { name: "ML Engine", url: "http://localhost:8000/health" },
    ];

    const results = await Promise.all(
      services.map(async (svc) => {
        const start = Date.now();
        try {
          const { data } = await axios.get(svc.url, { timeout: 3000 });
          return { name: svc.name, status: "healthy", responseMs: Date.now() - start, details: data };
        } catch (e: any) {
          return { name: svc.name, status: "unhealthy", responseMs: Date.now() - start, error: e.message };
        }
      }),
    );

    return {
      overall: results.every((r) => r.status === "healthy") ? "healthy" : "degraded",
      services: results,
      timestamp: new Date().toISOString(),
    };
  }
}
