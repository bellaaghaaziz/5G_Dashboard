import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Card, Stack, Chip, CircularProgress, Tabs, Tab, } from "@mui/material";
import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
export function HandoverHistoryPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState(0);
    const fetchHistory = useCallback(async () => {
        try {
            const { data: d } = await api.get("/operator/handover-history");
            setData(d);
        }
        catch (e) {
            console.error("Failed to fetch handover history", e);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 2000);
        return () => clearInterval(interval);
    }, [fetchHistory]);
    const reactive = data?.reactive ?? [];
    const predictive = data?.predictive ?? [];
    const summary = data?.summary;
    const pol = data?.hoPolicyComparison;
    const scenarioEmoji = {
        hbahn: "🚋",
        mobile: "📱",
        static: "🏢",
        pedestrian: "🚶",
        car: "🚗",
    };
    return (_jsxs(Box, { children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", marginBottom: 2, children: [_jsx(HistoryRoundedIcon, { sx: { fontSize: 32 } }), _jsxs(Box, { children: [_jsx(Typography, { variant: "h4", sx: { fontWeight: 900, letterSpacing: -0.5 }, children: "Handover History" }), _jsxs(Typography, { variant: "body2", sx: { color: "text.secondary", mt: 0.3 }, children: [_jsx("b", { children: "Legacy reactive" }), " waits until RSRP drops below a floor (signal already degraded).", " ", _jsx("b", { children: "Predictive" }), " uses your pipeline to hand over earlier while RSRP is still stronger."] })] })] }), pol && (_jsxs(Card, { sx: {
                    mb: 2,
                    p: 2,
                    background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,27,75,0.9))",
                    border: "1px solid rgba(168,85,247,0.25)",
                }, children: [_jsx(Typography, { variant: "subtitle2", sx: { color: "#c084fc", fontWeight: 800, mb: 1 }, children: "Live comparison (from simulator / logs)" }), _jsxs(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", useFlexGap: true, sx: { mb: 1.5 }, children: [_jsx(Chip, { label: `Legacy HO (degraded): ${pol.reactiveLegacyHoCount}`, sx: { fontWeight: 700, background: "rgba(239,68,68,0.15)", color: "#fca5a5" } }), _jsx(Chip, { label: `Predictive HO: ${pol.predictiveHoCount}`, sx: { fontWeight: 700, background: "rgba(34,211,238,0.15)", color: "#67e8f9" } }), _jsx(Chip, { label: `Avg RSRP legacy: ${pol.avgRsrpAtLegacyHoDbm ?? "—"} dBm`, sx: { fontWeight: 700, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" } }), _jsx(Chip, { label: `Avg RSRP predictive: ${pol.avgRsrpAtPredictiveHoDbm ?? "—"} dBm`, sx: { fontWeight: 700, background: "rgba(52,211,153,0.15)", color: "#6ee7b7" } }), _jsx(Chip, { label: `Headroom: ${pol.signalHeadroomDb != null ? `${pol.signalHeadroomDb} dB` : "—"}`, title: "Positive means predictive handovers at stronger (less degraded) signal", sx: { fontWeight: 800, background: "rgba(250,204,21,0.12)", color: "#fde047" } })] }), _jsx(Typography, { variant: "body2", sx: { color: "#cbd5e1", lineHeight: 1.5 }, children: pol.narrative })] })), _jsxs(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", useFlexGap: true, sx: { mb: 2 }, children: [_jsx(Chip, { label: `Legacy rows: ${summary?.reactiveCount ?? 0}`, sx: { fontWeight: 700, background: "rgba(239,68,68,0.12)", color: "#f87171" } }), _jsx(Chip, { label: `Predictive HO rows: ${summary?.predictiveHoCount ?? 0}`, sx: { fontWeight: 700, background: "rgba(34,211,238,0.12)", color: "#22d3ee" } }), _jsx(Chip, { label: `Model ticks (inference): ${summary?.predictiveInferenceCount ?? 0}`, sx: { fontWeight: 600, background: "rgba(100,116,139,0.12)", color: "#94a3b8" } })] }), _jsxs(Card, { sx: {
                    background: "rgba(13,27,46,0.8)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    height: "calc(100vh - 420px)",
                    minHeight: 320,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                }, children: [_jsxs(Tabs, { value: tab, onChange: (_, v) => setTab(v), sx: {
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            minHeight: 42,
                            "& .MuiTab-root": { minHeight: 42, textTransform: "none", fontWeight: 700 },
                        }, children: [_jsx(Tab, { label: `Legacy (reactive / dataset) · ${reactive.length}` }), _jsx(Tab, { label: `Predictive (AI handovers) · ${predictive.length}` })] }), _jsxs(TableContainer, { sx: { flexGrow: 1 }, children: [tab === 0 && (_jsxs(Table, { stickyHeader: true, children: [_jsx(TableHead, { children: _jsxs(TableRow, { children: [_jsx(TableCell, { sx: headSx, children: "Time" }), _jsx(TableCell, { sx: headSx, children: "UE" }), _jsx(TableCell, { sx: headSx, children: "Handover" }), _jsx(TableCell, { sx: headSx, children: "RSRP @ HO" }), _jsx(TableCell, { align: "right", sx: headSx, children: "RSRP \u0394" }), _jsx(TableCell, { sx: headSx, children: "Policy" }), _jsx(TableCell, { sx: headSx, children: "AI prior tick" })] }) }), _jsxs(TableBody, { children: [reactive.map((ho, idx) => {
                                                const rsrpDelta = Number(ho.rsrp_delta ?? 0);
                                                const rsrpAt = ho.rsrp_at_ho;
                                                const aiRisk = Number(ho.ai_risk ?? 0);
                                                const distDelta = Number(ho.dist_to_old_m ?? 0) - Number(ho.dist_to_new_m ?? 0);
                                                const isLegacy = ho.kind === "reactive_legacy";
                                                return (_jsxs(TableRow, { sx: { "&:hover": { background: "rgba(255,255,255,0.03)" } }, children: [_jsx(TableCell, { sx: { fontSize: 11, color: "#64748b" }, children: ho.timestamp ? new Date(String(ho.timestamp)).toLocaleTimeString() : "—" }), _jsxs(TableCell, { sx: { fontSize: 12, fontWeight: 600 }, children: [String(ho.ue_id ?? "").slice(-12) || "Unknown", " ", scenarioEmoji[String(ho.scenario)] || "📡"] }), _jsxs(TableCell, { sx: { fontSize: 12, fontWeight: 700 }, children: [_jsxs("span", { style: { color: "#64748b" }, children: ["Cell ", ho.from_cell] }), _jsx("span", { style: { color: "#475569", margin: "0 4px" }, children: "\u2192" }), _jsxs("span", { style: { color: "#f87171" }, children: ["Cell ", ho.to_cell] })] }), _jsxs(TableCell, { sx: { fontSize: 11, color: isLegacy ? "#f87171" : "#94a3b8" }, children: [rsrpAt != null ? `${Number(rsrpAt).toFixed(1)} dBm` : "—", isLegacy && (_jsx(Chip, { label: "degraded", size: "small", sx: { ml: 0.5, height: 18, fontSize: 10, color: "#fecaca" } }))] }), _jsxs(TableCell, { align: "right", sx: { fontSize: 11, color: rsrpDelta > 0 ? "#22c55e" : "#ef4444" }, children: [rsrpDelta > 0 ? "+" : "", rsrpDelta.toFixed(1), " dB", rsrpAt == null && distDelta !== 0 && (_jsxs("span", { style: { color: "#64748b" }, children: [" ", "(\u0394dist ", distDelta > 0 ? "+" : "", distDelta.toFixed(0), "m)"] }))] }), _jsx(TableCell, { sx: { fontSize: 10, color: "#94a3b8" }, children: String(ho.policy ?? ho.kind ?? "—") }), _jsx(TableCell, { sx: { fontSize: 11 }, children: ho.ai_recommended != null ? (ho.ai_recommended ? (_jsxs("span", { style: { color: "#a855f7" }, children: ["\u2713 (", (aiRisk * 100).toFixed(0), "%)"] })) : (_jsx("span", { style: { color: "#64748b" }, children: "\u2014" }))) : ("—") })] }, idx));
                                            }), reactive.length === 0 && (_jsx(TableRow, { children: _jsx(TableCell, { colSpan: 7, sx: { textAlign: "center", py: 4, color: "#475569" }, children: loading ? (_jsx(CircularProgress, { size: 24 })) : (_jsxs(_Fragment, { children: ["No legacy handovers yet. Run ", _jsx("code", { children: "python run_city.py" }), " or replay."] })) }) }))] })] })), tab === 1 && (_jsxs(Table, { stickyHeader: true, children: [_jsx(TableHead, { children: _jsxs(TableRow, { children: [_jsx(TableCell, { sx: headSx, children: "Time" }), _jsx(TableCell, { sx: headSx, children: "UE" }), _jsx(TableCell, { sx: headSx, children: "Handover" }), _jsx(TableCell, { sx: headSx, children: "RSRP @ HO" }), _jsx(TableCell, { align: "right", sx: headSx, children: "P(ho)" }), _jsx(TableCell, { sx: headSx, children: "Above legacy floor?" }), _jsx(TableCell, { sx: headSx, children: "Strict API HO" })] }) }), _jsxs(TableBody, { children: [predictive.map((ev, idx) => {
                                                const rsrp = Number(ev.rsrp_at_ho);
                                                const floor = Number(ev.legacy_rsrp_floor_dbm ?? -98);
                                                const above = ev.still_above_legacy_floor !== false && rsrp > floor;
                                                return (_jsxs(TableRow, { sx: { "&:hover": { background: "rgba(255,255,255,0.03)" } }, children: [_jsx(TableCell, { sx: { fontSize: 11, color: "#64748b" }, children: ev.timestamp ? new Date(String(ev.timestamp)).toLocaleTimeString() : "—" }), _jsxs(TableCell, { sx: { fontSize: 12, fontWeight: 600 }, children: [String(ev.ue_id ?? "").slice(-12) || "Unknown", " ", scenarioEmoji[String(ev.scenario)] || "📡"] }), _jsxs(TableCell, { sx: { fontSize: 12, fontWeight: 700 }, children: [_jsxs("span", { style: { color: "#64748b" }, children: ["Cell ", ev.from_cell] }), _jsx("span", { style: { color: "#475569", margin: "0 4px" }, children: "\u2192" }), _jsxs("span", { style: { color: "#22d3ee" }, children: ["Cell ", ev.to_cell] })] }), _jsxs(TableCell, { sx: { fontSize: 11, color: above ? "#6ee7b7" : "#fbbf24" }, children: [rsrp.toFixed(1), " dBm"] }), _jsxs(TableCell, { align: "right", sx: { fontSize: 11, color: "#c084fc", fontWeight: 700 }, children: [((Number(ev.dso4_probability) || 0) * 100).toFixed(1), "%"] }), _jsx(TableCell, { sx: { fontSize: 11 }, children: above ? (_jsx(Chip, { label: "Yes \u2014 proactive", size: "small", sx: { height: 22, color: "#6ee7b7" } })) : (_jsx(Chip, { label: "At / past floor", size: "small", sx: { height: 22, color: "#fbbf24" } })) }), _jsx(TableCell, { sx: { fontSize: 12 }, children: ev.api_handover_recommended ? (_jsx("span", { style: { color: "#22d3ee" }, children: "\u2713 API" })) : (_jsx("span", { style: { color: "#c084fc" }, children: "guided" })) })] }, idx));
                                            }), predictive.length === 0 && (_jsx(TableRow, { children: _jsx(TableCell, { colSpan: 7, sx: { textAlign: "center", py: 4, color: "#475569" }, children: loading ? (_jsx(CircularProgress, { size: 24 })) : (_jsxs(_Fragment, { children: ["No predictive handover executions logged. Start ", _jsx("code", { children: "run_city.py" }), " with the API on port 8000."] })) }) }))] })] }))] })] })] }));
}
const headSx = {
    background: "rgba(13,27,46,0.95)",
    fontWeight: 700,
    color: "primary.main",
};
