import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

// ── Types matching dashboard-service KafkaService output ─────────────────────

export interface PathPoint {
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
  ai_predicted?: boolean;
}

export interface AiState {
  risk: number;
  recommended: boolean;
  probability: number;
  dso2Target: number;
  dso3Cluster: number;
  dso3Label: string;
}

export interface Trip {
  ue_id: string;
  scenario: string;
  color: string;
  name: string;
  path: PathPoint[];
  latestAi?: AiState | null;
  stats: {
    handover_count: number;
    reconnection_count: number;
    ai_handovers: number;
    avg_rsrp: number;
    current_cell: number;
    current_rsrp: number;
    current_velocity: number;
  };
  progress: {
    cursor: number;
    total: number;
    pct: number;
  };
}

export interface TowerStat {
  cell_id: number;
  lat: number;
  lng: number;
  departures: number;
  arrivals: number;
  avg_rsrp: number;
  avg_rsrq: number;
  avg_sinr: number;
  avg_cqi:  number;
  n_rrc_connections:  number;
  prb_utilization:    number;
  dl_throughput_mbps: number;
  is_active: boolean;
  status: "healthy" | "congested" | "high_risk";
  device_color: string | null;
}

export interface AIPrediction {
  recommended: boolean;
  ai_rsrp: number;
  actual_ho_rsrp: number;
  proactive_headroom_db: number | null;
  dso4_probability: number;
  dso1_risk_score: number;
  dso3_cluster: number;
  dso3_label: string;
}

export interface HandoverEvent {
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
  event_type: "handover" | "reconnection";
  velocity: number;
  gap_s: number;
  lat: number;
  lng: number;
  reason: "mobility" | "congestion" | "reconnection";
  ai_prediction: AIPrediction | null;
}

export interface DatasetOverview {
  kpis: {
    totalHandovers: number;
    mobilityHandovers: number;
    congestionHandovers: number;
    avgRsrpGain: number;
    activeDevices: number;
    replayProgress: number;
    aiProactiveCount: number;
    aiProactiveRate: number;
    aiAvgHeadroomDb: number;
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const defaultWsUrl =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `http://${window.location.hostname}:3003`
    : "http://localhost:3003";

const WS_URL: string = (import.meta.env.VITE_WS_URL as string | undefined) ?? defaultWsUrl;

export function useMapWebSocket() {
  const socketRef   = useRef<Socket | null>(null);
  const [connected,    setConnected]    = useState(false);
  const [mapState,     setMapState]     = useState<Trip[]>([]);
  const [towers,       setTowers]       = useState<TowerStat[]>([]);
  const [overview,     setOverview]     = useState<DatasetOverview | null>(null);
  const [lastHandover, setLastHandover] = useState<HandoverEvent | null>(null);
  const [hoHistory,    setHoHistory]    = useState<HandoverEvent[]>([]);

  useEffect(() => {
    const socket = io(`${WS_URL}/ws`, {
      path:                 "/socket.io",
      transports:           ["polling", "websocket"],
      reconnectionDelay:    1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("mapState",   (data: Trip[])          => setMapState(data));
    socket.on("towerStats", (data: TowerStat[])     => setTowers(data));
    socket.on("overview",   (data: DatasetOverview) => setOverview(data));
    socket.on("handoverEvent", (data: HandoverEvent) => {
      setLastHandover(data);
      setHoHistory(prev => {
        const next = [data, ...prev];
        return next.length > 500 ? next.slice(0, 500) : next;
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  return { connected, mapState, towers, overview, lastHandover, hoHistory };
}
