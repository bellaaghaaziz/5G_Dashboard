import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import CellTowerRoundedIcon from "@mui/icons-material/CellTowerRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Alert, Box, Button, ButtonGroup, Card, CardContent, Chip, IconButton, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { TunisiaMap } from "../components/TunisiaMap";
import { api } from "../api/client";
export function OperatorPage() {
    const [overview, setOverview] = useState(null);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const timerRef = useRef(undefined);
    const fetchOverview = useCallback(async () => {
        try {
            const { data } = await api.get("/operator/overview");
            setOverview(data);
        }
        catch { }
    }, []);
    useEffect(() => {
        fetchOverview();
        timerRef.current = setInterval(fetchOverview, 5000);
        return () => clearInterval(timerRef.current);
    }, [fetchOverview]);
    const togglePlay = async () => {
        const next = playing ? "paused" : "playing";
        try {
            await api.post("/operator/playback", { status: next });
        }
        catch { }
        setPlaying(!playing);
    };
    const changeSpeed = async (s) => {
        setSpeed(s);
        try {
            await api.post("/operator/playback", { speed: s });
        }
        catch { }
    };
    const kpi = overview?.kpis;
    const pol = overview?.hoPolicyComparison;
    const alerts = overview?.alerts ?? [];
    const kpiCards = [
        { label: "Predictions (15m)", value: kpi?.recentPredictions15m ?? 0, gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)", icon: _jsx(SignalCellularAltRoundedIcon, {}) },
        { label: "Handover Recs (1h)", value: kpi?.handoverRecommendationsLastHour ?? 0, gradient: "linear-gradient(135deg,#a855f7,#6366f1)", icon: _jsx(CellTowerRoundedIcon, {}) },
        { label: "HO Success Rate", value: (kpi?.hoSuccessRate ?? 0) + "%", gradient: "linear-gradient(135deg,#10b981,#059669)", icon: _jsx(SignalCellularAltRoundedIcon, {}) },
        { label: "Avg Latency (ms)", value: kpi?.avgLatencyMs?.toFixed(1) ?? "0", gradient: "linear-gradient(135deg,#f59e0b,#ef4444)", icon: _jsx(SpeedRoundedIcon, {}) },
        { label: "High Risk (1h)", value: kpi?.highRiskPredictionsLastHour ?? 0, gradient: "linear-gradient(135deg,#ef4444,#dc2626)", icon: _jsx(WarningAmberRoundedIcon, {}) },
    ];
    return (_jsxs(Box, { sx: { display: "flex", flexDirection: "column", gap: 2, height: "calc(100vh - 120px)" }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [_jsxs(Box, { children: [_jsx(Typography, { variant: "h4", sx: { fontWeight: 900, letterSpacing: -0.5 }, children: "Network Operations Center" }), _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", mt: 0.3 }, children: "Real-time AI handover intelligence \u00B7 Tunisia 5G Network" })] }), _jsxs(Stack, { direction: "row", spacing: 1.5, alignItems: "center", children: [_jsx(IconButton, { onClick: togglePlay, size: "small", sx: { bgcolor: "rgba(34,211,238,0.1)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)", "&:hover": { bgcolor: "rgba(34,211,238,0.2)" } }, children: playing ? _jsx(PauseRoundedIcon, { fontSize: "small" }) : _jsx(PlayArrowRoundedIcon, { fontSize: "small" }) }), _jsx(ButtonGroup, { size: "small", children: [0.5, 1, 2, 4].map(s => (_jsxs(Button, { onClick: () => changeSpeed(s), sx: {
                                        fontWeight: 700, fontSize: 12, px: 1.5,
                                        color: speed === s ? "#0f172a" : "#475569",
                                        bgcolor: speed === s ? "#22d3ee" : "transparent",
                                        borderColor: "rgba(148,163,184,0.15)",
                                        "&:hover": { bgcolor: speed === s ? "#22d3ee" : "rgba(255,255,255,0.05)" },
                                    }, children: [s, "x"] }, s))) }), _jsxs(Stack, { direction: "row", spacing: 0.5, alignItems: "center", children: [_jsx(Box, { sx: { width: 8, height: 8, borderRadius: "50%", bgcolor: "#22c55e", animation: "pulse 2s infinite", "@keyframes pulse": { "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.7)" }, "70%": { boxShadow: "0 0 0 6px rgba(34,197,94,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0)" } } } }), _jsx(Typography, { variant: "caption", sx: { fontWeight: 700, color: "#22c55e" }, children: "LIVE" })] })] })] }), _jsx(Stack, { direction: "row", spacing: 2, children: kpiCards.map(k => (_jsx(Card, { sx: { flex: 1, background: "rgba(13,27,46,0.8)", border: "1px solid rgba(255,255,255,0.06)" }, children: _jsxs(CardContent, { sx: { p: "14px !important", display: "flex", alignItems: "center", gap: 1.5 }, children: [_jsx(Box, { sx: { width: 36, height: 36, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", background: k.gradient, color: "#fff", flexShrink: 0 }, children: k.icon }), _jsxs(Box, { children: [_jsx(Typography, { variant: "h5", sx: { fontWeight: 900, lineHeight: 1 }, children: k.value }), _jsx(Typography, { variant: "caption", sx: { color: "text.secondary", fontSize: 11 }, children: k.label })] })] }) }, k.label))) }), pol && (pol.reactiveLegacyHoCount > 0 || pol.predictiveHoCount > 0) && (_jsx(Card, { sx: { background: "linear-gradient(90deg, rgba(127,29,29,0.25), rgba(30,58,138,0.35))", border: "1px solid rgba(248,113,113,0.2)" }, children: _jsx(CardContent, { sx: { py: 1.5, "&:last-child": { pb: 1.5 } }, children: _jsxs(Stack, { direction: { xs: "column", md: "row" }, spacing: 2, alignItems: { md: "center" }, justifyContent: "space-between", children: [_jsxs(Box, { children: [_jsx(Typography, { variant: "subtitle2", sx: { fontWeight: 800, color: "#fecaca", letterSpacing: 0.3 }, children: "Predictive vs legacy (live sim)" }), _jsx(Typography, { variant: "caption", sx: { color: "#cbd5e1", display: "block", mt: 0.5, maxWidth: 720 }, children: pol.narrative })] }), _jsxs(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", useFlexGap: true, children: [_jsx(Chip, { size: "small", label: `Legacy HO: ${pol.reactiveLegacyHoCount}`, sx: { fontWeight: 700, color: "#fecaca", borderColor: "rgba(248,113,113,0.4)" }, variant: "outlined" }), _jsx(Chip, { size: "small", label: `Predictive HO: ${pol.predictiveHoCount}`, sx: { fontWeight: 700, color: "#67e8f9", borderColor: "rgba(34,211,238,0.4)" }, variant: "outlined" }), _jsx(Chip, { size: "small", label: `RSRP legacy avg: ${pol.avgRsrpAtLegacyHoDbm ?? "—"} dBm`, sx: { fontWeight: 600, color: "#e2e8f0" }, variant: "outlined" }), _jsx(Chip, { size: "small", label: `RSRP predictive avg: ${pol.avgRsrpAtPredictiveHoDbm ?? "—"} dBm`, sx: { fontWeight: 600, color: "#6ee7b7" }, variant: "outlined" }), _jsx(Chip, { size: "small", label: `Headroom: ${pol.signalHeadroomDb != null ? `+${pol.signalHeadroomDb} dB` : "—"}`, sx: { fontWeight: 800, color: "#fde047" }, variant: "outlined" }), _jsx(Chip, { size: "small", label: `Proactive (above ${pol.legacyRsrpFloorDbm} dBm): ${pol.predictiveWhileAboveLegacyFloor}`, sx: { fontWeight: 600, color: "#a5b4fc" }, variant: "outlined" })] })] }) }) })), alerts.slice(0, 2).map(a => (_jsx(Alert, { severity: a.severity === "high" ? "error" : "warning", sx: { py: 0.5, background: "rgba(13,27,46,0.8)", border: `1px solid ${a.severity === "high" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}` }, children: a.message }, a.id))), _jsx(Box, { sx: { flex: 1, minHeight: 0 }, children: _jsx(TunisiaMap, {}) })] }));
}
