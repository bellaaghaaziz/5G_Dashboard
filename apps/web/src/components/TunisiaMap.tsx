import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  Popup,
  useMap,
} from "react-leaflet";
import { api } from "../api/client";

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Ruhr region bounding box (where dataset was collected)
const RUHR_CENTER: [number, number] = [51.513, 7.465];

// Named areas in the dataset region
const AREAS = [
  { name: "Bochum", lat: 51.482, lng: 7.216 },
  { name: "Herne", lat: 51.537, lng: 7.225 },
  { name: "Dortmund", lat: 51.514, lng: 7.466 },
  { name: "Witten", lat: 51.433, lng: 7.353 },
  { name: "Castrop-Rauxel", lat: 51.553, lng: 7.317 },
];

function riskColor(r: number): string {
  if (r >= 0.7) return "#ef4444";
  if (r >= 0.4) return "#f59e0b";
  return "#22c55e";
}
function riskLabel(r: number): string {
  if (r >= 0.7) return "High Risk";
  if (r >= 0.4) return "Medium";
  return "Healthy";
}
function scenarioEmoji(s: string): string {
  if (s === "hbahn") return "🚋";
  if (s === "mobile") return "📱";
  if (s === "static") return "🏢";
  return "📡";
}

// Fallback: deterministic position within Ruhr if no GPS found
function fallbackLatLng(cellId: number): [number, number] {
  const lat = 51.45 + (((cellId * 1234567) >>> 0) % 1000) / 1000 * 0.12;
  const lng = 7.20 + (((cellId * 7654321) >>> 0) % 1000) / 1000 * 0.35;
  return [lat, lng];
}

type MapEvent = {
  id: string;
  ue_id: string;
  cell_id: number;
  rsrp: number;
  sinr: number;
  velocity: number;
  scenario: string;
  risk: number;
  dso1_risk: number;
  recommended: boolean;
  cluster_label: string;
  timestamp?: string;
  ue_lat?: number | null;
  ue_lng?: number | null;
};

type GpsLookup = Record<string, { lat: number; lng: number; scenario: string }>;

type CellData = {
  cellId: number;
  latLng: [number, number];
  events: MapEvent[];
  avgRisk: number;
  hoCount: number;
  hasRealGps: boolean;
};

function FitRuhr() {
  const map = useMap();
  useEffect(() => {
    map.setView(RUHR_CENTER, 12);
  }, [map]);
  return null;
}

