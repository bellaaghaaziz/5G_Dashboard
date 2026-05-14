import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import * as fs from "fs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PathPoint {
  lat: number;
  lng: number;
  timestamp: string;
  rsrp: number;
  sinr: number;
  velocity: number;
  cell_id: number;
  is_handover: boolean;
  is_reconnection: boolean;
  from_cell: number | null;
  gap_s: number;
  rsrp_gain: number | null;
  ai_predicted: boolean;   // true when AI had recommended HO before this switch occurred
}

interface AiState {
  risk: number;
  recommended: boolean;
  probability: number;
  dso2Target: number;
  dso3Cluster: number;
  dso3Label: string;
}

interface DeviceState {
  ue_id: string;
  scenario: string;
  color: string;
  name: string;
  path: PathPoint[];
  stats: {
    handover_count: number;
    reconnection_count: number;
    ai_handovers: number;
    avg_rsrp: number;
    current_cell: number;
    current_rsrp: number;
    current_velocity: number;
  };
  progress: { cursor: number; total: number; pct: number };
  latestAi: AiState | null;   // most recent inference result for this device
}

interface AiBufferEntry {
  cellId: number;
  rsrp: number;
  tsNum: number;
  recommended: boolean;
  probability: number;
  dso1Risk: number;
  dso2TargetRsrp: number;
  dso2NumCandidates: number;
  dso3Cluster: number;
  dso3Label: string;
  decisionSource: string;
}

// Matches the HOEvent / AIPrediction shape expected by HandoverHistoryPage
interface AIPrediction {
  recommended: boolean;
  ai_rsrp: number;
  actual_ho_rsrp: number;
  proactive_headroom_db: number | null;
  dso4_probability: number;
  dso1_risk_score: number;
  dso3_cluster: number;
  dso3_label: string;
}

interface HandoverEvent {
  timestamp: string;
  ue_id: string;
  name: string;
  color: string;
  scenario: string;
  from_cell: number;
  to_cell: number;
  rsrp_before: number;
  rsrp_after: number;
  rsrp_gain: number;
  velocity: number;
  gap_s: number;
  lat: number;
  lng: number;
  reason: "mobility" | "congestion" | "reconnection";
  event_type: "handover" | "reconnection";
  ai_prediction: AIPrediction | null;
}

