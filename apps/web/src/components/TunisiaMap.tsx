import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { api } from "../api/client";

type TowerStat = {
  cell_id: number; lat: number; lng: number;
  departures: number; arrivals: number; congestion_ratio: number;
  avg_rsrp: number; status: "healthy" | "congested" | "high_risk";
  is_active: boolean;
};

delete (L.Icon.Default.prototype as any)._getIconUrl;

const RUHR_CENTER: [number, number] = [51.513, 7.465];

// ── Types ─────────────────────────────────────────────────────────────────────

type PathPoint = {
  lat: number; lng: number; timestamp: string;
  rsrp: number; velocity: number; cell_id: number;
  is_handover: boolean; is_recommended: boolean;
  from_cell?: number; rsrp_gain?: number;
};

type Trip = {
  ue_id: string; name?: string; scenario: string; color: string;
  path: PathPoint[];
  stats: { handover_count: number; ai_handovers: number; avg_rsrp: number; current_cell: number; current_rsrp: number; current_velocity: number; };
  progress?: { cursor: number; total: number; pct: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCENARIO_ICON: Record<string, string> = { hbahn: "🚋", mobile: "📱", static: "🏢", pedestrian: "🚶", car: "🚗" };

function sigColor(rsrp: number) { return rsrp >= -85 ? "#22c55e" : rsrp >= -100 ? "#f59e0b" : "#ef4444"; }
function sigLabel(rsrp: number) { return rsrp >= -85 ? "Strong" : rsrp >= -100 ? "Fair" : "Weak"; }
function fmtTime(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Inject CSS once ───────────────────────────────────────────────────────────

const BEACON_CSS = `
.b-wrap { position:relative; width:72px; height:72px; }
.b-ring {
  position:absolute; width:44px; height:44px; border-radius:50%; border:1.5px solid;
  top:50%; left:50%;
  transform:translate(-50%,-50%) scale(0.1);
  animation:b-ring 2.6s ease-out infinite;
  pointer-events:none;
}
.b-ring2 { animation-delay:1.3s; }
.b-ring3 { animation-delay:0.65s; opacity:0.5; }
.b-dot {
  position:absolute; width:13px; height:13px; border-radius:50%;
  top:50%; left:50%; transform:translate(-50%,-50%);
  animation:b-dot 2.4s ease-in-out infinite;
}
.b-dot-sel {
  position:absolute; width:16px; height:16px; border-radius:50%;
  top:50%; left:50%; transform:translate(-50%,-50%);
  border:2.5px solid rgba(255,255,255,0.9);
  animation:b-dot 1.8s ease-in-out infinite;
}
@keyframes b-ring {
  0%   { transform:translate(-50%,-50%) scale(0.1);  opacity:0.9; }
  100% { transform:translate(-50%,-50%) scale(3.2);  opacity:0; }
}
@keyframes b-dot {
  0%,100% { filter:brightness(1)   drop-shadow(0 0 6px currentColor); transform:translate(-50%,-50%) scale(1); }
  50%      { filter:brightness(1.5) drop-shadow(0 0 14px currentColor); transform:translate(-50%,-50%) scale(1.2); }
}
.ho-flash {
  position:absolute; width:40px; height:40px; border-radius:50%; border:2px solid;
  top:50%; left:50%;
  animation:ho-flash 0.9s ease-out forwards;
  pointer-events:none;
}
@keyframes ho-flash {
  0%   { transform:translate(-50%,-50%) scale(0.2); opacity:1; }
  100% { transform:translate(-50%,-50%) scale(3.5); opacity:0; }
}
.leaflet-tooltip { background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important; }
.leaflet-tooltip::before { display:none!important; }
.leaflet-container { font-family:Inter,sans-serif; }
`;

if (typeof document !== "undefined" && !document.getElementById("cp-beacon-css")) {
  const el = document.createElement("style");
  el.id = "cp-beacon-css";
  el.textContent = BEACON_CSS;
  document.head.appendChild(el);
}

// ── Beacon icon factory ───────────────────────────────────────────────────────

function makeBeacon(color: string, selected: boolean): L.DivIcon {
  const dotClass = selected ? "b-dot-sel" : "b-dot";
  const glow = selected ? 22 : 11;
  const extra = selected ? `,0 0 3px white` : "";
  return L.divIcon({
    className: "",
    iconSize: [72, 72] as [number, number],
    iconAnchor: [36, 36] as [number, number],
    html: `<div class="b-wrap">
      <div class="b-ring"  style="border-color:${color}45"></div>
      <div class="b-ring b-ring2" style="border-color:${color}65"></div>
      <div class="b-ring b-ring3" style="border-color:${color}30"></div>
      <div class="${dotClass}" style="background:${color};color:${color};box-shadow:0 0 ${glow}px ${color}${extra}"></div>
    </div>`,
  });
}

// ── Handover flash ────────────────────────────────────────────────────────────

function triggerHandoverFlash(map: L.Map, pos: [number, number], color: string) {
  const icon = L.divIcon({
    className: "",
    iconSize: [80, 80],
    iconAnchor: [40, 40],
    html: `<div class="b-wrap" style="width:80px;height:80px;"><div class="ho-flash" style="border-color:${color};width:50px;height:50px;"></div></div>`,
  });
  const m = L.marker(pos, { icon, zIndexOffset: -100, interactive: false }).addTo(map);
  setTimeout(() => m.remove(), 950);
}

// ── Animated layer — steps through intermediate towers, no big jumps ─────────
//
// Tracks progress by ISO timestamp, not cell_id.  Tracking by cell_id breaks
// when a device bounces back to a tower it just left (#476→#80→#476): the
// search finds #476 at the END of the path and returns an empty slice, so the
// device never moves.  Timestamps are monotonically increasing so the filter
// `ts > prevTimestamp` always returns exactly the new points.

const ANIM_STEP_MS = 220;  // ms between tower hops

type DevState = {
  marker: L.Marker;
  prevTimestamp: string | null;  // ISO ts of last consumed path point
  prevCell: number | null;       // cell_id at prevTimestamp (for dedup)
  selected: boolean;
  color: string;
  queue: Array<[number, number]>;
  timer: ReturnType<typeof setInterval> | null;
};

function AnimatedLayer({ trips, selectedUE, onSelect }: {
  trips: Trip[];
  selectedUE: string | null;
  onSelect: (id: string | null) => void;
}) {
  const map = useMap();
  const devs = useRef<Map<string, DevState>>(new Map());
  const cbRef = useRef(onSelect);
  useEffect(() => { cbRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const live = new Set(trips.map(t => t.ue_id));

    for (const [id, s] of devs.current) {
      if (!live.has(id)) {
        if (s.timer) clearInterval(s.timer);
        s.marker.remove();
        devs.current.delete(id);
      }
    }

    for (const trip of trips) {
      const last = trip.path[trip.path.length - 1];
      if (!last) continue;
      const sel = selectedUE === trip.ue_id;

      if (!devs.current.has(trip.ue_id)) {
        const pos: [number, number] = [last.lat, last.lng];
        const marker = L.marker(pos, { icon: makeBeacon(trip.color, sel), zIndexOffset: sel ? 1000 : 0 });
        marker.addTo(map);
        const ueId = trip.ue_id;
        marker.on("click", () => cbRef.current(ueId));
        // Anchor to current position — no steps needed yet
        devs.current.set(ueId, {
          marker,
          prevTimestamp: last.timestamp,
          prevCell: last.cell_id,
          selected: sel, color: trip.color,
          queue: [], timer: null,
        });
        continue;
      }

      const s = devs.current.get(trip.ue_id)!;
      s.color = trip.color;

      // Points newer than what we've already consumed (ISO string comparison is
      // chronologically correct for UTC timestamps from the replayer)
      const newPoints = s.prevTimestamp === null
        ? trip.path
        : trip.path.filter(p => p.timestamp > s.prevTimestamp!);

      if (newPoints.length > 0) {
        // Collect unique cell positions, deduplicating consecutive same-cell rows
        const steps: Array<[number, number]> = [];
        let lastCell = s.prevCell;
        for (const p of newPoints) {
          if (p.cell_id !== lastCell) {
            steps.push([p.lat, p.lng]);
            lastCell = p.cell_id;
          }
        }

        s.prevTimestamp = last.timestamp;
        s.prevCell = last.cell_id;

        if (steps.length > 0) {
          s.queue.push(...steps);
          if (s.queue.length > 25) s.queue.splice(0, s.queue.length - 25);

          if (!s.timer) {
            const ref = s;
            ref.timer = setInterval(() => {
              const next = ref.queue.shift();
              if (!next) {
                clearInterval(ref.timer!);
                ref.timer = null;
                return;
              }
              ref.marker.setLatLng(next);
              if (ref.queue.length === 0) triggerHandoverFlash(map, next, ref.color);
            }, ANIM_STEP_MS);
          }
        }
      }

      if (s.selected !== sel) {
        s.selected = sel;
        s.marker.setIcon(makeBeacon(trip.color, sel));
        s.marker.setZIndexOffset(sel ? 1000 : 0);
      }
    }
  }, [trips, selectedUE, map]);

  useEffect(() => () => {
    for (const s of devs.current.values()) {
      if (s.timer) clearInterval(s.timer);
      s.marker.remove();
    }
    devs.current.clear();
  }, []);

  return null;
}

// ── Tower layer ───────────────────────────────────────────────────────────────

function TowerLayer({ towers }: { towers: TowerStat[] }) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    for (const t of towers) {
      const color =
        t.status === "high_risk" ? "#ef4444" :
        t.status === "congested" ? "#f59e0b" :
        t.is_active              ? "#22c55e" : "#475569";

      const dotRadius =
        t.status !== "healthy" ? 5 :
        t.is_active            ? 5 : 3;

      const dotOpacity =
        t.status !== "healthy" ? 0.9 :
        t.is_active            ? 0.7 : 0.3;

      const fillOpacity =
        t.status !== "healthy" ? 0.07 :
        t.is_active            ? 0.04 : 0.015;

      const borderOpacity =
        t.status !== "healthy" ? 0.45 :
        t.is_active            ? 0.3  : 0.1;

      // Coverage circle — all towers, opacity scales with severity
      const area = L.circle([t.lat, t.lng] as [number, number], {
        radius: 450,
        color,
        weight: 1,
        opacity: borderOpacity,
        fillColor: color,
        fillOpacity,
        interactive: false,
      }).addTo(map);
      layersRef.current.push(area);

      // Tower dot
      const dot = L.circleMarker([t.lat, t.lng] as [number, number], {
        radius: dotRadius,
        color,
        weight: 1.5,
        opacity: dotOpacity,
        fillColor: color,
        fillOpacity: dotOpacity,
      }).addTo(map);

      const statusLabel =
        t.status === "high_risk" ? "⚠ Weak signal" :
        t.status === "congested" ? "⚡ Congested"  :
        t.is_active              ? "✓ Active — device connected" : "· Healthy";
      const statusColor =
        t.status === "high_risk" ? "#ef4444" :
        t.status === "congested" ? "#f59e0b" :
        t.is_active              ? "#22c55e" : "#64748b";

      dot.bindTooltip(`
        <div style="background:rgba(5,12,25,0.97);padding:7px 11px;border-radius:9px;border:1px solid ${color}40;min-width:160px">
          <div style="font-size:11px;font-weight:800;color:#f1f5f9;margin-bottom:4px">Tower #${t.cell_id}</div>
          <div style="font-size:10px;font-weight:700;color:${statusColor};margin-bottom:5px">${statusLabel}</div>
          <div style="font-size:10px;color:#64748b">${t.departures} departure${t.departures !== 1 ? "s" : ""} · ${t.arrivals} arrival${t.arrivals !== 1 ? "s" : ""}</div>
          <div style="font-size:10px;color:#64748b">${(t.congestion_ratio * 100).toFixed(0)}% congestion rate</div>
          <div style="font-size:10px;color:#64748b">Avg RSRP: ${t.avg_rsrp.toFixed(1)} dBm</div>
        </div>`, { sticky: true }
      );

      layersRef.current.push(dot);
    }

    return () => {
      layersRef.current.forEach(l => l.remove());
      layersRef.current = [];
    };
  }, [towers, map]);

  return null;
}

