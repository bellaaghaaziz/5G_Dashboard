import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import RouterRoundedIcon from "@mui/icons-material/RouterRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import TrafficRoundedIcon from "@mui/icons-material/TrafficRounded";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { TunisiaMap } from "../components/TunisiaMap";
import { api } from "../api/client";
function KpiCard({ label, sublabel, value, unit, icon, color }) {
    return (_jsx(Card, { sx: { flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3 }, children: _jsx(CardContent, { sx: { p: "14px !important" }, children: _jsxs(Stack, { direction: "row", alignItems: "flex-start", justifyContent: "space-between", children: [_jsxs(Box, { children: [_jsx(Typography, { sx: { fontSize: 10, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.8, mb: 0.4 }, children: label }), _jsxs(Stack, { direction: "row", alignItems: "baseline", spacing: 0.5, children: [_jsx(Typography, { sx: { fontSize: 26, fontWeight: 900, lineHeight: 1, color: "#f1f5f9" }, children: value }), unit && _jsx(Typography, { sx: { fontSize: 12, color: "text.secondary" }, children: unit })] }), _jsx(Typography, { sx: { fontSize: 10, color: "text.disabled", mt: 0.4 }, children: sublabel })] }), _jsx(Box, { sx: { width: 34, height: 34, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}1a`, color, flexShrink: 0, mt: 0.5 }, children: icon })] }) }) }));
}
export function OperatorPage() {
    const [overview, setOverview] = useState(null);
    const timerRef = useRef(undefined);
    const fetchOverview = useCallback(async () => {
        try {
            const { data } = await api.get("/operator/dataset-overview");
            setOverview(data);
        }
        catch { }
    }, []);
    useEffect(() => {
        fetchOverview();
        timerRef.current = setInterval(fetchOverview, 3000);
        return () => clearInterval(timerRef.current);
    }, [fetchOverview]);
    const kpi = overview?.kpis;
    const gainPositive = (kpi?.avgRsrpGain ?? 0) >= 0;
    return (_jsxs(Box, { sx: { display: "flex", flexDirection: "column", gap: 1.5, height: "calc(100vh - 112px)" }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [_jsxs(Box, { children: [_jsx(Typography, { variant: "h5", sx: { fontWeight: 900, letterSpacing: -0.5, color: "#f1f5f9" }, children: "Network Operations Center" }), _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", mt: 0.2 }, children: "Real 5G measurements from the Ruhr region of Germany \u2014 replaying at 30\u00D7 speed" })] }), _jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", sx: { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 2, px: 1.5, py: 0.75 }, children: [_jsx(Box, { sx: { width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", boxShadow: "0 0 6px #22c55e" } }), _jsx(Typography, { variant: "caption", sx: { fontWeight: 700, color: "#22c55e" }, children: "LIVE" })] })] }), _jsxs(Stack, { direction: "row", spacing: 1.5, children: [_jsx(KpiCard, { label: "Tower Switches", sublabel: "total handovers logged so far", value: kpi?.totalHandovers ?? 0, icon: _jsx(RouterRoundedIcon, { sx: { fontSize: 18 } }), color: "#a855f7" }), _jsx(KpiCard, { label: "Moving", sublabel: "switches while device in motion", value: kpi?.mobilityHandovers ?? 0, icon: _jsx(DirectionsCarRoundedIcon, { sx: { fontSize: 18 } }), color: "#22d3ee" }), _jsx(KpiCard, { label: "Congestion", sublabel: "switches due to tower overload", value: kpi?.congestionHandovers ?? 0, icon: _jsx(TrafficRoundedIcon, { sx: { fontSize: 18 } }), color: "#f59e0b" }), _jsx(KpiCard, { label: "Avg Signal Change", sublabel: "RSRP gain/loss per tower switch", value: `${gainPositive ? "+" : ""}${kpi?.avgRsrpGain ?? 0}`, unit: "dB", icon: _jsx(SignalCellularAltRoundedIcon, { sx: { fontSize: 18 } }), color: gainPositive ? "#22c55e" : "#ef4444" }), _jsx(KpiCard, { label: "AI Proactive Rate", sublabel: `${kpi?.aiProactiveCount ?? 0} switches caught early · avg +${kpi?.aiAvgHeadroomDb ?? 0} dB headroom`, value: kpi?.aiProactiveRate ?? 0, unit: "%", icon: _jsx(PsychologyRoundedIcon, { sx: { fontSize: 18 } }), color: "#22d3ee" })] }), _jsx(Box, { sx: { flex: 1, minHeight: 0 }, children: _jsx(TunisiaMap, {}) })] }));
}
