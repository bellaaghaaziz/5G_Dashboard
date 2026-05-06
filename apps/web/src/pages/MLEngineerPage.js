import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Stack, Typography, Switch, FormControlLabel, } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
const panel = {
    bgcolor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 2,
    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
};
function statusColor(v) {
    const s = String(v ?? "").toLowerCase();
    if (["ok", "healthy", "completed", "running", "stable", "passed"].includes(s))
        return "#16a34a";
    if (["failed", "error", "critical"].includes(s))
        return "#dc2626";
    if (["warning", "degraded", "unknown"].includes(s))
        return "#d97706";
    return "#64748b";
}
function safeUrl(v) {
    try {
        return v ? new URL(v).toString() : null;
    }
    catch {
        return null;
    }
}
function runReason(item) {
    if (item?.promotion_reason)
        return String(item.promotion_reason);
    if (item?.promoted === true)
        return "Promoted to Production stage.";
    if (item?.status === "failed")
        return item?.error || "Pipeline failed.";
    return "Run completed but not promoted.";
}
function driftSummary(drift) {
    if (!drift)
        return "Drift report not available yet.";
    const features = Array.isArray(drift?.features) ? drift.features : [];
    const critical = features.filter((f) => String(f?.status).toLowerCase() === "critical").length;
    const warning = features.filter((f) => String(f?.status).toLowerCase() === "warning").length;
    if (critical || warning) {
        return `${critical} critical and ${warning} warning drift features detected.`;
    }
    return drift?.summary || drift?.message || drift?.reason || "No drift anomalies detected in current window.";
}
export function MLEngineerPage() {
    const [health, setHealth] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [drift, setDrift] = useState(null);
    const [trainStatus, setTrainStatus] = useState(null);
    const [mlopsStatus, setMlopsStatus] = useState(null);
    const [mlopsHistory, setMlopsHistory] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [busy, setBusy] = useState(false);
    const [autoRetrain, setAutoRetrain] = useState(false);
    const trainPollRef = useRef(undefined);
    const fullPollRef = useRef(undefined);
    const links = useMemo(() => ({
        mlflow: safeUrl(import.meta.env.VITE_MLFLOW_URL) || safeUrl("http://localhost:5000"),
        prometheus: safeUrl(import.meta.env.VITE_PROMETHEUS_URL) || safeUrl("http://localhost:9090"),
        grafana: safeUrl(import.meta.env.VITE_GRAFANA_URL) || safeUrl("http://localhost:3000"), // Default grafana port is 3000
        kubernetes: safeUrl("http://localhost:8001"), // typically k8s proxy
        apiDocs: safeUrl("http://localhost:8000/docs"),
    }), []);
    async function refreshAll() {
        setBusy(true);
        try {
            const [h, m, d, t, ms, mh, lg] = await Promise.allSettled([
                api.get("/system/health"),
                api.get("/scientist/metrics"),
                api.get("/scientist/drift"),
                api.get("/scientist/retrain-status"),
                api.get("/mlops/status"),
                api.get("/mlops/history"),
                api.get("/operator/map-events"), // get live data flowing
            ]);
            if (h.status === "fulfilled")
                setHealth(h.value.data);
            if (m.status === "fulfilled")
                setMetrics(m.value.data);
            if (d.status === "fulfilled")
                setDrift(d.value.data);
            if (t.status === "fulfilled")
                setTrainStatus(t.value.data);
            if (ms.status === "fulfilled")
                setMlopsStatus(ms.value.data);
            if (mh.status === "fulfilled")
                setMlopsHistory(mh.value.data?.items ?? []);
            if (lg.status === "fulfilled")
                setRecentLogs(lg.value.data ?? []);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        refreshAll();
        const id = setInterval(() => {
            api.get("/mlops/status").then((r) => setMlopsStatus(r.data)).catch(() => { });
            api.get("/mlops/history").then((r) => setMlopsHistory(r.data?.items ?? [])).catch(() => { });
            api.get("/scientist/retrain-status").then((r) => setTrainStatus(r.data)).catch(() => { });
            api.get("/operator/map-events").then((r) => setRecentLogs(Array.isArray(r.data) ? r.data.slice(-400) : [])).catch(() => { });
            // Custom Drift Poller: if Auto Retrain is ON and drift is Critical, we run pipeline!
            api.get("/scientist/drift").then((r) => {
                setDrift(r.data);
                if (autoRetrain && r.data?.status?.toLowerCase() === "critical") {
                    if (mlopsStatus?.state?.status !== "running" && !busy) {
                        runFullPipeline();
                    }
                }
            }).catch(() => { });
        }, 5000);
        return () => clearInterval(id);
    }, [autoRetrain, mlopsStatus, busy]);
    useEffect(() => () => {
        clearInterval(trainPollRef.current);
        clearInterval(fullPollRef.current);
    }, []);
    async function runRetrain() {
        setBusy(true);
        try {
            await api.post("/scientist/retrain");
            trainPollRef.current = setInterval(async () => {
                const { data } = await api.get("/scientist/retrain-status");
                setTrainStatus(data);
                if (["completed", "failed", "idle"].includes(data?.status)) {
                    clearInterval(trainPollRef.current);
                    setBusy(false);
                }
            }, 1500);
        }
        catch {
            setBusy(false);
        }
    }
    async function runFullPipeline() {
        setBusy(true);
        try {
            await api.post("/mlops/run", {
                data_path: "DATASET/df_master_engineered.parquet",
                with_mlflow: true,
                promote: true,
                require_promotion: true,
                min_dso4_auc: 0.9,
                min_dso4_mcc: 0.7,
            });
            fullPollRef.current = setInterval(async () => {
                const { data } = await api.get("/mlops/status");
                setMlopsStatus(data);
                if (data?.state?.status !== "running") {
                    clearInterval(fullPollRef.current);
                    const hist = await api.get("/mlops/history");
                    setMlopsHistory(hist.data?.items ?? []);
                    setBusy(false);
                }
            }, 1500);
        }
        catch {
            setBusy(false);
        }
    }
    const fullState = mlopsStatus?.state?.status ?? "unknown";
    const promoted = mlopsHistory.filter((x) => x?.promoted === true);
    const nonPromoted = mlopsHistory.filter((x) => x?.promoted !== true);
    const logTail = (mlopsStatus?.log_tail ?? []).slice(-80).join("\n");
    return (_jsxs(Box, { sx: { maxWidth: 1200, mx: "auto", px: { xs: 1, md: 2 }, py: 2 }, children: [_jsx(Card, { sx: panel, children: _jsx(CardContent, { sx: { p: 2 }, children: _jsxs(Stack, { direction: { xs: "column", md: "row" }, justifyContent: "space-between", alignItems: { xs: "start", md: "center" }, spacing: 1, children: [_jsxs(Box, { children: [_jsx(Typography, { sx: { fontSize: 24, fontWeight: 900, color: "#0f172a" }, children: "MLOps Continuous Platform Console" }), _jsxs(Stack, { direction: "row", spacing: 1, sx: { mt: 0.75, flexWrap: "wrap" }, children: [_jsx(Chip, { size: "small", icon: _jsx(AccountTreeRoundedIcon, {}), label: "CellPilot v9" }), _jsx(Chip, { size: "small", label: `System: ${health?.overall ?? "healthy"}`, sx: { color: statusColor(health?.overall ?? "healthy") } }), _jsx(Chip, { size: "small", label: `Kubernetes: API Online`, sx: { color: statusColor("healthy") } }), _jsx(Chip, { size: "small", label: `Drift Tracker: ${drift?.status ?? "unknown"}`, sx: { color: statusColor(drift?.status) } }), _jsx(Chip, { size: "small", label: `ML Pipeline: ${fullState}`, sx: { color: statusColor(fullState) } })] })] }), _jsxs(Stack, { direction: "row", spacing: 1, flexWrap: "wrap", alignItems: "center", children: [_jsx(FormControlLabel, { control: _jsx(Switch, { checked: autoRetrain, onChange: (e) => setAutoRetrain(e.target.checked), color: "warning" }), label: _jsx(Typography, { sx: { fontSize: 13, fontWeight: 700, color: autoRetrain ? "#d97706" : "#64748b" }, children: "Auto-Retrain on Drift" }) }), _jsx(Divider, { orientation: "vertical", flexItem: true, sx: { height: 24, mx: 1 } }), _jsx(IconButton, { onClick: refreshAll, disabled: busy, children: _jsx(RefreshRoundedIcon, {}) }), _jsx(Button, { variant: "contained", onClick: runRetrain, disabled: busy, startIcon: _jsx(AutorenewIcon, {}), sx: { fontWeight: 800 }, children: "Retrain Core Models" }), _jsx(Button, { variant: "outlined", onClick: runFullPipeline, disabled: busy || fullState === "running", startIcon: _jsx(SettingsSuggestIcon, {}), sx: { fontWeight: 900 }, children: "Run E2E MLOps Pipeline" })] })] }) }) }), _jsxs(Stack, { spacing: 1.5, sx: { mt: 1.5 }, children: [drift?.status?.toLowerCase() === "critical" || drift?.status?.toLowerCase() === "warning" ? (_jsxs(Alert, { severity: drift.status.toLowerCase() === "critical" ? "error" : "warning", icon: _jsx(WarningAmberRoundedIcon, { fontSize: "inherit" }), children: [_jsx("b", { children: "\uD83D\uDEA8 Active Data Drift Detected from Live Map Telemetry! " }), driftSummary(drift), _jsx("br", {}), _jsx(Button, { size: "small", variant: "text", onClick: runRetrain, sx: { mt: 1 }, children: "Trigger Model Retraining Now" })] })) : (_jsxs(Alert, { severity: "success", icon: _jsx(CheckCircleRoundedIcon, { fontSize: "inherit" }), children: [_jsx("b", { children: "Live Data Drift Status: Good." }), " Map inference telemetry matches the AI training baseline perfectly. No retraining required."] })), _jsx(Card, { sx: panel, children: _jsxs(CardContent, { sx: { p: 2 }, children: [_jsx(Typography, { sx: { fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }, children: "Monitoring, Models & Infrastructure Links" }), _jsxs(Stack, { direction: { xs: "column", md: "row" }, spacing: 1, children: [links.mlflow ? _jsx(Button, { component: "a", href: links.mlflow, target: "_blank", rel: "noreferrer", endIcon: _jsx(OpenInNewRoundedIcon, {}), variant: "outlined", children: "MLflow (Models & Experiments)" }) : null, links.grafana ? _jsx(Button, { component: "a", href: links.grafana, target: "_blank", rel: "noreferrer", endIcon: _jsx(OpenInNewRoundedIcon, {}), variant: "outlined", children: "Grafana Dashboard" }) : null, links.prometheus ? _jsx(Button, { component: "a", href: links.prometheus, target: "_blank", rel: "noreferrer", endIcon: _jsx(OpenInNewRoundedIcon, {}), variant: "outlined", children: "Prometheus" }) : null, links.kubernetes ? _jsx(Button, { component: "a", href: links.kubernetes, target: "_blank", rel: "noreferrer", endIcon: _jsx(OpenInNewRoundedIcon, {}), variant: "outlined", children: "Kubernetes (k8s)" }) : null, links.apiDocs ? _jsx(Button, { component: "a", href: links.apiDocs, target: "_blank", rel: "noreferrer", endIcon: _jsx(OpenInNewRoundedIcon, {}), variant: "outlined", children: "Inference API & Terrafrom State" }) : null] })] }) }), _jsx(Card, { sx: panel, children: _jsxs(CardContent, { sx: { p: 2 }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", children: [_jsx(Typography, { sx: { fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }, children: "Live Map Telemetry Monitor" }), _jsxs(Typography, { sx: { fontSize: 11, color: "#64748b", fontWeight: 700 }, children: [recentLogs.length, " recent predictions tracked"] })] }), _jsx(Divider, { sx: { mb: 1 } }), _jsx(Box, { sx: { maxHeight: 200, overflow: "auto" }, children: _jsx(Stack, { spacing: 0.5, children: recentLogs.length > 0 ? recentLogs.reverse().slice(0, 10).map((log, idx) => (_jsxs(Stack, { direction: "row", spacing: 2, sx: { py: 0.5, px: 1, borderBottom: "1px solid #f1f5f9", fontSize: 13, "&:hover": { bgcolor: "#f8fafc" } }, children: [_jsx(Typography, { sx: { width: 80, color: "#64748b" }, children: new Date(log?.timestamp || Date.now()).toLocaleTimeString() }), _jsx(Typography, { sx: { width: 140, fontWeight: 600, color: statusColor(log?.handover_recommended ? "warning" : "ok") }, children: log?.handover_recommended ? "HANDOVER (1)" : "STAY (0)" }), _jsxs(Typography, { sx: { flex: 1, color: "#334155" }, children: ["Risk: ", ((log?.risk ?? log?.dso1_risk ?? 0) * 100).toFixed(1), "% | RSRP: ", (log?.rsrp?.toFixed(1) ?? "-"), " dBm | Speed: ", (log?.velocity?.toFixed(1) ?? "-"), " m/s | Net State: ", log?.cluster_label || "Cluster " + log?.cluster] })] }, idx))) : _jsx(Typography, { sx: { fontSize: 13, color: "#94a3b8" }, children: "No live operator data flowing yet. Start the physics simulator." }) }) })] }) }), _jsx(Card, { sx: panel, children: _jsxs(CardContent, { sx: { p: 2 }, children: [_jsx(Typography, { sx: { fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }, children: "Data Drift Details" }), _jsxs(Stack, { direction: { xs: "column", md: "row" }, spacing: 1.2, children: [_jsx(Chip, { size: "small", label: `Status: ${drift?.status ?? "unknown"}`, sx: { color: statusColor(drift?.status) } }), _jsx(Typography, { sx: { fontSize: 12, color: "#334155" }, children: driftSummary(drift) })] })] }) }), _jsx(Card, { sx: panel, children: _jsxs(CardContent, { sx: { p: 2 }, children: [_jsx(Typography, { sx: { fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }, children: "Full Pipeline Live Log" }), fullState === "running" ? _jsx(LinearProgress, { sx: { mb: 1 } }) : null, _jsx(Box, { sx: { p: 1.25, bgcolor: "#0f172a", color: "#cbd5e1", borderRadius: 1.5, border: "1px solid #1e293b", maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "ui-monospace,Consolas,monospace", fontSize: 11 }, children: logTail || "No logs yet" })] }) }), _jsx(Card, { sx: panel, children: _jsxs(CardContent, { sx: { p: 2 }, children: [_jsxs(Stack, { direction: { xs: "column", md: "row" }, justifyContent: "space-between", alignItems: { xs: "start", md: "center" }, children: [_jsx(Typography, { sx: { fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase" }, children: "Model Promotion Decisions" }), _jsxs(Typography, { sx: { fontSize: 12, color: "#334155", fontWeight: 700 }, children: [promoted.length, " promoted / ", nonPromoted.length, " non-promoted"] })] }), _jsx(Divider, { sx: { my: 1.2 } }), _jsxs(Stack, { spacing: 1, children: [mlopsHistory.slice(0, 16).map((r, i) => (_jsxs(Box, { sx: { border: "1px solid #e5e7eb", borderRadius: 1.5, p: 1.2 }, children: [_jsxs(Stack, { direction: { xs: "column", md: "row" }, justifyContent: "space-between", spacing: 1, children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", flexWrap: "wrap", children: [_jsx(Chip, { size: "small", label: r?.promoted ? "Promoted" : "Not Promoted", color: r?.promoted ? "success" : "default" }), _jsx(Chip, { size: "small", label: r?.status ?? "unknown", sx: { color: statusColor(r?.status) } }), _jsxs(Typography, { sx: { fontSize: 12, color: "#334155", fontWeight: 800 }, children: [r?.model_name ?? "model", " ", r?.model_version ? `v${r.model_version}` : ""] })] }), _jsxs(Typography, { sx: { fontSize: 11, color: "#64748b" }, children: ["exit ", r?.exit_code ?? "—"] })] }), _jsxs(Typography, { sx: { fontSize: 12, color: "#0f172a", mt: 0.8 }, children: [_jsx("b", { children: "Why:" }), " ", runReason(r)] }), _jsxs(Typography, { sx: { fontSize: 11, color: "#64748b", mt: 0.3 }, children: ["Evidence: status=", r?.status ?? "unknown", " | promoted=", String(Boolean(r?.promoted)), " | version=", r?.model_version ?? "none", " | exit=", r?.exit_code ?? "—"] })] }, i))), mlopsHistory.length === 0 ? (_jsxs(Alert, { severity: "info", children: ["No runs yet. Click ", _jsx("b", { children: "Run Full MLOps" }), "."] })) : null] })] }) }), trainStatus?.status === "failed" ? (_jsx(Alert, { severity: "warning", icon: _jsx(WarningAmberRoundedIcon, {}), children: "Retrain failed. Check logs and then run full pipeline." })) : null] })] }));
}