interface TowerStat {
  cell_id: number;
  lat: number;
  lng: number;
  departures: number;
  arrivals: number;
  avg_rsrp: number;
  avg_rsrq: number;
  avg_sinr: number;
  avg_cqi: number;
  n_rrc_connections: number;
  prb_utilization: number;
  dl_throughput_mbps: number;
  is_active: boolean;
  status: "healthy" | "congested" | "high_risk";
  device_color: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAIL_MAX   = 60;
const HO_GAP_MAX  = 10.0;
const HISTORY_MAX = 2000;
const EMA_ALPHA   = 0.15;
const AI_BUF_MAX  = 20;

const SCENARIOS: Record<string, string> = {
  "armv7l_RM500Q-GL": "hbahn",
  "armv7l_none":      "hbahn",
  "r0s_SM-S901B":     "mobile",
  "o1s_SM-G991B":     "static",
};
const COLORS: Record<string, string> = {
  "armv7l_RM500Q-GL": "#22d3ee",
  "armv7l_none":      "#f59e0b",
  "r0s_SM-S901B":     "#a855f7",
  "o1s_SM-G991B":     "#10b981",
};
const NAMES: Record<string, string> = {
  "armv7l_RM500Q-GL": "Quectel 5G Modem — H-Bahn",
  "armv7l_none":      "ARM Device — H-Bahn",
  "r0s_SM-S901B":     "Samsung S22 — Mobile",
  "o1s_SM-G991B":     "Samsung S21 — Static",
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;

  private devices  = new Map<string, DeviceState>();
  private towers   = new Map<number, TowerStat & {
    rsrp_sum: number; rsrp_count: number;
    rsrq_sum: number; rsrq_count: number;
    sinr_sum: number; sinr_count: number;
    cqi_sum:  number; cqi_count:  number;
    window_departures: number; window_arrivals: number;
  }>();
  private hoHistory: HandoverEvent[] = [];

  private towerDevices  = new Map<number, Set<string>>();
  private prevCell      = new Map<string, number>();
  private prevTs        = new Map<string, number>();
  private prevRsrp      = new Map<string, number>();
  private rowCount      = new Map<string, number>();
  private cellGps: Record<string, { lat: number; lng: number }> = {};
  private towerLastSeen = new Map<number, number>();

  // ── AI state ─────────────────────────────────────────────────────────────────
  private aiBuffer         = new Map<string, AiBufferEntry[]>();
  private aiProactiveCount = 0;
  private aiHeadroomSum    = 0.0;
  private inferenceUrl!: string;
  private aiEnabled        = false;

  // ── Drift feed state (batch Kafka features → /drift/feed every N messages) ──
  private driftFeedBuf: Record<string, number>[] = [];
  private readonly DRIFT_FEED_BATCH = 20;

  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private towerInterval!: ReturnType<typeof setInterval>;
  private overviewInterval!: ReturnType<typeof setInterval>;

  onBroadcast?: (event: string, payload: unknown) => void;

  private static prbUtil(nUes: number, avgCqi: number): number {
    const se = Math.max(0.15, avgCqi * 0.37);
    return Math.min(1.0, (nUes * (27.8 / se)) / 100);
  }

  private static shannonMbps(avgSinrDb: number, nUes: number): number {
    const cap = 20 * Math.log2(1 + Math.pow(10, avgSinrDb / 10)) * 0.75;
    return nUes > 0 ? Math.round(cap / nUes * 10) / 10 : cap;
  }

  async onModuleInit(): Promise<void> {
    this._loadCellGps();

    this.inferenceUrl = process.env.INFERENCE_URL ?? "http://localhost:8000";
    this.aiEnabled    = process.env.AI_ENABLED !== "false";
    if (this.aiEnabled) {
      console.log(`KafkaService: AI inference → ${this.inferenceUrl}/predict`);
      this._pingInference().catch(() => {});
    }

    const broker  = process.env.KAFKA_BROKER   ?? "localhost:29092";
    const topic   = process.env.KAFKA_TOPIC    ?? "5g-telemetry";
    const groupId = process.env.KAFKA_GROUP_ID ?? "dashboard-group";

    const saslEnabled = process.env.KAFKA_SASL_ENABLED === "true";
    const kafka = new Kafka({
      clientId: "dashboard-service",
      brokers: [broker],
      retry: { retries: 10, initialRetryTime: 3000 },
      ...(saslEnabled ? {
        ssl: true,
        sasl: { mechanism: "plain" as const, username: "$ConnectionString", password: process.env.KAFKA_CONNECTION_STRING ?? "" },
      } : {}),
    });

    this.consumer = kafka.consumer({ groupId, sessionTimeout: 30000 });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: false });
    await this.consumer.run({ eachMessage: async (p) => this._handleMessage(p) });

    this.towerInterval = setInterval(() => {
      const now = Date.now();
      for (const [cellId, tower] of this.towers) {
        if (tower.is_active && now - (this.towerLastSeen.get(cellId) ?? 0) > 30_000) {
          tower.is_active = false; tower.device_color = null;
          tower.n_rrc_connections = 0; tower.prb_utilization = 0;
          this.towerDevices.get(cellId)?.clear();
        }
        const nUes = this.towerDevices.get(cellId)?.size ?? 0;
        tower.n_rrc_connections  = nUes;
        tower.prb_utilization    = KafkaService.prbUtil(nUes, tower.avg_cqi);
        tower.dl_throughput_mbps = KafkaService.shannonMbps(tower.avg_sinr, nUes);
        const coverageFailing = tower.avg_rsrp < -110 && tower.avg_cqi < 4;
        tower.status = coverageFailing              ? "high_risk"
                     : tower.prb_utilization > 0.75 ? "congested"
                     : "healthy";
        tower.window_departures = 0; tower.window_arrivals = 0;
      }
      this.onBroadcast?.("towerStats", this.getTowerStats());
    }, 5000);

    this.overviewInterval = setInterval(() => {
      this.onBroadcast?.("overview", this.getOverview());
    }, 8000);

