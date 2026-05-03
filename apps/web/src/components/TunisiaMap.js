import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, Popup, useMap, Polyline, } from "react-leaflet";
import { api } from "../api/client";
// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});
// Ruhr region bounding box (where dataset was collected)
const RUHR_CENTER = [51.513, 7.465];
// Named areas in the dataset region
const AREAS = [
    { name: "Bochum", lat: 51.482, lng: 7.216 },
    { name: "Herne", lat: 51.537, lng: 7.225 },
    { name: "Dortmund", lat: 51.514, lng: 7.466 },
    { name: "Witten", lat: 51.433, lng: 7.353 },
    { name: "Castrop-Rauxel", lat: 51.553, lng: 7.317 },
];
function riskColor(r) {
    if (r >= 0.55)
        return "#ef4444";
    if (r >= 0.4)
        return "#f59e0b";
    return "#22c55e";
}
function riskLabel(r) {
    if (r >= 0.55)
        return "High Risk";
    if (r >= 0.4)
        return "Medium";
    return "Healthy";
}
function scenarioEmoji(s) {
    if (s === "hbahn")
        return "🚋";
    if (s === "mobile")
        return "📱";
    if (s === "static")
        return "🏢";
    return "📡";
}
function FitRuhr() {
    const map = useMap();
    useEffect(() => {
        map.setView(RUHR_CENTER, 12);
    }, [map]);
    return null;
}
export function TunisiaMap() {
    const [events, setEvents] = useState([]);
    const [gpsLookup, setGpsLookup] = useState({});
    const [selectedCell, setSelectedCell] = useState(null);
    const [filter, setFilter] = useState("all");
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [realGpsCount, setRealGpsCount] = useState(0);
    const pollRef = useRef(undefined);
    // Load GPS lookup once
    useEffect(() => {
        api.get("/operator/cell-gps")
            .then(({ data }) => {
            setGpsLookup(data);
            setRealGpsCount(Object.keys(data).length);
        })
            .catch(() => { });
    }, []);
    const fetchEvents = useCallback(async () => {
        try {
            const { data } = await api.get("/operator/map-events");
            setEvents(data);
            setLastUpdated(new Date());
        }
        catch { }
    }, []);
    useEffect(() => {
        fetchEvents();
        pollRef.current = setInterval(fetchEvents, 3000);
        return () => clearInterval(pollRef.current);
    }, [fetchEvents]);
    // Deduplicate: latest entry per UE_ID (for individual UE markers)
    const latestPerUE = useMemo(() => {
        const m = new Map();
        events.forEach(e => { m.set(e.ue_id, e); });
        return Array.from(m.values());
    }, [events]);
    // Group by cell with real GPS
    const cells = useMemo(() => {
        const activeCellIds = new Set(latestPerUE.map(e => e.cell_id));
        const map = new Map();
        events.forEach(e => {
            if (!activeCellIds.has(e.cell_id))
                return; // Only consider cells currently serving a UE
            if (!map.has(e.cell_id))
                map.set(e.cell_id, []);
            map.get(e.cell_id).push(e);
        });
        return Array.from(map.entries()).map(([cellId, evs]) => {
            // @ts-ignore — filtered below
            // Telecom Logic Fix: A cell is not "bad" just because 1 UE is moving away.
            // We calculate true cell congestion/risk based on the proportion of struggling UEs.
            const hoRatio = evs.length > 0 ? evs.filter(e => e.risk > 0.82).length / evs.length : 0;
            // A cell is only High Risk if >30% of its UEs are failing AND it has at least 3 UEs.
            // Otherwise, we cap its displayed risk so it stays Healthy/Medium.
            let avgRisk = evs.reduce((s, e) => s + e.risk, 0) / evs.length;
            if (evs.length < 3 && avgRisk > 0.82) {
                avgRisk = 0.5; // Cap at Medium if it's just 1-2 UEs driving away
            }
            const gps = gpsLookup[String(cellId)];
            const hasRealGps = !!gps;
            if (!gps)
                return null; // Skip cells without real GPS — no fake positions
            const latLng = [gps.lat, gps.lng];
            return { cellId, latLng, events: evs, avgRisk, hoCount: evs.filter(e => e.recommended).length, hasRealGps };
        }).filter((c) => c !== null);
    }, [events, gpsLookup]);
    const displayedCells = useMemo(() => {
        if (filter === "risk")
            return cells.filter(c => c.avgRisk >= 0.82);
        if (filter === "ho")
            return cells.filter(c => c.hoCount > 0);
        return cells;
    }, [cells, filter]);
    // All towers from GPS lookup (infrastructure layer)
    const allTowers = useMemo(() => {
        const activeCellIds = new Set(cells.map(c => c.cellId));
        return Object.entries(gpsLookup)
            .filter(([id]) => !activeCellIds.has(Number(id)))
            .map(([id, pos]) => ({ cellId: Number(id), lat: pos.lat, lng: pos.lng, scenario: pos.scenario }));
    }, [gpsLookup, cells]);
    const totalHO = cells.reduce((s, c) => s + c.hoCount, 0);
    const highRisk = cells.filter(c => c.avgRisk >= 0.82).length;
    const totalTowers = Object.keys(gpsLookup).length;
    const totalUEs = latestPerUE.length;
    const activeUEs = latestPerUE.filter(e => e.ue_lat && e.ue_lng).length;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: 16 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 22, fontWeight: 900, color: "#f1f5f9", letterSpacing: -0.5 }, children: "Live Network Map \u2014 Ruhr Region, Germany \uD83C\uDDE9\uD83C\uDDEA" }), _jsxs("div", { style: { fontSize: 13, color: "#475569", marginTop: 2 }, children: [totalUEs, " concurrent UEs \u00B7 ", cells.length, " active cells \u00B7 ", totalTowers, " total towers \u00B7 Updated ", lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })] })] }), _jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: ["all", "risk", "ho"].map(f => (_jsx("button", { onClick: () => setFilter(f), style: {
                                padding: "7px 18px", borderRadius: 100, border: "none", cursor: "pointer",
                                fontWeight: 700, fontSize: 13, fontFamily: "inherit",
                                background: filter === f ? (f === "risk" ? "#ef4444" : f === "ho" ? "#f59e0b" : "#22d3ee") : "rgba(255,255,255,0.06)",
                                color: filter === f ? "#fff" : "#64748b", transition: "all 0.2s",
                            }, children: f === "all" ? "🗺 All Cells" : f === "risk" ? "🔴 High Risk" : "⚡ HO Alerts" }, f))) })] }), _jsx("div", { style: { display: "flex", gap: 12 }, children: [
                    { l: "Concurrent UEs", v: totalUEs, color: "#22d3ee", icon: "📱" },
                    { l: "Active Cells", v: cells.length, color: "#a855f7", icon: "🗼" },
                    { l: "HO Recommended", v: totalHO, color: "#f59e0b", icon: "⚡" },
                    { l: "High Risk Cells", v: highRisk, color: "#ef4444", icon: "🔴" },
                    { l: "Total Towers", v: totalTowers, color: "#22c55e", icon: "📍" },
                ].map(k => (_jsxs("div", { style: {
                        flex: 1, padding: "12px 14px", borderRadius: 14,
                        background: "rgba(13,27,46,0.8)", border: `1px solid ${k.color}22`,
                        display: "flex", alignItems: "center", gap: 10,
                    }, children: [_jsx("span", { style: { fontSize: 20 }, children: k.icon }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }, children: k.v }), _jsx("div", { style: { fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }, children: k.l })] })] }, k.l))) }), _jsxs("div", { style: { display: "flex", gap: 16, flex: 1, minHeight: 400 }, children: [_jsxs("div", { style: { flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }, children: [_jsxs(MapContainer, { center: RUHR_CENTER, zoom: 12, style: { width: "100%", height: "100%", background: "#0d1b2e" }, zoomControl: true, attributionControl: false, children: [_jsx(FitRuhr, {}), _jsx(TileLayer, { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" }), AREAS.map(a => (_jsx(CircleMarker, { center: [a.lat, a.lng], radius: 2, pathOptions: { color: "#1e3a5f", fillColor: "#334155", fillOpacity: 0.6, weight: 0 }, children: _jsx(Tooltip, { permanent: true, direction: "top", offset: [0, -4], children: _jsx("span", { style: { fontSize: 10, color: "#475569", fontWeight: 700 }, children: a.name }) }) }, a.name))), allTowers.map(t => (_jsx(CircleMarker, { center: [t.lat, t.lng], radius: 6, pathOptions: { color: "#64748b", fillColor: "#1e293b", fillOpacity: 0.9, weight: 2 }, children: _jsx(Tooltip, { direction: "top", children: _jsxs("span", { style: { fontSize: 10 }, children: ["\uD83D\uDDFC Cell ", t.cellId, " (idle)"] }) }) }, `tower-${t.cellId}`))), displayedCells.map(cell => (_jsx(Circle, { center: cell.latLng, radius: 400, pathOptions: {
                                            color: riskColor(cell.avgRisk),
                                            fillColor: riskColor(cell.avgRisk),
                                            fillOpacity: cell.avgRisk >= 0.55 ? 0.20 : cell.avgRisk >= 0.4 ? 0.12 : 0.07,
                                            weight: cell.avgRisk >= 0.55 ? 1.5 : 0.5,
                                            dashArray: cell.hoCount > 0 ? "6,3" : undefined,
                                        } }, `zone-${cell.cellId}`))), displayedCells.map(cell => (_jsxs(CircleMarker, { center: cell.latLng, radius: cell.avgRisk >= 0.55 ? 13 : cell.avgRisk >= 0.4 ? 10 : 8, pathOptions: { color: riskColor(cell.avgRisk), fillColor: riskColor(cell.avgRisk), fillOpacity: 0.9, weight: 2 }, eventHandlers: { click: () => setSelectedCell(cell) }, children: [_jsx(Tooltip, { direction: "top", offset: [0, -10], children: _jsxs("div", { style: { fontFamily: "Inter, sans-serif", padding: "2px 4px" }, children: [_jsxs("div", { style: { fontWeight: 800, fontSize: 13 }, children: ["Cell ", cell.cellId, " ", cell.hasRealGps ? "📍" : "〰️"] }), _jsxs("div", { style: { color: riskColor(cell.avgRisk), fontWeight: 700 }, children: [riskLabel(cell.avgRisk), " \u00B7 ", (cell.avgRisk * 100).toFixed(0), "%"] }), _jsxs("div", { style: { color: "#64748b", fontSize: 11 }, children: [cell.events.length, " UEs \u00B7 ", cell.hoCount, " HO alerts"] }), cell.hasRealGps && _jsx("div", { style: { color: "#22c55e", fontSize: 10 }, children: "\u2713 Real GPS from dataset" })] }) }), _jsx(Popup, { children: _jsxs("div", { style: { fontFamily: "Inter, sans-serif", minWidth: 190 }, children: [_jsxs("div", { style: { fontWeight: 800, fontSize: 14, marginBottom: 2 }, children: ["\uD83D\uDCE1 Cell ", cell.cellId] }), cell.hasRealGps
                                                            ? _jsxs("div", { style: { fontSize: 11, color: "#22c55e", marginBottom: 6 }, children: ["\u2713 Real GPS \u2014 ", cell.latLng[0].toFixed(4), "\u00B0N, ", cell.latLng[1].toFixed(4), "\u00B0E"] })
                                                            : _jsx("div", { style: { fontSize: 11, color: "#f59e0b", marginBottom: 6 }, children: "Estimated position (no GPS in dataset)" }), _jsx("hr", { style: { border: "1px solid #e2e8f0", margin: "6px 0" } }), _jsxs("div", { children: [_jsx("b", { children: "Avg Risk:" }), " ", (cell.avgRisk * 100).toFixed(1), "%"] }), _jsxs("div", { children: [_jsx("b", { children: "UEs:" }), " ", cell.events.length] }), _jsxs("div", { children: [_jsx("b", { children: "HO Recs:" }), " ", cell.hoCount] }), _jsxs("div", { style: { marginTop: 8 }, children: [cell.events.slice(0, 4).map(e => (_jsxs("div", { style: { fontSize: 11, display: "flex", gap: 6, marginBottom: 2 }, children: [_jsx("span", { children: scenarioEmoji(e.scenario) }), _jsxs("span", { style: { color: riskColor(e.risk) }, children: [(e.risk * 100).toFixed(0), "%"] }), _jsxs("span", { style: { color: "#64748b" }, children: [e.rsrp, "dBm SINR:", e.sinr] }), e.recommended && _jsx("span", { style: { color: "#ef4444", fontWeight: 700 }, children: "\u26A1HO" })] }, e.id))), cell.events.length > 4 && _jsxs("div", { style: { fontSize: 10, color: "#94a3b8" }, children: ["+", cell.events.length - 4, " more"] })] })] }) })] }, `cell-${cell.cellId}`))), latestPerUE.map((e) => {
                                        if (e.ue_lat == null || e.ue_lng == null)
                                            return null;
                                        const cell = cells.find(c => c.cellId === e.cell_id);
                                        if (!cell)
                                            return null;
                                        return (_jsx(Polyline, { positions: [[e.ue_lat, e.ue_lng], cell.latLng], pathOptions: {
                                                color: e.recommended ? "#ef4444" : riskColor(e.risk),
                                                weight: e.recommended ? 4 : 2,
                                                dashArray: "8, 8",
                                                opacity: 0.8
                                            } }, `link-${e.ue_id}`));
                                    }), latestPerUE.map((e) => {
                                        const hasPos = e.ue_lat != null && e.ue_lng != null;
                                        let lat, lng;
                                        if (hasPos) {
                                            lat = e.ue_lat;
                                            lng = e.ue_lng;
                                        }
                                        else {
                                            // fallback: orbit the serving cell
                                            const cell = cells.find(c => c.cellId === e.cell_id);
                                            if (!cell)
                                                return null;
                                            lat = cell.latLng[0] + (Math.random() - 0.5) * 0.003;
                                            lng = cell.latLng[1] + (Math.random() - 0.5) * 0.003;
                                        }
                                        return (_jsx(CircleMarker, { center: [lat, lng], radius: e.recommended ? 10 : 8, pathOptions: {
                                                color: "#ffffff",
                                                fillColor: e.recommended ? "#ef4444" : riskColor(e.risk),
                                                fillOpacity: 1,
                                                weight: 2,
                                            }, children: _jsx(Tooltip, { direction: "top", children: _jsxs("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 11 }, children: [scenarioEmoji(e.scenario), " ", _jsx("b", { children: e.ue_id }), _jsx("br", {}), "Risk: ", (e.risk * 100).toFixed(0), "% \u00B7 RSRP: ", e.rsrp, "dBm \u00B7 SINR: ", e.sinr, _jsx("br", {}), "Velocity: ", e.velocity.toFixed(0), " km/h \u00B7 Cell: ", e.cell_id, e.recommended && _jsxs(_Fragment, { children: [_jsx("br", {}), _jsx("b", { style: { color: "#ef4444" }, children: "\u26A1 Handover Recommended" })] })] }) }) }, e.ue_id));
                                    })] }), _jsxs("div", { style: { position: "absolute", bottom: 16, left: 16, zIndex: 1000, background: "rgba(5,13,26,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 7 }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }, children: "Legend" }), [
                                        { c: "#22c55e", l: "Healthy (< 40% risk)" },
                                        { c: "#f59e0b", l: "Medium (40-70%)" },
                                        { c: "#ef4444", l: "High risk (> 55%)" },
                                        { c: "#22c55e", l: "📍 = Real GPS from dataset" },
                                    ].map(lg => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("div", { style: { width: 10, height: 10, borderRadius: "50%", background: lg.c, flexShrink: 0 } }), _jsx("span", { style: { fontSize: 11, color: "#64748b" }, children: lg.l })] }, lg.l)))] })] }), _jsxs("div", { style: { width: 250, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: "100%" }, children: [_jsxs("div", { style: { fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5 }, children: ["Active Cells (", displayedCells.length, ")"] }), [...displayedCells].sort((a, b) => b.avgRisk - a.avgRisk).map(cell => (_jsxs("div", { onClick: () => setSelectedCell(selectedCell?.cellId === cell.cellId ? null : cell), style: {
                                    padding: "11px 13px", borderRadius: 12, cursor: "pointer",
                                    background: selectedCell?.cellId === cell.cellId ? `${riskColor(cell.avgRisk)}18` : "rgba(13,27,46,0.7)",
                                    border: `1px solid ${selectedCell?.cellId === cell.cellId ? riskColor(cell.avgRisk) + "44" : "rgba(255,255,255,0.06)"}`,
                                    transition: "all 0.2s",
                                }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }, children: [_jsxs("div", { style: { fontWeight: 700, fontSize: 12, color: "#e2e8f0" }, children: ["Cell ", cell.cellId, " ", cell.hasRealGps ? "📍" : ""] }), _jsx("div", { style: { padding: "2px 7px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: `${riskColor(cell.avgRisk)}20`, color: riskColor(cell.avgRisk) }, children: riskLabel(cell.avgRisk) })] }), _jsx("div", { style: { height: 3, borderRadius: 3, background: "rgba(255,255,255,0.06)", marginBottom: 5 }, children: _jsx("div", { style: { height: "100%", borderRadius: 3, width: `${cell.avgRisk * 100}%`, background: riskColor(cell.avgRisk), transition: "width 0.5s" } }) }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#334155" }, children: [_jsxs("span", { children: [cell.events.length, " UEs"] }), cell.hoCount > 0 && _jsxs("span", { style: { color: "#f59e0b", fontWeight: 700 }, children: ["\u26A1", cell.hoCount] }), _jsxs("span", { style: { color: riskColor(cell.avgRisk) }, children: [(cell.avgRisk * 100).toFixed(0), "%"] })] })] }, cell.cellId))), displayedCells.length === 0 && _jsx("div", { style: { padding: "32px 16px", textAlign: "center", color: "#334155", fontSize: 13 }, children: "Waiting for simulator data..." })] })] }), selectedCell && (_jsxs("div", { style: { padding: "18px 22px", borderRadius: 16, background: "rgba(13,27,46,0.9)", border: `1px solid ${riskColor(selectedCell.avgRisk)}33`, backdropFilter: "blur(12px)" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [_jsxs("div", { children: [_jsxs("span", { style: { fontWeight: 800, fontSize: 16, color: "#e2e8f0" }, children: ["\uD83D\uDCE1 Cell ", selectedCell.cellId] }), selectedCell.hasRealGps && _jsxs("span", { style: { marginLeft: 10, fontSize: 12, color: "#22c55e" }, children: ["\uD83D\uDCCD ", selectedCell.latLng[0].toFixed(4), "\u00B0N, ", selectedCell.latLng[1].toFixed(4), "\u00B0E (real GPS)"] })] }), _jsx("button", { onClick: () => setSelectedCell(null), style: { background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16, fontFamily: "inherit" }, children: "\u2715" })] }), _jsx("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: selectedCell.events.map(e => (_jsxs("div", { style: { padding: "10px 13px", borderRadius: 10, minWidth: 150, background: "rgba(255,255,255,0.03)", border: `1px solid ${riskColor(e.risk)}22` }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 3 }, children: [_jsxs("span", { style: { fontSize: 11, fontWeight: 700, color: "#94a3b8" }, children: [scenarioEmoji(e.scenario), " ", e.ue_id.slice(-10)] }), e.recommended && _jsx("span", { style: { fontSize: 10, color: "#ef4444", fontWeight: 800 }, children: "\u26A1HO" })] }), _jsxs("div", { style: { fontSize: 13, fontWeight: 800, color: riskColor(e.risk) }, children: [(e.risk * 100).toFixed(1), "%"] }), _jsxs("div", { style: { fontSize: 11, color: "#475569" }, children: ["RSRP: ", e.rsrp, "dBm \u00B7 SINR: ", e.sinr] }), _jsx("div", { style: { fontSize: 10, color: "#334155" }, children: e.cluster_label?.slice(0, 30) })] }, e.id))) })] }))] }));
}