export function TunisiaMap() {
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [gpsLookup, setGpsLookup] = useState<GpsLookup>({});
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [filter, setFilter] = useState<"all" | "risk" | "ho">("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [realGpsCount, setRealGpsCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Load GPS lookup once
  useEffect(() => {
    api.get("/operator/cell-gps")
      .then(({ data }) => {
        setGpsLookup(data);
        setRealGpsCount(Object.keys(data).length);
      })
      .catch(() => {});
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get("/operator/map-events");
      setEvents(data);
      setLastUpdated(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchEvents]);

  // Group by cell with real GPS
  const cells: CellData[] = useMemo(() => {
    const map = new Map<number, MapEvent[]>();
    events.forEach(e => {
      if (!map.has(e.cell_id)) map.set(e.cell_id, []);
      map.get(e.cell_id)!.push(e);
    });
    return Array.from(map.entries()).map(([cellId, evs]) => {
      const avgRisk = evs.reduce((s, e) => s + e.risk, 0) / evs.length;
      const gps = gpsLookup[String(cellId)];
      const hasRealGps = !!gps;
      const latLng: [number, number] = gps
        ? [gps.lat, gps.lng]
        : fallbackLatLng(cellId);
      return { cellId, latLng, events: evs, avgRisk, hoCount: evs.filter(e => e.recommended).length, hasRealGps };
    });
  }, [events, gpsLookup]);

  const displayedCells = useMemo(() => {
    if (filter === "risk") return cells.filter(c => c.avgRisk >= 0.7);
    if (filter === "ho") return cells.filter(c => c.hoCount > 0);
    return cells;
  }, [cells, filter]);

  const totalHO = cells.reduce((s, c) => s + c.hoCount, 0);
  const highRisk = cells.filter(c => c.avgRisk >= 0.7).length;
  const realGpsCells = cells.filter(c => c.hasRealGps).length;

  // Deduplicate: latest entry per UE_ID (for individual UE markers)
  const latestPerUE = useMemo(() => {
    const m = new Map<string, MapEvent>();
    events.forEach(e => { m.set(e.ue_id, e); });
    return Array.from(m.values());
  }, [events]);

  const totalUEs = latestPerUE.length;
  const activeUEs = latestPerUE.filter(e => e.ue_lat && e.ue_lng).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5 }}>Live Network Map — Ruhr Region, Germany 🇩🇪</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
            {totalUEs} concurrent UEs · {cells.length} active cells · {realGpsCells} real GPS · Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["all", "risk", "ho"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 18px", borderRadius: 100, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: "inherit",
              background: filter === f ? (f === "risk" ? "#ef4444" : f === "ho" ? "#f59e0b" : "#22d3ee") : "rgba(255,255,255,0.06)",
              color: filter === f ? "#fff" : "#64748b", transition: "all 0.2s",
            }}>
              {f === "all" ? "🗺 All Cells" : f === "risk" ? "🔴 High Risk" : "⚡ HO Alerts"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { l: "Concurrent UEs", v: totalUEs, color: "#22d3ee", icon: "📱" },
          { l: "Active Cells", v: cells.length, color: "#a855f7", icon: "🗼" },
          { l: "HO Recommended", v: totalHO, color: "#f59e0b", icon: "⚡" },
          { l: "High Risk Cells", v: highRisk, color: "#ef4444", icon: "🔴" },
          { l: "Real GPS UEs", v: activeUEs, color: "#22c55e", icon: "📍" },
        ].map(k => (
          <div key={k.l} style={{
            flex: 1, padding: "12px 14px", borderRadius: 14,
            background: "rgba(13,27,46,0.8)", border: `1px solid ${k.color}22`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{k.icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{k.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Map + sidebar */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 400 }}>
        {/* Map */}
        <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
          <MapContainer
            center={RUHR_CENTER}
            zoom={12}
            style={{ width: "100%", height: "100%", background: "#0d1b2e" }}
            zoomControl={true}
            attributionControl={false}
          >
            <FitRuhr />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

            {/* Area labels */}
            {AREAS.map(a => (
              <CircleMarker key={a.name} center={[a.lat, a.lng]} radius={2} pathOptions={{ color: "#1e3a5f", fillColor: "#334155", fillOpacity: 0.6, weight: 0 }}>
                <Tooltip permanent direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>{a.name}</span>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* Coverage zones */}
            {displayedCells.map(cell => (
              <Circle key={`zone-${cell.cellId}`} center={cell.latLng} radius={800}
                pathOptions={{
                  color: riskColor(cell.avgRisk),
                  fillColor: riskColor(cell.avgRisk),
                  fillOpacity: cell.avgRisk >= 0.7 ? 0.20 : cell.avgRisk >= 0.4 ? 0.12 : 0.07,
                  weight: cell.avgRisk >= 0.7 ? 1.5 : 0.5,
                  dashArray: cell.hoCount > 0 ? "6,3" : undefined,
                }} />
            ))}

            {/* Cell tower markers */}
            {displayedCells.map(cell => (
              <CircleMarker key={`cell-${cell.cellId}`} center={cell.latLng}
                radius={cell.avgRisk >= 0.7 ? 13 : cell.avgRisk >= 0.4 ? 10 : 8}
                pathOptions={{ color: riskColor(cell.avgRisk), fillColor: riskColor(cell.avgRisk), fillOpacity: 0.9, weight: 2 }}
                eventHandlers={{ click: () => setSelectedCell(cell) }}>
                <Tooltip direction="top" offset={[0, -10]}>
                  <div style={{ fontFamily: "Inter, sans-serif", padding: "2px 4px" }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>Cell {cell.cellId} {cell.hasRealGps ? "📍" : "〰️"}</div>
                    <div style={{ color: riskColor(cell.avgRisk), fontWeight: 700 }}>{riskLabel(cell.avgRisk)} · {(cell.avgRisk * 100).toFixed(0)}%</div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{cell.events.length} UEs · {cell.hoCount} HO alerts</div>
                    {cell.hasRealGps && <div style={{ color: "#22c55e", fontSize: 10 }}>✓ Real GPS from dataset</div>}
                  </div>
                </Tooltip>
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif", minWidth: 190 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>📡 Cell {cell.cellId}</div>
                    {cell.hasRealGps
                      ? <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 6 }}>✓ Real GPS — {cell.latLng[0].toFixed(4)}°N, {cell.latLng[1].toFixed(4)}°E</div>
                      : <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 6 }}>Estimated position (no GPS in dataset)</div>}
                    <hr style={{ border: "1px solid #e2e8f0", margin: "6px 0" }} />
                    <div><b>Avg Risk:</b> {(cell.avgRisk * 100).toFixed(1)}%</div>
                    <div><b>UEs:</b> {cell.events.length}</div>
                    <div><b>HO Recs:</b> {cell.hoCount}</div>
                    <div style={{ marginTop: 8 }}>
                      {cell.events.slice(0, 4).map(e => (
                        <div key={e.id} style={{ fontSize: 11, display: "flex", gap: 6, marginBottom: 2 }}>
                          <span>{scenarioEmoji(e.scenario)}</span>
                          <span style={{ color: riskColor(e.risk) }}>{(e.risk * 100).toFixed(0)}%</span>
                          <span style={{ color: "#64748b" }}>{e.rsrp}dBm SINR:{e.sinr}</span>
                          {e.recommended && <span style={{ color: "#ef4444", fontWeight: 700 }}>⚡HO</span>}
                        </div>
                      ))}
                      {cell.events.length > 4 && <div style={{ fontSize: 10, color: "#94a3b8" }}>+{cell.events.length - 4} more</div>}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* UE dots — at their real GPS position if available, else orbit cell */}
            {latestPerUE.map((e) => {
              const hasPos = e.ue_lat != null && e.ue_lng != null;
              let lat: number, lng: number;
              if (hasPos) {
                lat = e.ue_lat!;
                lng = e.ue_lng!;
              } else {
                // fallback: orbit the serving cell
                const cell = cells.find(c => c.cellId === e.cell_id);
                if (!cell) return null;
                lat = cell.latLng[0] + (Math.random() - 0.5) * 0.003;
                lng = cell.latLng[1] + (Math.random() - 0.5) * 0.003;
              }
              return (
                <CircleMarker key={e.ue_id}
                  center={[lat, lng]}
                  radius={e.recommended ? 6 : 4}
                  pathOptions={{
                    color: e.recommended ? "#ef4444" : riskColor(e.risk),
                    fillColor: riskColor(e.risk),
                    fillOpacity: 0.95,
                    weight: e.recommended ? 2.5 : 1.5,
                  }}>
                  <Tooltip direction="top">
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11 }}>
                      {scenarioEmoji(e.scenario)} <b>{e.ue_id}</b><br />
                      Risk: {(e.risk * 100).toFixed(0)}% · RSRP: {e.rsrp}dBm · SINR: {e.sinr}<br />
                      Velocity: {e.velocity.toFixed(0)} km/h · Cell: {e.cell_id}
                      {e.recommended && <><br /><b style={{ color: "#ef4444" }}>⚡ Handover Recommended</b></>}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Legend */}
          <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 1000, background: "rgba(5,13,26,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>Legend</div>
            {[
              { c: "#22c55e", l: "Healthy (< 40% risk)" },
              { c: "#f59e0b", l: "Medium (40-70%)" },
              { c: "#ef4444", l: "High risk (> 70%)" },
              { c: "#22c55e", l: "📍 = Real GPS from dataset" },
            ].map(lg => (
              <div key={lg.l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: lg.c, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#64748b" }}>{lg.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cell list sidebar */}
        <div style={{ width: 250, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5 }}>Active Cells ({displayedCells.length})</div>
          {[...displayedCells].sort((a, b) => b.avgRisk - a.avgRisk).map(cell => (
            <div key={cell.cellId} onClick={() => setSelectedCell(selectedCell?.cellId === cell.cellId ? null : cell)} style={{
              padding: "11px 13px", borderRadius: 12, cursor: "pointer",
              background: selectedCell?.cellId === cell.cellId ? `${riskColor(cell.avgRisk)}18` : "rgba(13,27,46,0.7)",
              border: `1px solid ${selectedCell?.cellId === cell.cellId ? riskColor(cell.avgRisk) + "44" : "rgba(255,255,255,0.06)"}`,
              transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#e2e8f0" }}>
                  Cell {cell.cellId} {cell.hasRealGps ? "📍" : ""}
                </div>
                <div style={{ padding: "2px 7px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: `${riskColor(cell.avgRisk)}20`, color: riskColor(cell.avgRisk) }}>
                  {riskLabel(cell.avgRisk)}
                </div>
              </div>
              <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.06)", marginBottom: 5 }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${cell.avgRisk * 100}%`, background: riskColor(cell.avgRisk), transition: "width 0.5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#334155" }}>
                <span>{cell.events.length} UEs</span>
                {cell.hoCount > 0 && <span style={{ color: "#f59e0b", fontWeight: 700 }}>⚡{cell.hoCount}</span>}
                <span style={{ color: riskColor(cell.avgRisk) }}>{(cell.avgRisk * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
          {displayedCells.length === 0 && <div style={{ padding: "32px 16px", textAlign: "center", color: "#334155", fontSize: 13 }}>Waiting for simulator data...</div>}
        </div>
      </div>

      {/* Cell detail panel */}
      {selectedCell && (
        <div style={{ padding: "18px 22px", borderRadius: 16, background: "rgba(13,27,46,0.9)", border: `1px solid ${riskColor(selectedCell.avgRisk)}33`, backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#e2e8f0" }}>📡 Cell {selectedCell.cellId}</span>
              {selectedCell.hasRealGps && <span style={{ marginLeft: 10, fontSize: 12, color: "#22c55e" }}>📍 {selectedCell.latLng[0].toFixed(4)}°N, {selectedCell.latLng[1].toFixed(4)}°E (real GPS)</span>}
            </div>
            <button onClick={() => setSelectedCell(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {selectedCell.events.map(e => (
              <div key={e.id} style={{ padding: "10px 13px", borderRadius: 10, minWidth: 150, background: "rgba(255,255,255,0.03)", border: `1px solid ${riskColor(e.risk)}22` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{scenarioEmoji(e.scenario)} {e.ue_id.slice(-10)}</span>
                  {e.recommended && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 800 }}>⚡HO</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: riskColor(e.risk) }}>{(e.risk * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: "#475569" }}>RSRP: {e.rsrp}dBm · SINR: {e.sinr}</div>
                <div style={{ fontSize: 10, color: "#334155" }}>{e.cluster_label?.slice(0, 30)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
