import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import BiotechRoundedIcon from "@mui/icons-material/BiotechRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Alert, Box, Button, Card, CardContent, Chip, Grid, LinearProgress, Stack, Typography, } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { api } from "../api/client";
const GLASS = {
    background: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 3,
};
function scoreColor(v) {
    if (v >= 0.85)
        return "#22c55e";
    if (v >= 0.7)
        return "#f59e0b";
    return "#ef4444";
}
function driftStatusColor(s) {
    if (s === "critical")
        return "#ef4444";
    if (s === "warning")
        return "#f59e0b";
    if (s === "stable")
        return "#22c55e";
    return "#94a3b8";
}
export function ScientistPage() {
    const [metrics, setMetrics] = useState(null);
    const [drift, setDrift] = useState(null);
    const [trainStatus, setTrainStatus] = useState(null);
    const [retraining, setRetraining] = useState(false);
    const trainPollRef = useRef(undefined);
    useEffect(() => {
        api.get("/scientist/metrics").then(r => setMetrics(r.data)).catch(() => { });
        api.get("/scientist/drift").then(r => setDrift(r.data)).catch(() => { });
        api.get("/scientist/retrain-status").then(r => setTrainStatus(r.data)).catch(() => { });
    }, []);
    // Drift auto-refresh
    useEffect(() => {
        const id = setInterval(() => {
            api.get("/scientist/drift").then(r => setDrift(r.data)).catch(() => { });
        }, 30000);
        return () => clearInterval(id);
    }, []);
    const startRetrain = async () => {
        setRetraining(true);
        try {
            await api.post("/scientist/retrain");
            // Poll for progress
            trainPollRef.current = setInterval(async () => {
                try {
                    const { data } = await api.get("/scientist/retrain-status");
                    setTrainStatus(data);
                    if (data.status === "completed" || data.status === "failed" || data.status === "idle") {
                        clearInterval(trainPollRef.current);
                        setRetraining(false);
                        // Refresh metrics
                        api.get("/scientist/metrics").then(r => setMetrics(r.data)).catch(() => { });
                    }
                }
                catch { }
            }, 2000);
        }
        catch {
            setRetraining(false);
        }
    };
    useEffect(() => () => clearInterval(trainPollRef.current), []);
    /* Metric cards */
    const metricCards = [
        { label: "DSO1 ROC AUC", desc: "Signal risk classifier", value: metrics?.dso1_roc_auc, icon: _jsx(BarChartRoundedIcon, {}), gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
        { label: "DSO4 ROC AUC", desc: "Handover decision", value: metrics?.dso4_roc_auc, icon: _jsx(ScienceRoundedIcon, {}), gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)" },
        { label: "DSO4 MCC", desc: "Matthews Correlation", value: metrics?.dso4_mcc, icon: _jsx(BiotechRoundedIcon, {}), gradient: "linear-gradient(135deg,#f59e0b,#ef4444)" },
        { label: "DSO4 Threshold", desc: "Calibrated boundary", value: metrics?.dso4_threshold, icon: _jsx(TuneRoundedIcon, {}), gradient: "linear-gradient(135deg,#22c55e,#16a34a)" },
    ];
    const chartData = [
        { name: "DSO1 AUC", value: metrics?.dso1_roc_auc ?? 0 },
        { name: "DSO1 MCC", value: metrics?.dso1_mcc ?? 0 },
        { name: "DSO4 AUC", value: metrics?.dso4_roc_auc ?? 0 },
        { name: "DSO4 MCC", value: metrics?.dso4_mcc ?? 0 },
        { name: "Threshold", value: metrics?.dso4_threshold ?? 0 },
    ];
    const chartColors = chartData.map(d => scoreColor(d.value));
    const driftFeatures = drift?.features ?? [];
    return (_jsxs(Box, { children: [_jsx(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", sx: { mb: 3 }, children: _jsxs(Box, { children: [_jsx(Typography, { variant: "h4", sx: { fontWeight: 800, letterSpacing: -0.5 }, children: "Intelligence Lab" }), _jsxs(Stack, { direction: "row", spacing: 1, sx: { mt: 1 }, children: [_jsx(Chip, { icon: _jsx(ScienceRoundedIcon, {}), label: metrics?.latestExperiment ?? "Loading…", color: "primary", size: "small", sx: { fontWeight: 700 } }), drift?.status && (_jsx(Chip, { label: `Drift: ${drift.status}`, size: "small", sx: { fontWeight: 700, bgcolor: `${driftStatusColor(drift.status)}22`, color: driftStatusColor(drift.status), border: `1px solid ${driftStatusColor(drift.status)}44` } }))] })] }) }), _jsx(Grid, { container: true, spacing: 2, sx: { mb: 3 }, children: metricCards.map(m => (_jsx(Grid, { size: { xs: 6, md: 3 }, children: _jsx(Card, { sx: { ...GLASS }, children: _jsxs(CardContent, { sx: { p: 2.5 }, children: [_jsx(Box, { sx: { width: 44, height: 44, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: m.gradient, color: "#fff", mb: 1.5, boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }, children: m.icon }), _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", fontWeight: 500, mb: 0.5 }, children: m.label }), _jsx(Typography, { variant: "h4", sx: { fontWeight: 800, color: m.value != null ? scoreColor(m.value) : "text.primary" }, children: m.value != null ? m.value.toFixed(4) : "--" }), _jsx(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: m.desc })] }) }) }, m.label))) }), _jsxs(Grid, { container: true, spacing: 2, sx: { mb: 3 }, children: [_jsx(Grid, { size: { xs: 12, md: 7 }, children: _jsx(Card, { sx: { ...GLASS }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsx(Typography, { variant: "h6", sx: { fontWeight: 700, mb: 2 }, children: "Model Performance" }), _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(BarChart, { data: chartData, barSize: 45, children: [_jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fill: "#94a3b8", fontSize: 11 } }), _jsx(YAxis, { domain: [0, 1], axisLine: false, tickLine: false, tick: { fill: "#94a3b8", fontSize: 11 } }), _jsx(Tooltip, { contentStyle: { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" } }), _jsx(Bar, { dataKey: "value", radius: [6, 6, 0, 0], children: chartData.map((_, i) => _jsx(Cell, { fill: chartColors[i] }, i)) })] }) })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 5 }, children: _jsx(Card, { sx: { ...GLASS, height: "100%" }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsx(Typography, { variant: "h6", sx: { fontWeight: 700, mb: 2 }, children: "Model Retraining" }), trainStatus?.status === "running" || retraining ? (_jsxs(Box, { children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", sx: { mb: 1 }, children: [_jsx(Typography, { variant: "body2", sx: { fontWeight: 600 }, children: trainStatus?.step ?? "Starting..." }), _jsxs(Typography, { variant: "body2", sx: { fontWeight: 700, color: "#22d3ee" }, children: [trainStatus?.progress ?? 0, "%"] })] }), _jsx(LinearProgress, { variant: "determinate", value: trainStatus?.progress ?? 0, sx: { height: 8, borderRadius: 4, bgcolor: "rgba(255,255,255,0.05)", "& .MuiLinearProgress-bar": { background: "linear-gradient(90deg,#22d3ee,#3b82f6)", borderRadius: 4 } } })] })) : trainStatus?.status === "completed" ? (_jsxs(Box, { children: [_jsx(Alert, { severity: "success", sx: { mb: 2, ...GLASS, color: "#86efac", ".MuiAlert-icon": { color: "#22c55e" } }, children: "Training completed successfully!" }), trainStatus.old_metrics && trainStatus.new_metrics && (_jsxs(Box, { children: [_jsx(Typography, { variant: "body2", sx: { fontWeight: 600, mb: 1 }, children: "Comparison" }), [
                                                        { l: "DSO1 AUC", o: trainStatus.old_metrics.dso1?.roc_auc, n: trainStatus.new_metrics.dso1?.roc_auc },
                                                        { l: "DSO4 AUC", o: trainStatus.old_metrics.dso4?.roc_auc, n: trainStatus.new_metrics.dso4?.roc_auc },
                                                        { l: "DSO4 MCC", o: trainStatus.old_metrics.dso4?.mcc, n: trainStatus.new_metrics.dso4?.mcc },
                                                    ].map(cmp => (_jsxs(Stack, { direction: "row", justifyContent: "space-between", sx: { p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)", mb: 0.5 }, children: [_jsx(Typography, { variant: "caption", sx: { fontWeight: 600 }, children: cmp.l }), _jsxs(Stack, { direction: "row", spacing: 1, children: [_jsx(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: cmp.o?.toFixed(4) ?? "—" }), _jsx(Typography, { variant: "caption", children: "\u2192" }), _jsx(Typography, { variant: "caption", sx: { fontWeight: 700, color: (cmp.n ?? 0) >= (cmp.o ?? 0) ? "#22c55e" : "#ef4444" }, children: cmp.n?.toFixed(4) ?? "—" })] })] }, cmp.l)))] })), _jsx(Button, { onClick: startRetrain, startIcon: _jsx(PlayArrowRoundedIcon, {}), variant: "outlined", size: "small", sx: { mt: 2, fontWeight: 700, borderColor: "rgba(34,211,238,0.3)", color: "#22d3ee" }, children: "Retrain Again" })] })) : (_jsxs(Box, { children: [_jsx(Typography, { variant: "body2", sx: { color: "text.secondary", mb: 2 }, children: "Retrain all DSO models using the current dataset. This will re-fit DSO1, DSO3, and DSO4, update metrics, and reload models in-place." }), _jsx(Stack, { spacing: 1, sx: { mb: 2 }, children: ["DSO3 — KMeans + LR Clustering", "DSO1 — XGBoost Signal Risk", "DSO4 — Calibrated XGBoost Handover"].map(s => (_jsx(Box, { sx: { p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)" }, children: _jsx(Typography, { variant: "caption", sx: { fontWeight: 600 }, children: s }) }, s))) }), _jsx(Button, { onClick: startRetrain, startIcon: _jsx(PlayArrowRoundedIcon, {}), variant: "contained", sx: { fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#3b82f6)", borderRadius: 2 }, children: "Start Retraining" })] }))] }) }) })] }), _jsx(Card, { sx: { ...GLASS }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", sx: { mb: 2 }, children: [_jsxs(Typography, { variant: "h6", sx: { fontWeight: 700 }, children: [_jsx(WarningAmberRoundedIcon, { sx: { verticalAlign: "middle", mr: 1, fontSize: 20 } }), "Data Drift Monitor"] }), _jsx(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: "Auto-refreshes every 30s" })] }), drift?.status === "no_baseline" ? (_jsx(Alert, { severity: "info", sx: { ...GLASS, color: "#93c5fd", ".MuiAlert-icon": { color: "#3b82f6" } }, children: "No drift baseline computed yet. Run training first to establish baselines." })) : driftFeatures.length === 0 ? (_jsxs(Typography, { variant: "body2", sx: { color: "text.secondary", textAlign: "center", py: 3 }, children: ["Waiting for prediction data to accumulate (", drift?.window_size ?? 0, " samples collected)..."] })) : (_jsx(Grid, { container: true, spacing: 1, children: driftFeatures.map((f) => (_jsx(Grid, { size: { xs: 6, md: 3 }, children: _jsxs(Box, { sx: { p: 1.5, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)", border: `1px solid ${driftStatusColor(f.status)}22` }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", sx: { mb: 0.5 }, children: [_jsx(Typography, { variant: "caption", sx: { fontWeight: 700, fontSize: 11 }, children: f.feature }), _jsx(Box, { sx: { width: 8, height: 8, borderRadius: "50%", bgcolor: driftStatusColor(f.status) } })] }), _jsxs(Typography, { variant: "body2", sx: { fontWeight: 800, color: driftStatusColor(f.status) }, children: ["PSI: ", f.psi?.toFixed(3) ?? "—"] }), _jsxs(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: ["Z-shift: ", f.z_shift?.toFixed(2) ?? "—", " | n=", f.window_size] })] }) }, f.feature))) }))] }) })] }));
}
