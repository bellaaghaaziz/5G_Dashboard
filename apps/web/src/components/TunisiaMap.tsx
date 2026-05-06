import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  Polyline,
} from "react-leaflet";
import { api } from "../api/client";

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Ruhr region bounding box
const RUHR_CENTER: [number, number] = [51.513, 7.465];

// Named areas
const AREAS = [
  { name: "Bochum", lat: 51.482, lng: 7.216 },
  { name: "Herne", lat: 51.537, lng: 7.225 },
  { name: "Dortmund", lat: 51.514, lng: 7.466 },
  { name: "Witten", lat: 51.433, lng: 7.353 },
  { name: "Castrop-Rauxel", lat: 51.553, lng: 7.317 },
];

const SCENARIO_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  hbahn:  { emoji: "🚋", label: "H-Bahn Train",   color: "#8b5cf6" },
  mobile: { emoji: "📱", label: "Mobile Phone",    color: "#3b82f6" },
  static: { emoji: "🏢", label: "Static Device",   color: "#06b6d4" },
};

function getScenario(s: string) {
  return SCENARIO_CONFIG[s] || { emoji: "📡", label: s || "Unknown", color: "#64748b" };
}

function riskColor(r: number): string {
  if (r >= 0.55) return "#ef4444";
  if (r >= 0.4) return "#f59e0b";
  return "#22c55e";
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
  const [selectedUE, setSelectedUE] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    api.get("/operator/cell-gps")
      .then(({ data }) => setGpsLookup(data))
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
    pollRef.current = setInterval(fetchEvents, 1000);
    return () => clearInterval(pollRef.current);
  }, [fetchEvents]);

  // Derived data
  const latestPerUE = useMemo(() => {
    const m = new Map<string, MapEvent>();
    events.forEach(e => { m.set(e.ue_id, e); });
    return Array.from(m.values());
  }, [events]);

  const selectedHistory = useMemo(() => {
    if (!selectedUE) return [];
    
    // Sort chronological
    const sorted = events
      .filter(e => e.ue_id === selectedUE)
      .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    
    // Find handover events (where cell_id changes)
    const hoEvents = [];
    let prevCell = -1;
    let baselineRsrp = -140;

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      if (e.cell_id !== prevCell) {
        if (prevCell !== -1) {
          // Calculate gain: current RSRP minus what it was before handover
          const gain = e.rsrp - baselineRsrp;
          hoEvents.push({
            ...e,
            prevCell,
            gain,
            isAi: e.recommended
          });
        }
        prevCell = e.cell_id;
      }
      baselineRsrp = e.rsrp; // keep track of the signal before it changes
    }
    return hoEvents.reverse(); // newest first
  }, [events, selectedUE]);

  const activeCells = useMemo(() => {
    const map = new Map<number, { lat: number, lng: number }>();
    latestPerUE.forEach(e => {
      const gps = gpsLookup[String(e.cell_id)];
      if (gps) map.set(e.cell_id, { lat: gps.lat, lng: gps.lng });
    });
    return map;
  }, [latestPerUE, gpsLookup]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <style>{`
        @keyframes fadeSignal {
          0% { opacity: 1; }
          50% { opacity: 0.2; }
          100% { opacity: 1; }
        }
        .ue-fade {
          animation: fadeSignal 2s ease-in-out infinite;
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5 }}>
            Live Network Map — Ruhr Region, Germany 🇩🇪
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
            {latestPerUE.length} active UEs · {activeCells.size} serving cells · Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Map + Sidebar */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 400 }}>
        
        {/* MAP PANEL */}
        <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
          <MapContainer center={RUHR_CENTER} zoom={12} style={{ width: "100%", height: "100%", background: "#0d1b2e" }} zoomControl={true} attributionControl={false}>
            <FitRuhr />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

            {AREAS.map(a => (
              <CircleMarker key={a.name} center={[a.lat, a.lng]} radius={2} pathOptions={{ color: "#1e3a5f", fillColor: "#334155", fillOpacity: 0.6, weight: 0 }}>
                <Tooltip permanent direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 10, color: "#475569", fontWeight: 700 }}>{a.name}</span>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* ONLY draw lines and markers for UEs. No big cell tower circles. */}
            {latestPerUE.map((e) => {
              if (e.ue_lat == null || e.ue_lng == null) return null;
              const cellPos = activeCells.get(e.cell_id);
              if (!cellPos) return null;
              
              const sc = getScenario(e.scenario);
              const isSelected = selectedUE === e.ue_id;
              
              // Dim others if one is selected
              const opacity = selectedUE && !isSelected ? 0.2 : 1;

              return (
                <div key={`render-${e.ue_id}`}>
                  {/* UE Marker */}
                  <CircleMarker
                    center={[e.ue_lat, e.ue_lng]}
                    radius={isSelected ? 14 : 10}
                    pathOptions={{
                      className: "ue-fade",
                      color: e.recommended ? "#ef4444" : "#ffffff",
                      fillColor: sc.color,
                      fillOpacity: opacity,
                      weight: 3,
                      opacity: opacity
                    }}
                    eventHandlers={{ click: () => setSelectedUE(isSelected ? null : e.ue_id) }}>
                    <Tooltip permanent direction="bottom" offset={[0, 12]}>
                      <div style={{ fontFamily: "Inter, sans-serif", textAlign: "center", background: "rgba(15,23,42,0.95)", padding: "4px 8px", borderRadius: 8, border: `2px solid ${sc.color}`, opacity }}>
                        <div style={{ fontSize: 14, lineHeight: 1 }}>{sc.emoji}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: sc.color, whiteSpace: "nowrap" }}>{sc.label}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8" }}>Cell {e.cell_id}</div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                </div>
              );
            })}
          </MapContainer>
        </div>

        {/* SIDEBAR */}
        <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          
          {selectedUE ? (
            // ================= HANDOVER HISTORY VIEW =================
            <div style={{ background: "rgba(13,27,46,0.8)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", height: "100%", display: "flex", flexDirection: "column" }}>
              {/* Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Handover History</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#f1f5f9" }}>{selectedUE}</div>
                </div>
                <button onClick={() => setSelectedUE(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>

              {/* Timeline */}
              <div style={{ padding: 20, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                {selectedHistory.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#64748b", fontSize: 13, marginTop: 40 }}>
                    Tracking trip...<br/>Waiting for first handover.
                  </div>
                ) : (
                  selectedHistory.map((ho, idx) => (
                    <div key={`${ho.timestamp}-${idx}`} style={{ position: "relative", paddingLeft: 24 }}>
                      {/* Timeline dot */}
                      <div style={{ position: "absolute", left: 0, top: 4, width: 10, height: 10, borderRadius: "50%", background: ho.isAi ? "#22c55e" : "#f59e0b", border: "2px solid #0d1b2e" }} />
                      {/* Timeline line */}
                      {idx !== selectedHistory.length - 1 && (
                        <div style={{ position: "absolute", left: 4, top: 14, bottom: -16, width: 2, background: "rgba(255,255,255,0.06)" }} />
                      )}
                      
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                        {new Date(ho.timestamp || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      
                      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, border: `1px solid ${ho.isAi ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>
                              Cell {ho.prevCell} <span style={{ color: "#64748b" }}>→</span> Cell {ho.cell_id}
                            </div>
                            <div style={{ fontSize: 11, color: ho.isAi ? "#22c55e" : "#f59e0b", fontWeight: 700, marginTop: 2 }}>
                              {ho.isAi ? "⚡ Predictive AI Handover" : "⏳ Legacy Reactive Handover"}
                            </div>
                          </div>
                          
                          {/* Gain Badge */}
                          <div style={{ background: ho.gain > 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: ho.gain > 0 ? "#22c55e" : "#ef4444", padding: "4px 8px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                            {ho.gain > 0 ? "+" : ""}{ho.gain.toFixed(1)} dBm Gain
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                          <div>
                            <span style={{ color: "#64748b" }}>New Signal:</span> <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{ho.rsrp} dBm</span>
                          </div>
                          <div>
                            <span style={{ color: "#64748b" }}>AI Risk Avoided:</span> <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{(ho.dso1_risk * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            // ================= ALL UEs VIEW =================
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5 }}>
                Active Trips ({latestPerUE.length})
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                Click any user to view their Handover History.
              </div>
              
              {latestPerUE.map(e => {
                const sc = getScenario(e.scenario);
                return (
                  <div key={e.ue_id}
                    onClick={() => setSelectedUE(e.ue_id)}
                    style={{
                      padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                      background: "rgba(13,27,46,0.8)", border: "1px solid rgba(255,255,255,0.06)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.borderColor = sc.color}
                    onMouseLeave={(ev) => ev.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `${sc.color}20`, fontSize: 22 }}>
                        {sc.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: "#f1f5f9" }}>{sc.label}</div>
                        <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{e.ue_id}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Serving Cell</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#e2e8f0" }}>{e.cell_id}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>RSRP</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: e.rsrp > -95 ? "#22c55e" : "#ef4444" }}>{e.rsrp} dBm</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
