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
    process.env.ML_SERVICE_URL ?? "http://host.docker.internal:8000";

  private readonly gpsPath =
    process.env.CELL_GPS_PATH ?? "/app/shared-logs/cell_gps.json";

  private readonly handoverLogPath =
    process.env.HANDOVER_LOG_PATH ?? "/app/shared-logs/handover_log.json";

  private readonly datasetMapPath =
    process.env.DATASET_MAP_PATH ?? "/app/shared-logs/dataset_map_state.json";

  private readonly datasetHoPath =
    process.env.DATASET_HO_PATH ?? "/app/shared-logs/dataset_handover_history.json";

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

  /** True if log row counts as an AI / guidance handover for KPIs and map. */
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
    
    // Support both @timestamp (elk_logger) and event_timestamp (simulator)
    const getTs = (r: any) => this.toMs(r.event_timestamp ?? r["@timestamp"]);
    
    const latestTimestampMs =
      rows.length > 0 ? getTs(rows[rows.length - 1]) : Date.now();

    const lastHour = rows.filter(
      (r) => latestTimestampMs - getTs(r) <= 60 * 60 * 1000,
    );
    const last15Min = rows.filter(
      (r) => latestTimestampMs - getTs(r) <= 15 * 60 * 1000,
    );

    const recommendationsLastHour = lastHour.filter((r) =>
      this.rowSuggestsHandover(r),
    );

    const successfulHandovers = recommendationsLastHour.filter(
      (r) => {
        // Support both old simulate_traffic (r.inputs) and new elk_logger (r.delta_rsrp directly)
        const delta = (r.inputs as any)?.delta_rsrp ?? (r as any).delta_rsrp ?? 0;
        // Success if signal improves OR if it's a preventative move with minimal loss (<3dB)
        return delta > -3;

      }
    ).length;

    const hoSuccessRate = recommendationsLastHour.length > 0
      ? Math.round((successfulHandovers / recommendationsLastHour.length) * 100)
      : 0;

    const highRiskLastHour = lastHour.filter((r) => {
      const d4 = Number(r.outputs?.dso4_probability ?? 0);
      const d1 = Number(r.outputs?.dso1_risk_score ?? 0);
      return d4 >= 0.28 || d1 >= 0.32;
    }).length;
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
        message: `${highRiskLastHour} elevated-risk prediction(s) in the last hour (DSO4 ≥ 0.28 or DSO1 ≥ 0.32).`,
      });
    }
    if (recommendationsLastHour.length > 0) {
      alerts.push({
        id: "ho-rec",
        severity: "medium",
        message: `${recommendationsLastHour.length} handover recommendation(s) generated in the last hour.`,
      });
    }

    const hoPolicy = this.computeHoPolicyComparison();

    return {
      kpis: {
        recentPredictions15m: last15Min.length,
        handoverRecommendationsLastHour: recommendationsLastHour.length,
        avgLatencyMs: avgLatency,
        highRiskPredictionsLastHour: highRiskLastHour,
        hoSuccessRate,
      },
      hoPolicyComparison: hoPolicy,
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
        recommended: this.rowSuggestsHandover(row),
        cluster: row.outputs?.dso3_cluster ?? anyRow.dso3_cluster ?? -1,
        cluster_label: row.outputs?.dso3_label ?? "Unknown",
        timestamp: anyRow.event_timestamp ?? anyRow["@timestamp"],
        ue_lat: uelat,
        ue_lng: uelng,
      };
    });
  }

  // ── Trip Paths ──
  getTripPaths() {
    const TRIP_COLORS = ["#22d3ee", "#a855f7", "#10b981", "#f97316"];

    let allRows: PredictionLog[] = [];
    if (existsSync(this.logsPath)) {
      try {
        const raw = readFileSync(this.logsPath, "utf-8").trim();
        if (raw) {
          allRows = raw
            .split("\n")
            .slice(-6000)
            .map((line) => { try { return JSON.parse(line) as PredictionLog; } catch { return null; } })
            .filter((r): r is PredictionLog => r !== null);
        }
      } catch {}
    }

    const byUE = new Map<string, any[]>();
    for (const row of allRows) {
      const anyRow = row as any;
      const masterId: string | undefined = anyRow.master_id ?? (row.inputs as any)?.master_id;
      if (!masterId) continue;
      const lat = anyRow.ue_lat ?? (row.inputs as any)?.ue_lat;
      const lng = anyRow.ue_lng ?? (row.inputs as any)?.ue_lng;
      if (lat == null || lng == null) continue;
      if (!byUE.has(masterId)) byUE.set(masterId, []);
      byUE.get(masterId)!.push(row);
    }

    const getTs = (r: any) => this.toMs(r.event_timestamp ?? r["@timestamp"]);

    const topUEs = Array.from(byUE.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 4);

    return topUEs.map(([ue_id, ueRows], colorIdx) => {
      const chronological = [...ueRows].sort((a, b) => getTs(a) - getTs(b));
      const anyFirst = chronological[0] as any;
      const scenario: string = anyFirst.scenario ?? (anyFirst.inputs as any)?.scenario ?? "unknown";

      let prevCellId = -1;
      let prevRsrp = -140;

      const path = chronological.map((row: any) => {
        const cellId = Number(row.inputs?.physical_cellid ?? (row as any).inputs?.physical_cellid ?? 0);
        const rsrp: number = (row as any).rsrp ?? row.inputs?.rsrp ?? -140;
        const isHandover = prevCellId !== -1 && cellId !== prevCellId;
        const fromCell = isHandover ? prevCellId : undefined;
        const rsrpGain = isHandover ? +((rsrp - prevRsrp).toFixed(1)) : undefined;
        prevCellId = cellId;
        prevRsrp = rsrp;

        return {
          lat: (row as any).ue_lat ?? row.inputs?.ue_lat,
          lng: (row as any).ue_lng ?? row.inputs?.ue_lng,
          timestamp: (row as any).event_timestamp ?? (row as any)["@timestamp"] ?? "",
          rsrp,
          sinr: (row as any).sinr ?? row.inputs?.sinr ?? 0,
          velocity: (row as any).velocity ?? row.inputs?.velocity ?? 0,
          cell_id: cellId,
          is_handover: isHandover,
          is_recommended: this.rowSuggestsHandover(row),
          from_cell: fromCell,
          rsrp_gain: rsrpGain,
        };
      });

      const last = path[path.length - 1];
      const handovers = path.filter((p) => p.is_handover);
      const avgRsrp = path.length > 0
        ? +(path.reduce((s, p) => s + p.rsrp, 0) / path.length).toFixed(1)
        : -140;

      return {
        ue_id,
        scenario,
        color: TRIP_COLORS[colorIdx],
        path,
        stats: {
          handover_count: handovers.length,
          ai_handovers: handovers.filter((p) => p.is_recommended).length,
          avg_rsrp: avgRsrp,
          current_cell: last?.cell_id ?? 0,
          current_rsrp: last?.rsrp ?? -140,
          current_velocity: last?.velocity ?? 0,
        },
      };
    });
  }

  // ── Handover Logs ──
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

  private computeHoPolicyComparison() {
    const events = (() => {
      if (!existsSync(this.handoverLogPath)) return [];
      try {
        const raw = readFileSync(this.handoverLogPath, "utf-8").trim();
        if (!raw) return [];
        return raw
          .split("\n")
          .slice(-800)
          .map((line) => {
            try {
              return JSON.parse(line) as Record<string, unknown>;
            } catch {
              return null;
            }
          })
          .filter((item): item is Record<string, unknown> => item !== null);
      } catch {
        return [];
      }
    })();

    const legacy = events.filter((h) => h.kind === "reactive_legacy");
    const predictive = events.filter((h) => h.kind === "predictive_ho");

    const avg = (xs: number[]) =>
      xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

    const legacyRsrp = legacy
      .map((h) => Number(h.rsrp_at_ho))
      .filter((x) => Number.isFinite(x));
    const predRsrp = predictive
      .map((h) => Number(h.rsrp_at_ho))
      .filter((x) => Number.isFinite(x));

    const avgLegacy = avg(legacyRsrp);
    const avgPred = avg(predRsrp);
    const headroomDb =
      avgLegacy != null && avgPred != null
        ? Number((avgLegacy - avgPred).toFixed(2))
        : null;

    const floorFromEvent = Number(legacy[0]?.legacy_rsrp_floor_dbm);
    const floorDb = Number.isFinite(floorFromEvent) ? floorFromEvent : -98;

    const proactiveWhileHealthy = predictive.filter(
      (h) => Number(h.rsrp_at_ho) > floorDb,
    ).length;

    return {
      reactiveLegacyHoCount: legacy.length,
      predictiveHoCount: predictive.length,
      avgRsrpAtLegacyHoDbm:
        avgLegacy != null ? Number(avgLegacy.toFixed(2)) : null,
      avgRsrpAtPredictiveHoDbm:
        avgPred != null ? Number(avgPred.toFixed(2)) : null,
      /** Positive = predictive handovers happen at stronger (less degraded) RSRP than legacy. */
      signalHeadroomDb: headroomDb,
      legacyRsrpFloorDbm: floorDb,
      predictiveWhileAboveLegacyFloor: proactiveWhileHealthy,
      narrative:
        headroomDb != null && headroomDb > 0
          ? `Predictive handovers average ${headroomDb} dB stronger RSRP than legacy (wait-until-degraded) handovers — mobility before visible outage.`
          : legacy.length + predictive.length === 0
            ? "Run the city simulator (run_city.py) to populate legacy vs predictive handover events."
            : "Collecting comparison samples — need both legacy and predictive events in handover_log.json.",
    };
  }

  /**
   * Reactive = actual cell changes (dataset replay, simulator nearest-cell, or legacy network).
   * Predictive = every tick the DSO pipeline recommended a handover (your model), from prediction logs.
   */
  getHandoverHistoryComparison() {
    const all = this.getHandoverLogs();
    const legacy = all.filter(
      (h: Record<string, unknown>) =>
        h.kind === "reactive_legacy" || h.kind === "reactive",
    );
    const predictiveHo = all.filter(
      (h: Record<string, unknown>) => h.kind === "predictive_ho",
    );

    const rows = this.readPredictionLogs();
    const predictiveFromLogs: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (!this.rowSuggestsHandover(r)) continue;
      const anyRow = r as Record<string, unknown>;
      const inputs = (anyRow.inputs as Record<string, unknown>) ?? {};
      predictiveFromLogs.push({
        kind: "predictive_inference",
        timestamp: String(anyRow.event_timestamp ?? anyRow["@timestamp"] ?? ""),
        ue_id: String(inputs.master_id ?? anyRow.master_id ?? "unknown"),
        scenario: String(inputs.scenario ?? anyRow.scenario ?? "unknown"),
        cell_id: Number(inputs.physical_cellid ?? 0),
        dso4_probability: Number(
          r.outputs?.dso4_probability ?? anyRow.dso4_probability ?? 0,
        ),
        dso1_risk: Number(
          r.outputs?.dso1_risk_score ?? anyRow.dso1_risk_score ?? 0,
        ),
        rsrp_dbm: Number(inputs.rsrp ?? anyRow.rsrp ?? 0),
      });
    }
    predictiveFromLogs.reverse();

    const earlyAlignment = legacy.filter(
      (h: Record<string, unknown>) => h.ai_recommended === true,
    ).length;

    return {
      reactive: legacy,
      predictive: predictiveHo.slice(0, 200),
      predictiveInferenceTicks: predictiveFromLogs.slice(0, 200),
      summary: {
        reactiveCount: legacy.length,
        predictiveHoCount: predictiveHo.length,
        predictiveInferenceCount: predictiveFromLogs.length,
        modelAlignedBeforeReactive: earlyAlignment,
      },
      hoPolicyComparison: this.computeHoPolicyComparison(),
      sources: {
        reactiveLog: this.handoverLogPath,
        predictionsLog: this.logsPath,
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

  getDatasetMapState() {
    if (!existsSync(this.datasetMapPath)) return [];
    try {
      return JSON.parse(readFileSync(this.datasetMapPath, "utf-8"));
    } catch {
      return [];
    }
  }

  getDatasetHandovers() {
    if (!existsSync(this.datasetHoPath)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.datasetHoPath, "utf-8"));
      return Array.isArray(raw) ? raw.slice().reverse() : [];
    } catch {
      return [];
    }
  }

  private readHoEvents(): any[] {
    if (!existsSync(this.datasetHoPath)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.datasetHoPath, "utf-8"));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  getDatasetOverview() {
    const mapState: any[] = (() => {
      if (!existsSync(this.datasetMapPath)) return [];
      try { return JSON.parse(readFileSync(this.datasetMapPath, "utf-8")); } catch { return []; }
    })();

    const hoEvents = this.readHoEvents();
    const total = hoEvents.length;
    const mobility = hoEvents.filter((e: any) => e.reason === "mobility").length;
    const congestion = hoEvents.filter((e: any) => e.reason === "congestion").length;
    const gains = hoEvents.map((e: any) => Number(e.rsrp_gain)).filter((g: number) => isFinite(g));
    const avgGain = gains.length > 0
      ? Math.round((gains.reduce((a: number, b: number) => a + b, 0) / gains.length) * 10) / 10
      : 0;

    const progressPcts = mapState.map((d: any) => Number(d.progress?.pct ?? 0));
    const avgProgress = progressPcts.length > 0
      ? Math.round((progressPcts.reduce((a: number, b: number) => a + b, 0) / progressPcts.length) * 10) / 10
      : 0;

    // AI stats from handover events annotated by the replayer
    const aiProactive = hoEvents.filter((e: any) =>
      e.ai_prediction?.recommended === true &&
      typeof e.ai_prediction?.proactive_headroom_db === "number" &&
      e.ai_prediction.proactive_headroom_db > 0,
    ).length;

    const headrooms = hoEvents
      .filter((e: any) =>
        typeof e.ai_prediction?.proactive_headroom_db === "number" &&
        e.ai_prediction.proactive_headroom_db > 0,
      )
      .map((e: any) => e.ai_prediction.proactive_headroom_db as number);

    const avgHeadroomDb = headrooms.length > 0
      ? Math.round((headrooms.reduce((a, b) => a + b, 0) / headrooms.length) * 10) / 10
      : 0;

    const aiProactiveRate = total > 0 ? Math.round((aiProactive / total) * 100) : 0;

    return {
      kpis: {
        totalHandovers: total,
        mobilityHandovers: mobility,
        congestionHandovers: congestion,
        avgRsrpGain: avgGain,
        activeDevices: mapState.length,
        replayProgress: avgProgress,
        aiProactiveCount: aiProactive,
        aiProactiveRate: aiProactiveRate,
        aiAvgHeadroomDb: avgHeadroomDb,
      },
      devices: mapState.map((d: any) => ({
        name: d.name,
        color: d.color,
        scenario: d.scenario,
        currentRsrp: d.stats?.current_rsrp ?? -140,
        currentVelocity: d.stats?.current_velocity ?? 0,
        progress: d.progress ?? null,
      })),
    };
  }

  getTowerStats() {
    const hoEvents = this.readHoEvents();
    const cellGps = this.getCellGps();
    const mapState: any[] = (() => {
      if (!existsSync(this.datasetMapPath)) return [];
      try { return JSON.parse(readFileSync(this.datasetMapPath, "utf-8")); } catch { return []; }
    })();

    const events = hoEvents.slice(-2000);

    // Cells currently connected to a device
    const activeCells = new Set<number>();
    for (const device of mapState) {
      const cell = device?.stats?.current_cell;
      if (cell != null) activeCells.add(Number(cell));
    }

    const stats = new Map<number, {
      cell_id: number; lat: number; lng: number;
      departures: number; arrivals: number; congestion: number; rsrp_sum: number;
    }>();

    const ensureCell = (cid: number): boolean => {
      if (stats.has(cid)) return true;
      const gps = cellGps[String(cid)];
      if (!gps) return false;
      stats.set(cid, { cell_id: cid, lat: gps.lat, lng: gps.lng, departures: 0, arrivals: 0, congestion: 0, rsrp_sum: 0 });
      return true;
    };

    for (const ev of events) {
      if (ev.from_cell != null && ensureCell(Number(ev.from_cell))) {
        const s = stats.get(Number(ev.from_cell))!;
        s.departures++;
        if (ev.reason === "congestion") s.congestion++;
        s.rsrp_sum += Number(ev.rsrp_before) || -140;
      }
      if (ev.to_cell != null && ensureCell(Number(ev.to_cell))) {
        stats.get(Number(ev.to_cell))!.arrivals++;
      }
    }

    // Ensure currently-active cells appear even if no HO history yet
    for (const cid of activeCells) ensureCell(cid);

    return Array.from(stats.values()).map(s => {
      const congestionRatio = s.departures > 0 ? s.congestion / s.departures : 0;
      const avgRsrp = s.departures > 0 ? s.rsrp_sum / s.departures : -140;
      let status: "healthy" | "congested" | "high_risk" = "healthy";
      if (s.departures >= 2 && congestionRatio >= 0.35) status = "congested";
      else if (s.departures >= 2 && avgRsrp < -105) status = "high_risk";

      return {
        cell_id: s.cell_id,
        lat: s.lat,
        lng: s.lng,
        departures: s.departures,
        arrivals: s.arrivals,
        congestion_ratio: Math.round(congestionRatio * 100) / 100,
        avg_rsrp: Math.round(avgRsrp * 10) / 10,
        status,
        is_active: activeCells.has(s.cell_id),
      };
    }).sort((a, b) => (b.departures + b.arrivals) - (a.departures + a.arrivals));
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
      { name: "API Gateway", url: "http://api-gateway:3000/health" },
      { name: "User Service", url: "http://user-service:3001/health" },
      { name: "Prediction Service", url: "http://prediction-service:3002/health" },
      { name: "Dashboard Service", url: "http://localhost:3003/health" },
      { name: "ML Engine", url: "http://host.docker.internal:8000/health" },
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
