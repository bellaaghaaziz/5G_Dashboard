import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import { Box, Card, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
const SCENARIO_ICON = {
    hbahn: "🚋",
    mobile: "📱",
    static: "🏢",
};
function fmtTime(ts) {
    const d = new Date(ts);
    return isNaN(d.getTime())
        ? "—"
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function GainBadge({ gain }) {
    const positive = gain > 0;
    return (_jsxs("span", { style: {
            fontSize: 11,
            fontWeight: 800,
            color: positive ? "#22c55e" : "#ef4444",
            background: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${positive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            borderRadius: 6,
            padding: "1px 6px",
        }, children: [positive ? "+" : "", gain.toFixed(1), " dB"] }));
}
function AIBadge({ ai }) {
    if (!ai) {
        return _jsx("span", { style: { fontSize: 10, color: "#334155" }, children: "\u2014" });
    }
    const isProactive = ai.recommended && ai.proactive_headroom_db !== null && ai.proactive_headroom_db > 0;
    const isAligned = ai.recommended && !isProactive;
    const isReactive = !ai.recommended;
    const color = isProactive ? "#22c55e" : isAligned ? "#22d3ee" : "#f59e0b";
    const bg = isProactive ? "rgba(34,197,94,0.1)" : isAligned ? "rgba(34,211,238,0.1)" : "rgba(245,158,11,0.1)";
    const border = isProactive ? "rgba(34,197,94,0.3)" : isAligned ? "rgba(34,211,238,0.3)" : "rgba(245,158,11,0.3)";
    const label = isProactive
        ? `+${ai.proactive_headroom_db.toFixed(1)} dB early`
        : isAligned
            ? "Aligned"
            : "No signal";
    const tooltipContent = (_jsxs(Box, { sx: { p: 0.5, minWidth: 200 }, children: [_jsx(Typography, { sx: { fontSize: 11, fontWeight: 700, color: "#f1f5f9", mb: 0.5 }, children: "AI Decision Analysis" }), _jsx(Box, { sx: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" }, children: [
                    ["DSO3 Profile", ai.dso3_label || `Cluster ${ai.dso3_cluster}`],
                    ["DSO4 Prob", `${(ai.dso4_probability * 100).toFixed(1)}%`],
                    ["Risk Score", `${(ai.dso1_risk_score * 100).toFixed(1)}%`],
                    ["AI at RSRP", `${ai.ai_rsrp} dBm`],
                    ["HO at RSRP", `${ai.actual_ho_rsrp} dBm`],
                    ...(ai.proactive_headroom_db !== null
                        ? [["Headroom", `${ai.proactive_headroom_db > 0 ? "+" : ""}${ai.proactive_headroom_db.toFixed(1)} dB`]]
                        : []),
                ].map(([k, v]) => (_jsxs(_Fragment, { children: [_jsx(Typography, { sx: { fontSize: 10, color: "#64748b" }, children: k }, `k-${k}`), _jsx(Typography, { sx: { fontSize: 10, color: "#cbd5e1", fontWeight: 600 }, children: v }, `v-${k}`)] }))) })] }));
    return (_jsx(Tooltip, { title: tooltipContent, arrow: true, placement: "left", children: _jsxs(Stack, { direction: "column", spacing: 0.3, sx: { cursor: "help" }, children: [_jsxs("span", { style: {
                        fontSize: 10,
                        fontWeight: 700,
                        color,
                        background: bg,
                        border: `1px solid ${border}`,
                        borderRadius: 5,
                        padding: "1px 5px",
                        whiteSpace: "nowrap",
                    }, children: ["\uD83E\uDD16 ", label] }), _jsxs(Typography, { sx: { fontSize: 9, color: "#475569", lineHeight: 1 }, children: ["P=", ((ai.dso4_probability ?? 0) * 100).toFixed(0), "% \u00B7 ", ai.dso3_label ? ai.dso3_label.split("/")[0] : "—"] })] }) }));
}
export function HandoverHistoryPage() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const pollRef = useRef(undefined);
    const fetchEvents = useCallback(async () => {
        try {
            const { data } = await api.get("/operator/dataset-handovers");
            setEvents(Array.isArray(data) ? data : []);
        }
        catch {
            /* ignore */
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchEvents();
        pollRef.current = setInterval(fetchEvents, 2000);
        return () => clearInterval(pollRef.current);
    }, [fetchEvents]);
    // Unique devices from events
    const devices = Array.from(new Map(events.map((e) => [e.ue_id, { ue_id: e.ue_id, name: e.name, color: e.color }])).values());
    const filtered = filter === "all" ? events : events.filter((e) => e.ue_id === filter);
    // Stats
    const mobilityCount = events.filter((e) => e.reason === "mobility").length;
    const congestionCount = events.filter((e) => e.reason === "congestion").length;
    const avgGain = events.length > 0
        ? (events.reduce((s, e) => s + e.rsrp_gain, 0) / events.length).toFixed(1)
        : "0";
    // AI stats
    const aiProactive = events.filter((e) => e.ai_prediction?.recommended && (e.ai_prediction?.proactive_headroom_db ?? 0) > 0).length;
    const aiAligned = events.filter((e) => e.ai_prediction?.recommended && !((e.ai_prediction?.proactive_headroom_db ?? 0) > 0)).length;
    const headrooms = events
        .map((e) => e.ai_prediction?.proactive_headroom_db)
        .filter((h) => typeof h === "number" && h > 0);
    const avgHeadroom = headrooms.length > 0
        ? (headrooms.reduce((a, b) => a + b, 0) / headrooms.length).toFixed(1)
        : "—";
    return (_jsxs(Box, { sx: { display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", gap: 2 }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "flex-start", children: [_jsxs(Stack, { direction: "row", spacing: 1.5, alignItems: "center", children: [_jsx(HistoryRoundedIcon, { sx: { fontSize: 28, color: "#94a3b8" } }), _jsxs(Box, { children: [_jsx(Typography, { variant: "h5", sx: { fontWeight: 900, letterSpacing: -0.5, color: "#f1f5f9" }, children: "Tower Switch Log" }), _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", mt: 0.3 }, children: "Every cell handover with AI prediction analysis \u2014 traditional vs model-driven decision" })] })] }), _jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", sx: { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 2, px: 1.5, py: 0.75 }, children: [_jsx(Box, { sx: { width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", boxShadow: "0 0 6px #22c55e" } }), _jsx(Typography, { variant: "caption", sx: { fontWeight: 700, color: "#22c55e" }, children: "LIVE" })] })] }), _jsxs(Stack, { direction: "row", spacing: 1.5, children: [_jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }, children: [_jsx(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }, children: events.length }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "Total tower switches" })] }), _jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }, children: [_jsx(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#a855f7", lineHeight: 1 }, children: mobilityCount }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "Due to movement" })] }), _jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }, children: [_jsx(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }, children: congestionCount }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "Due to congestion" })] }), _jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }, children: [_jsxs(Typography, { sx: { fontSize: 24, fontWeight: 900, color: Number(avgGain) >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }, children: [Number(avgGain) > 0 ? "+" : "", avgGain, " dB"] }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "Avg signal change" })] }), _jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 3, p: "12px 16px" }, children: [_jsxs(Stack, { direction: "row", alignItems: "center", spacing: 0.5, children: [_jsx(PsychologyRoundedIcon, { sx: { fontSize: 16, color: "#22d3ee" } }), _jsx(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#22d3ee", lineHeight: 1 }, children: aiProactive })] }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "AI proactive switches" })] }), _jsxs(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 3, p: "12px 16px" }, children: [_jsxs(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#22c55e", lineHeight: 1 }, children: [avgHeadroom !== "—" ? `+${avgHeadroom}` : "—", avgHeadroom !== "—" ? " dB" : ""] }), _jsx(Typography, { sx: { fontSize: 11, color: "text.secondary", mt: 0.5 }, children: "Avg AI headroom vs reactive" })] })] }), _jsxs(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", children: [_jsx(Chip, { label: "All devices", onClick: () => setFilter("all"), sx: {
                            fontWeight: 700,
                            background: filter === "all" ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.07)",
                            color: "#e2e8f0",
                            border: filter === "all" ? "1px solid rgba(148,163,184,0.4)" : "1px solid rgba(148,163,184,0.1)",
                        } }), devices.map((d) => (_jsx(Chip, { label: `${SCENARIO_ICON[d.ue_id.includes("SM-S901") ? "hbahn" : d.ue_id.includes("RM500") ? "mobile" : "static"] ?? "📡"} ${d.name}`, onClick: () => setFilter(d.ue_id), sx: {
                            fontWeight: 700,
                            background: filter === d.ue_id ? `${d.color}22` : "rgba(255,255,255,0.05)",
                            color: filter === d.ue_id ? d.color : "#94a3b8",
                            border: filter === d.ue_id ? `1px solid ${d.color}55` : "1px solid rgba(255,255,255,0.07)",
                        } }, d.ue_id)))] }), _jsx(Card, { sx: {
                    flex: 1,
                    minHeight: 0,
                    background: "rgba(8,16,32,0.8)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 3,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                }, children: loading ? (_jsx(Box, { sx: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }, children: _jsx(CircularProgress, { size: 28 }) })) : filtered.length === 0 ? (_jsxs(Box, { sx: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 1 }, children: [_jsx(Typography, { sx: { color: "#334155", fontSize: 14 }, children: "No tower switches recorded yet" }), _jsx(Typography, { sx: { color: "#1e293b", fontSize: 12 }, children: "The dataset replayer is starting up \u2014 events will appear here shortly" })] })) : (_jsxs(Box, { sx: { flex: 1, overflowY: "auto", p: "0 4px" }, children: [_jsx(Box, { sx: {
                                display: "grid",
                                gridTemplateColumns: "80px 160px 130px 78px 78px 70px 62px 1fr",
                                px: 2,
                                py: 1,
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                                position: "sticky",
                                top: 0,
                                background: "rgba(8,16,32,0.95)",
                                zIndex: 1,
                            }, children: ["Time", "Device", "Tower switch", "Before", "After", "Change", "Reason", "AI Intel"].map((h) => (_jsx(Typography, { sx: { fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.8 }, children: h }, h))) }), filtered.map((ev, i) => {
                            const icon = SCENARIO_ICON[ev.scenario] ?? "📡";
                            const reasonColor = ev.reason === "mobility" ? "#a855f7" : "#f59e0b";
                            return (_jsxs(Box, { sx: {
                                    display: "grid",
                                    gridTemplateColumns: "80px 160px 130px 78px 78px 70px 62px 1fr",
                                    px: 2,
                                    py: "7px",
                                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                                    alignItems: "center",
                                    "&:hover": { background: "rgba(255,255,255,0.02)" },
                                }, children: [_jsx(Typography, { sx: { fontSize: 11, color: "#475569", fontFamily: "monospace" }, children: fmtTime(ev.timestamp) }), _jsxs(Stack, { direction: "row", spacing: 0.75, alignItems: "center", children: [_jsx(Box, { sx: { width: 8, height: 8, borderRadius: "50%", bgcolor: ev.color, boxShadow: `0 0 5px ${ev.color}`, flexShrink: 0 } }), _jsxs(Typography, { sx: { fontSize: 12, fontWeight: 700, color: "#cbd5e1" }, children: [icon, " ", ev.name] })] }), _jsxs(Typography, { sx: { fontSize: 12, fontWeight: 700, color: "#94a3b8" }, children: [_jsxs("span", { style: { color: "#64748b" }, children: ["#", ev.from_cell] }), _jsx("span", { style: { color: "#334155", margin: "0 5px" }, children: "\u2192" }), _jsxs("span", { style: { color: "#e2e8f0" }, children: ["#", ev.to_cell] })] }), _jsxs(Typography, { sx: { fontSize: 11, color: ev.rsrp_before >= -85 ? "#22c55e" : ev.rsrp_before >= -100 ? "#f59e0b" : "#ef4444" }, children: [ev.rsrp_before.toFixed(0), " dBm"] }), _jsxs(Typography, { sx: { fontSize: 11, color: ev.rsrp_after >= -85 ? "#22c55e" : ev.rsrp_after >= -100 ? "#f59e0b" : "#ef4444" }, children: [ev.rsrp_after.toFixed(0), " dBm"] }), _jsx(Box, { children: _jsx(GainBadge, { gain: ev.rsrp_gain }) }), _jsxs(Typography, { sx: { fontSize: 10, fontWeight: 700, color: reasonColor }, children: [ev.reason === "mobility" ? "Moving" : "Congest.", ev.reason === "mobility" && ev.velocity > 0 && (_jsxs("span", { style: { color: "#475569", fontWeight: 400, display: "block", fontSize: 9 }, children: [Math.round(ev.velocity), " km/h"] }))] }), _jsx(Box, { children: _jsx(AIBadge, { ai: ev.ai_prediction ?? null }) })] }, i));
                        })] })) }), events.some((e) => e.ai_prediction != null) && (_jsxs(Stack, { direction: "row", spacing: 2, sx: { px: 1, pb: 0.5 }, children: [_jsx(Typography, { sx: { fontSize: 10, color: "#334155" }, children: "AI Intel legend:" }), [
                        { color: "#22c55e", label: "Proactive — AI recommended before signal degraded (+ dB headroom vs traditional)" },
                        { color: "#22d3ee", label: "Aligned — AI agreed with the handover" },
                        { color: "#f59e0b", label: "No signal — AI said STAY, but traditional system still switched" },
                    ].map(({ color, label }) => (_jsxs(Stack, { direction: "row", spacing: 0.5, alignItems: "center", children: [_jsx(Box, { sx: { width: 8, height: 8, borderRadius: 1, bgcolor: color } }), _jsx(Typography, { sx: { fontSize: 10, color: "#475569" }, children: label })] }, label))), _jsx(Typography, { sx: { fontSize: 10, color: "#475569" }, children: "\u00B7 Hover AI badge for full model breakdown" })] }))] }));
}