// ── Map centering helper ──────────────────────────────────────────────────────

function FitRegion() {
  const map = useMap();
  useEffect(() => { map.setView(RUHR_CENTER, 12); }, [map]);
  return null;
}

// ── Sidebar: trip card ────────────────────────────────────────────────────────

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const last = trip.path[trip.path.length - 1];
  const icon = SCENARIO_ICON[trip.scenario] ?? "📡";
  const name = trip.name ?? trip.scenario;
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: "rgba(8,18,36,0.95)", borderRadius: 14, border: `1px solid ${hover ? trip.color + "50" : "rgba(255,255,255,0.06)"}`, padding: "13px 14px", cursor: "pointer", transition: "border-color 0.18s" }}
    >
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${trip.color}13`, border: `1.5px solid ${trip.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {trip.progress && (
            <div style={{ marginTop: 5 }}>
              <div style={{ height: 2.5, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${trip.progress.pct}%`, background: trip.color, borderRadius: 2, transition: "width 1.5s" }} />
              </div>
              <div style={{ fontSize: 9, color: "#2d3f5e", marginTop: 2 }}>{trip.progress.pct.toFixed(1)}% of dataset replayed</div>
            </div>
          )}
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: trip.color, boxShadow: `0 0 8px ${trip.color}`, flexShrink: 0 }} />
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "rgba(255,255,255,0.025)", borderRadius: 9, overflow: "hidden", marginBottom: 9 }}>
        {[
          { label: "Signal", value: sigLabel(last?.rsrp ?? -140), color: sigColor(last?.rsrp ?? -140) },
          { label: "Speed", value: `${Math.round(last?.velocity ?? 0)} km/h`, color: "#e2e8f0" },
          { label: "Tower", value: `#${last?.cell_id ?? "—"}`, color: "#94a3b8" },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "7px 5px", textAlign: "center", borderRight: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ fontSize: 9, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Handover count */}
      {trip.stats.handover_count > 0 ? (
        <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#3d5475" }}>Tower switches in window</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: trip.color }}>{trip.stats.handover_count}</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#1e2d45", textAlign: "center" }}>Monitoring…</div>
      )}
    </div>
  );
}

// ── Sidebar: detail view ─────────────────────────────────────────────────────

function Timeline({ trip, handovers, onBack }: { trip: Trip; handovers: PathPoint[]; onBack: () => void }) {
  const icon = SCENARIO_ICON[trip.scenario] ?? "📡";
  const name = trip.name ?? trip.scenario;
  const last = trip.path[trip.path.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(8,18,36,0.97)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#94a3b8", width: 27, height: 27, borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: trip.color, boxShadow: `0 0 7px ${trip.color}`, flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{icon} {name}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {[
          { label: "Switches", value: trip.stats.handover_count, color: "#f1f5f9" },
          { label: "Signal", value: sigLabel(last?.rsrp ?? -140), color: sigColor(last?.rsrp ?? -140) },
          { label: "Speed", value: `${Math.round(last?.velocity ?? 0)} km/h`, color: "#e2e8f0" },
        ].map(s => (
          <div key={s.label} style={{ padding: "9px 0", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#2d3f5e", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Recent Switches</div>
        {handovers.length === 0 ? (
          <div style={{ textAlign: "center", color: "#1e2d45", fontSize: 12, padding: "24px 0" }}>No switches in current window</div>
        ) : handovers.map((ho, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: trip.color, border: "2px solid rgba(8,18,36,1)" }} />
              {i < handovers.length - 1 && <div style={{ width: 1.5, minHeight: 22, background: "rgba(255,255,255,0.04)", marginTop: 3 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 11 }}>
              <div style={{ fontSize: 9, color: "#1e2d45", marginBottom: 3 }}>{fmtTime(ho.timestamp)}</div>
              <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "7px 10px", border: `1px solid ${trip.color}15` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0", marginBottom: ho.rsrp_gain !== undefined ? 3 : 0 }}>
                  Tower #{ho.from_cell} → #{ho.cell_id}
                </div>
                {ho.rsrp_gain !== undefined && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: ho.rsrp_gain > 0 ? "#22c55e" : "#ef4444" }}>
                    {ho.rsrp_gain > 0 ? "+" : ""}{ho.rsrp_gain} dB
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function TunisiaMap() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [towers, setTowers] = useState<TowerStat[]>([]);
  const [selectedUE, setSelectedUE] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const towerPollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchTrips = useCallback(async () => {
    try {
      const { data } = await api.get("/operator/dataset-map");
      if (Array.isArray(data)) { setTrips(data); setLastUpdated(new Date()); }
    } catch {}
  }, []);

  const fetchTowers = useCallback(async () => {
    try {
      const { data } = await api.get("/operator/tower-stats");
      if (Array.isArray(data)) setTowers(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTrips();
    pollRef.current = setInterval(fetchTrips, 1000);
    return () => clearInterval(pollRef.current);
  }, [fetchTrips]);

  useEffect(() => {
    fetchTowers();
    towerPollRef.current = setInterval(fetchTowers, 8000);
    return () => clearInterval(towerPollRef.current);
  }, [fetchTowers]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedUE(prev => (prev === id ? null : id));
  }, []);

  const selectedTrip = trips.find(t => t.ue_id === selectedUE) ?? null;
  const handoverHistory = selectedTrip
    ? selectedTrip.path.filter(p => p.is_handover).slice().reverse()
    : [];

  return (
    <div style={{ display: "flex", height: "100%", gap: 12 }}>

      {/* MAP */}
      <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", position: "relative" }}>

        {/* Top-left: live badge */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, display: "flex", alignItems: "center", gap: 7, background: "rgba(5,12,25,0.88)", backdropFilter: "blur(10px)", borderRadius: 8, padding: "5px 11px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>LIVE</span>
          <span style={{ fontSize: 11, color: "#475569" }}>
            {trips.length} device{trips.length !== 1 ? "s" : ""} · {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>

        {/* Bottom-left: legend */}
        <div style={{ position: "absolute", bottom: 28, left: 12, zIndex: 1000, background: "rgba(5,12,25,0.88)", backdropFilter: "blur(10px)", borderRadius: 10, padding: "10px 13px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Legend</div>
          {[
            { dot: <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }} />, text: "Live device (click to inspect)" },
            { dot: <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} />, text: "Tower — device connected" },
            { dot: <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#475569" }} />, text: "Tower — healthy" },
            { dot: <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b" }} />, text: "Tower — congested" },
            { dot: <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444" }} />, text: "Tower — weak signal" },
          ].map(({ dot, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#64748b", marginBottom: 5 }}>
              {dot}<span>{text}</span>
            </div>
          ))}
          {towers.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 10, color: "#2d3f5e" }}>
              {towers.filter(t => t.is_active).length} active · {towers.filter(t => t.status !== "healthy").length} problem{towers.filter(t => t.status !== "healthy").length !== 1 ? "s" : ""} of {towers.length}
            </div>
          )}
        </div>

        <MapContainer
          center={RUHR_CENTER}
          zoom={12}
          style={{ width: "100%", height: "100%", background: "#050d1a" }}
          zoomControl
          attributionControl={false}
        >
          <FitRegion />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <TowerLayer towers={towers} />
          <AnimatedLayer trips={trips} selectedUE={selectedUE} onSelect={handleSelect} />
        </MapContainer>
      </div>

      {/* SIDEBAR */}
      <div style={{ width: 288, display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: selectedUE ? "hidden" : "auto" }}>
        {selectedUE && selectedTrip ? (
          <Timeline trip={selectedTrip} handovers={handoverHistory} onBack={() => setSelectedUE(null)} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1.2 }}>Active Devices</div>
              <div style={{ fontSize: 10, color: "#1a2840" }}>{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            </div>
            {trips.length === 0 ? (
              <div style={{ textAlign: "center", color: "#1e2d45", fontSize: 13, padding: "48px 0" }}>Waiting for live data…</div>
            ) : (
              trips.map(trip => <TripCard key={trip.ue_id} trip={trip} onClick={() => handleSelect(trip.ue_id)} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