    console.log(`KafkaService connected: ${broker} / ${topic} / ${groupId}`);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.towerInterval);
    clearInterval(this.overviewInterval);
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    await this.consumer?.disconnect();
  }

  // ── Message handler ──────────────────────────────────────────────────────────

  private async _handleMessage({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(message.value.toString()); } catch { return; }

    const uid      = String(msg["master_id"] ?? "unknown");
    const cellId   = Number(msg["physical_cellid"] ?? 0);
    const tsNum    = Number(msg["ts_num"]    ?? Date.now() / 1000);
    const rsrp     = Number(msg["rsrp"]      ?? -95);
    const rsrq     = Number(msg["rsrq"]      ?? -10);
    const sinr     = Number(msg["sinr"]      ?? 0);
    const cqi      = Number(msg["cqi"]       ?? 8);
    const velocity = Number(msg["velocity"]  ?? 0);
    const lat      = Number(msg["_lat"]      ?? 0);
    const lng      = Number(msg["_lng"]      ?? 0);
    const gapS     = Number(msg["gap_s"]     ?? 0);

    const prev      = this.prevCell.get(uid);
    const prevTsVal = this.prevTs.get(uid);
    const prevRsrpV = this.prevRsrp.get(uid) ?? rsrp;
    const rowIdx    = (this.rowCount.get(uid) ?? 0) + 1;
    this.rowCount.set(uid, rowIdx);

    const cellChanged    = prev !== undefined && prev !== cellId;
    const actualGap      = prevTsVal !== undefined ? tsNum - prevTsVal : gapS;
    const isHandover     = cellChanged && actualGap <= HO_GAP_MAX;
    const isReconnection = cellChanged && actualGap > HO_GAP_MAX;
    const rsrpGain       = cellChanged ? rsrp - prevRsrpV : null;

    // Check AI buffer BEFORE updating prevCell so we can look at old cell's entries
    let aiPredicted = false;
    let aiPrediction: AIPrediction | null = null;

    if (isHandover && prev !== undefined) {
      const aiBuf      = this.aiBuffer.get(uid) ?? [];
      const onPrevCell = aiBuf.filter(e => e.cellId === prev);
      const firstRec   = onPrevCell.find(e => e.recommended);

      if (firstRec) {
        aiPredicted = true;
        const headroom = Math.round((firstRec.rsrp - prevRsrpV) * 10) / 10;
        aiPrediction = {
          recommended:           true,
          ai_rsrp:               firstRec.rsrp,
          actual_ho_rsrp:        prevRsrpV,
          proactive_headroom_db: headroom,
          dso4_probability:      firstRec.probability,
          dso1_risk_score:       firstRec.dso1Risk,
          dso3_cluster:          firstRec.dso3Cluster,
          dso3_label:            firstRec.dso3Label,
        };
      } else {
        const latestRec = onPrevCell[onPrevCell.length - 1];
        if (latestRec) {
          aiPrediction = {
            recommended:           false,
            ai_rsrp:               latestRec.rsrp,
            actual_ho_rsrp:        prevRsrpV,
            proactive_headroom_db: null,
            dso4_probability:      latestRec.probability,
            dso1_risk_score:       latestRec.dso1Risk,
            dso3_cluster:          latestRec.dso3Cluster,
            dso3_label:            latestRec.dso3Label,
          };
        }
      }
    }

    this.prevCell.set(uid, cellId);
    this.prevTs.set(uid, tsNum);
    this.prevRsrp.set(uid, rsrp);

    // ── Device state ─────────────────────────────────────────────────────────
    if (!this.devices.has(uid)) {
      this.devices.set(uid, {
        ue_id: uid,
        scenario:  SCENARIOS[uid] ?? "mobile",
        color:     COLORS[uid]    ?? "#94a3b8",
        name:      NAMES[uid]     ?? uid,
        path: [],
        stats: {
          handover_count: 0, reconnection_count: 0, ai_handovers: 0,
          avg_rsrp: rsrp, current_cell: cellId,
          current_rsrp: rsrp, current_velocity: velocity,
        },
        progress:  { cursor: 0, total: 0, pct: 0 },
        latestAi:  null,
      });
    }

    const dev = this.devices.get(uid)!;
    const point: PathPoint = {
      lat, lng,
      timestamp:       new Date(tsNum * 1000).toISOString(),
      rsrp, sinr, velocity,
      cell_id:         cellId,
      is_handover:     isHandover,
      is_reconnection: isReconnection,
      from_cell:       cellChanged ? (prev ?? null) : null,
      gap_s:           gapS,
      rsrp_gain:       rsrpGain,
      ai_predicted:    aiPredicted,
    };

    dev.path.push(point);
    if (dev.path.length > TRAIL_MAX) dev.path.shift();

    // ── AI inference — async, non-blocking ───────────────────────────────────
    if (this.aiEnabled) {
      this._fireAi(uid, cellId, tsNum, rsrp, msg, dev.path).catch(() => {});
    }

    // ── Handover / reconnection events ───────────────────────────────────────
    const scenario = dev.scenario;
    const reason: "mobility" | "congestion" | "reconnection" =
      isReconnection             ? "reconnection"
      : scenario === "hbahn"     ? "mobility"
      : scenario === "static"    ? "congestion"
      : velocity < 2.0           ? "congestion"
      : "mobility";

    if (isHandover) {
      dev.stats.handover_count++;
      if (aiPredicted) {
        dev.stats.ai_handovers++;
        this.aiProactiveCount++;
        const headroom = aiPrediction?.proactive_headroom_db ?? 0;
        if (headroom > 0) this.aiHeadroomSum += headroom;
      }
      this.aiBuffer.set(uid, []); // reset buffer — device is on a new cell

      const ev: HandoverEvent = {
        timestamp:   point.timestamp,
        ue_id:       uid,
        name:        dev.name,
        color:       dev.color,
        scenario,
        from_cell:   prev!,
        to_cell:     cellId,
        rsrp_before: prevRsrpV,
        rsrp_after:  rsrp,
        rsrp_gain:   rsrpGain ?? 0,
        velocity:    Math.round(velocity * 3.6 * 10) / 10, // m/s → km/h
        gap_s:       gapS,
        lat,
        lng,
        reason,
        event_type:  "handover",
        ai_prediction: aiPrediction,
      };
      this.hoHistory.push(ev);
      if (this.hoHistory.length > HISTORY_MAX) this.hoHistory.shift();
      this.onBroadcast?.("handoverEvent", ev);
      this.onBroadcast?.("towerStats", this.getTowerStats());

    } else if (isReconnection) {
      dev.stats.reconnection_count++;
      this.aiBuffer.set(uid, []);
      const ev: HandoverEvent = {
        timestamp:   point.timestamp,
        ue_id:       uid,
        name:        dev.name,
        color:       dev.color,
        scenario,
        from_cell:   prev!,
        to_cell:     cellId,
        rsrp_before: prevRsrpV,
        rsrp_after:  rsrp,
        rsrp_gain:   rsrpGain ?? 0,
        velocity:    Math.round(velocity * 3.6 * 10) / 10,
        gap_s:       gapS,
        lat,
        lng,
        reason:      "reconnection",
        event_type:  "reconnection",
        ai_prediction: null,
      };
      this.hoHistory.push(ev);
      if (this.hoHistory.length > HISTORY_MAX) this.hoHistory.shift();
      this.onBroadcast?.("handoverEvent", ev);
      this.onBroadcast?.("towerStats", this.getTowerStats());
    }

    const trail = dev.path;
    dev.stats.avg_rsrp         = Math.round(trail.reduce((s, p) => s + p.rsrp, 0) / trail.length * 10) / 10;
    dev.stats.current_cell     = cellId;
    dev.stats.current_rsrp     = rsrp;
    dev.stats.current_velocity = velocity;
    dev.progress.cursor        = rowIdx;

    // ── Tower stats ──────────────────────────────────────────────────────────
    const gps = this.cellGps[String(cellId)];
    if (gps) {
      if (!this.towers.has(cellId)) {
        this.towers.set(cellId, {
          cell_id: cellId, lat: gps.lat, lng: gps.lng,
          departures: 0, arrivals: 0,
          avg_rsrp: rsrp, avg_rsrq: rsrq, avg_sinr: sinr, avg_cqi: cqi,
          n_rrc_connections: 1, prb_utilization: 0, dl_throughput_mbps: 0,
          is_active: true, status: "healthy", device_color: COLORS[uid] ?? null,
          rsrp_sum: rsrp, rsrp_count: 1, rsrq_sum: rsrq, rsrq_count: 1,
          sinr_sum: sinr, sinr_count: 1, cqi_sum: cqi,  cqi_count: 1,
          window_departures: 0, window_arrivals: 0,
        });
      }
      const tower = this.towers.get(cellId)!;
      const isFirst = (++tower.rsrp_count) === 2;
      tower.rsrq_count++; tower.sinr_count++; tower.cqi_count++;
      tower.avg_rsrp = isFirst ? rsrp : Math.round((EMA_ALPHA * rsrp + (1 - EMA_ALPHA) * tower.avg_rsrp) * 10) / 10;
      tower.avg_rsrq = isFirst ? rsrq : Math.round((EMA_ALPHA * rsrq + (1 - EMA_ALPHA) * tower.avg_rsrq) * 10) / 10;
      tower.avg_sinr = isFirst ? sinr : Math.round((EMA_ALPHA * sinr + (1 - EMA_ALPHA) * tower.avg_sinr) * 10) / 10;
      tower.avg_cqi  = isFirst ? cqi  : Math.round((EMA_ALPHA * cqi  + (1 - EMA_ALPHA) * tower.avg_cqi)  * 10) / 10;
      tower.is_active    = true;
      tower.device_color = COLORS[uid] ?? null;
      this.towerLastSeen.set(cellId, Date.now());

      if (!this.towerDevices.has(cellId)) this.towerDevices.set(cellId, new Set());
      this.towerDevices.get(cellId)!.add(uid);

      if (isHandover) { tower.arrivals++; tower.window_arrivals++; }
      if (cellChanged && prev !== undefined && this.towers.has(prev)) {
        const pt = this.towers.get(prev)!;
        pt.departures++; pt.window_departures++;
        this.towerDevices.get(prev)?.delete(uid);
        const prevN = this.towerDevices.get(prev)?.size ?? 0;
        pt.n_rrc_connections  = prevN;
        pt.prb_utilization    = KafkaService.prbUtil(prevN, pt.avg_cqi);
        pt.dl_throughput_mbps = KafkaService.shannonMbps(pt.avg_sinr, prevN);
        pt.device_color = null;
        pt.is_active    = prevN > 0;
      }
      const nUes = this.towerDevices.get(cellId)!.size;
      tower.n_rrc_connections  = nUes;
      tower.prb_utilization    = KafkaService.prbUtil(nUes, tower.avg_cqi);
      tower.dl_throughput_mbps = KafkaService.shannonMbps(tower.avg_sinr, nUes);
    }

    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => {
      this.onBroadcast?.("mapState", this.getMapState());
      this.broadcastTimer = null;
    }, 100);

    // ── Drift feed: batch raw Kafka features → FastAPI /drift/feed ───────────
    const driftRecord: Record<string, number> = {};
    const driftFeatures = [
      "rsrp", "rsrq", "sinr", "cqi", "ta", "velocity",
      "num_neighbors", "ho_count_60s", "time_since_last_ho",
      "cell_hist_congestion_rate",
    ];
    for (const f of driftFeatures) {
      const v = msg[f];
      if (v != null && !isNaN(Number(v))) driftRecord[f] = Number(v);
    }
    // datarate from cell throughput estimate
    if (msg["cell_hist_datarate_mean"] != null) {
      driftRecord["datarate"] = Number(msg["cell_hist_datarate_mean"]);
    }
    if (Object.keys(driftRecord).length > 0) {
      this.driftFeedBuf.push(driftRecord);
      if (this.driftFeedBuf.length >= this.DRIFT_FEED_BATCH) {
        this._flushDriftBuf();
      }
    }
  }

  private _flushDriftBuf(): void {
    if (this.driftFeedBuf.length === 0) return;
    const records = this.driftFeedBuf.splice(0);
    fetch(`${this.inferenceUrl}/drift/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    }).catch(() => {});  // fire-and-forget, never block the message loop
  }

  // ── AI inference ──────────────────────────────────────────────────────────────

  private async _fireAi(
    uid: string, cellId: number, tsNum: number, rsrp: number,
    msg: Record<string, unknown>, path: PathPoint[],
  ): Promise<void> {
    const recentRsrp = path.map(p => p.rsrp);
    const rsrpLag1   = recentRsrp.length > 1 ? recentRsrp[recentRsrp.length - 2] : rsrp;
    const rsrpDelta3 = msg["rsrp_delta_3"] != null
      ? Number(msg["rsrp_delta_3"])
      : recentRsrp.length >= 4 ? rsrp - recentRsrp[recentRsrp.length - 4] : 0;
    const rolling5 = recentRsrp.slice(-5);
    const rsrpVsRolling = rolling5.length > 0
      ? rsrp - rolling5.reduce((a, b) => a + b, 0) / rolling5.length : 0;
    const rolling10 = recentRsrp.slice(-10);
    const rsrpMean  = rolling10.length ? rolling10.reduce((a, b) => a + b, 0) / rolling10.length : rsrp;
    const rsrpStd   = rolling10.length > 1
      ? Math.sqrt(rolling10.reduce((s, v) => s + (v - rsrpMean) ** 2, 0) / rolling10.length) : 1;

    const dt        = new Date(tsNum * 1000);
    const hoTimes   = path.filter(p => p.is_handover).map(p => new Date(p.timestamp).getTime() / 1000);
    let cellAge     = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].cell_id !== cellId) break;
      cellAge += 4;
    }

    const input: Record<string, unknown> = {
      rsrp,
      rsrq:                 Number(msg["rsrq"]      ?? -10),
      sinr:                 Number(msg["sinr"]       ?? 0),
      cqi:                  Number(msg["cqi"]        ?? 8),
      tx_power:             Number(msg["tx_power"]   ?? 23),
      ta:                   Number(msg["ta"]         ?? 0),
      velocity:             Number(msg["velocity"]   ?? 0),
      rsrp_delta_3:         Math.round(rsrpDelta3 * 100) / 100,
      rsrp_lag_1:           Math.round(rsrpLag1 * 100) / 100,
      rsrp_vs_rolling:      Math.round(rsrpVsRolling * 100) / 100,
      rsrp_rolling_std_10:  Math.round(rsrpStd * 100) / 100,
      hour_of_day:          dt.getUTCHours(),
      day_of_week:          dt.getUTCDay(),
      ho_count_60s:         hoTimes.filter(t => tsNum - t <= 60).length,
      time_since_last_ho:   hoTimes.length ? Math.round((tsNum - hoTimes[hoTimes.length - 1]) * 10) / 10 : 100,
      serving_cell_age:     cellAge,
      num_neighbors:        msg["num_neighbors"]          != null ? Number(msg["num_neighbors"])          : 0,
      best_neighbor_rsrp:   msg["best_neighbor_rsrp"]     != null ? Number(msg["best_neighbor_rsrp"])     : -140,
      mean_neighbor_rsrp:   msg["mean_neighbor_rsrp"]     != null ? Number(msg["mean_neighbor_rsrp"])     : -140,
      neighbor_gap:         msg["neighbor_gap"]           != null ? Number(msg["neighbor_gap"])           : 0,
      neighbor_diversity:   msg["neighbor_diversity"]     != null ? Number(msg["neighbor_diversity"])     : 0,
      cell_load_drop_flag:       Number(msg["cell_load_drop_flag"]       ?? 0),
      cell_hist_congestion_rate: Number(msg["cell_hist_congestion_rate"] ?? 0),
      physical_cellid: cellId,
      master_id:       uid,
      scenario:        SCENARIOS[uid] ?? "mobile",
    };

    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.inferenceUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return;

      const result = await res.json() as {
        handover_recommended: boolean;
        dso4_probability:     number;
        dso1_risk_score:      number;
        dso2_target_rsrp:     number;
        dso2_num_candidates:  number;
        dso3_cluster:         number;
        dso3_label:           string;
        decision_source:      string;
      };

      // Store in AI buffer for this device
      if (!this.aiBuffer.has(uid)) this.aiBuffer.set(uid, []);
      const buf = this.aiBuffer.get(uid)!;
      buf.push({
        cellId, rsrp, tsNum,
        recommended:       result.handover_recommended,
        probability:       result.dso4_probability,
        dso1Risk:          result.dso1_risk_score,
        dso2TargetRsrp:    result.dso2_target_rsrp,
        dso2NumCandidates: result.dso2_num_candidates,
        dso3Cluster:       result.dso3_cluster ?? 0,
        dso3Label:         result.dso3_label   ?? "",
        decisionSource:    result.decision_source,
      });
      if (buf.length > AI_BUF_MAX) buf.shift();

      // Update device's live AI state (used by map to color beacons)
      const dev = this.devices.get(uid);
      if (dev) {
        dev.latestAi = {
          risk:        result.dso1_risk_score,
          recommended: result.handover_recommended,
          probability: result.dso4_probability,
          dso2Target:  result.dso2_target_rsrp,
          dso3Cluster: result.dso3_cluster ?? 0,
          dso3Label:   result.dso3_label   ?? "",
        };
      }
    } catch {
      // Inference API unavailable — replay continues without AI
    }
  }

  private async _pingInference(): Promise<void> {
    try {
      const res = await fetch(`${this.inferenceUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) console.log(`KafkaService: inference API healthy at ${this.inferenceUrl}`);
    } catch {
      console.warn(`KafkaService: inference API not reachable at ${this.inferenceUrl}`);
    }
  }

  // ── Public getters ───────────────────────────────────────────────────────────

  getMapState(): DeviceState[] {
    return [...this.devices.values()];
  }

  getTowerStats(): TowerStat[] {
    return [...this.towers.values()].map(
      ({ rsrp_sum, rsrp_count, rsrq_sum, rsrq_count,
         sinr_sum, sinr_count, cqi_sum, cqi_count,
         window_departures, window_arrivals, ...rest }) => rest,
    );
  }

  getOverview() {
    const devices  = this.getMapState();
    const ho       = this.hoHistory;
    const total    = ho.length;
    const mobility = ho.filter(e => e.event_type === "handover").length;
    const avgGain  = total > 0
      ? Math.round(ho.reduce((s, e) => s + e.rsrp_gain, 0) / total * 10) / 10 : 0;
    const replayPct = devices.length
      ? Math.round(devices.map(d => d.progress.pct).reduce((a, b) => a + b, 0) / devices.length * 10) / 10 : 0;
    const aiRate    = mobility > 0
      ? Math.round(this.aiProactiveCount / mobility * 1000) / 10 : 0;
    const aiHeadroom = this.aiProactiveCount > 0
      ? Math.round(this.aiHeadroomSum / this.aiProactiveCount * 10) / 10 : 0;

    return {
      kpis: {
        totalHandovers:      total,
        mobilityHandovers:   mobility,
        congestionHandovers: total - mobility,
        avgRsrpGain:         avgGain,
        activeDevices:       devices.length,
        replayProgress:      replayPct,
        aiProactiveCount:    this.aiProactiveCount,
        aiProactiveRate:     aiRate,
        aiAvgHeadroomDb:     aiHeadroom,
      },
    };
  }

  getHandoverHistory(): HandoverEvent[] {
    return [...this.hoHistory].reverse();
  }

  // ── Cell GPS ─────────────────────────────────────────────────────────────────

  private _loadCellGps(): void {
    const path = process.env.CELL_GPS_PATH ?? "logs/cell_gps.json";
    try {
      this.cellGps = JSON.parse(fs.readFileSync(path, "utf-8"));
      console.log(`KafkaService: loaded ${Object.keys(this.cellGps).length} cells`);
      for (const [cellIdStr, gps] of Object.entries(this.cellGps)) {
        const cellId = Number(cellIdStr);
        if (!isNaN(cellId)) {
          this.towers.set(cellId, {
            cell_id: cellId, lat: gps.lat, lng: gps.lng,
            departures: 0, arrivals: 0,
            avg_rsrp: -90, avg_rsrq: -10, avg_sinr: 10, avg_cqi: 8,
            n_rrc_connections: 0, prb_utilization: 0, dl_throughput_mbps: 0,
            is_active: false, status: "healthy", device_color: null,
            rsrp_sum: 0, rsrp_count: 0, rsrq_sum: 0, rsrq_count: 0,
            sinr_sum: 0, sinr_count: 0, cqi_sum: 0, cqi_count: 0,
            window_departures: 0, window_arrivals: 0,
          });
        }
      }
      console.log(`KafkaService: pre-populated ${this.towers.size} towers`);
    } catch (e) {
      console.warn(`KafkaService: could not load cell GPS:`, e);
    }
  }
}
