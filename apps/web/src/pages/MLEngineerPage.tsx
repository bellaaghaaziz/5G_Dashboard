import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";

const panel = {
  bgcolor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 2,
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
};

function statusColor(v?: string) {
  const s = String(v ?? "").toLowerCase();
  if (["ok", "healthy", "completed", "running", "stable", "passed"].includes(s)) return "#16a34a";
  if (["failed", "error", "critical"].includes(s)) return "#dc2626";
  if (["warning", "degraded", "unknown"].includes(s)) return "#d97706";
  return "#64748b";
}

function safeUrl(v?: string) {
  try {
    return v ? new URL(v).toString() : null;
  } catch {
    return null;
  }
}

function runReason(item: any) {
  if (item?.promotion_reason) return String(item.promotion_reason);
  if (item?.promoted === true) return "Promoted to Production stage.";
  if (item?.status === "failed") return item?.error || "Pipeline failed.";
  return "Run completed but not promoted.";
}

function driftSummary(drift: any) {
  if (!drift) return "Drift report not available yet.";
  const features = Array.isArray(drift?.features) ? drift.features : [];
  const critical = features.filter((f: any) => String(f?.status).toLowerCase() === "critical").length;
  const warning = features.filter((f: any) => String(f?.status).toLowerCase() === "warning").length;
  if (critical || warning) {
    return `${critical} critical and ${warning} warning drift features detected.`;
  }
  return drift?.summary || drift?.message || drift?.reason || "No drift anomalies detected in current window.";
}

export function MLEngineerPage() {
  const [health, setHealth] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [drift, setDrift] = useState<any>(null);
  const [trainStatus, setTrainStatus] = useState<any>(null);
  const [mlopsStatus, setMlopsStatus] = useState<any>(null);
  const [mlopsHistory, setMlopsHistory] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoRetrain, setAutoRetrain] = useState(false);

  const trainPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const fullPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const links = useMemo(
    () => ({
      mlflow: safeUrl(import.meta.env.VITE_MLFLOW_URL) || safeUrl("http://localhost:5000"),
      prometheus: safeUrl(import.meta.env.VITE_PROMETHEUS_URL) || safeUrl("http://localhost:9090"),
      grafana: safeUrl(import.meta.env.VITE_GRAFANA_URL) || safeUrl("http://localhost:3000"), // Default grafana port is 3000
      kubernetes: safeUrl("http://localhost:8001"), // typically k8s proxy
      apiDocs: safeUrl("http://localhost:8000/docs"),
    }),
    [],
  );

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
      if (h.status === "fulfilled") setHealth(h.value.data);
      if (m.status === "fulfilled") setMetrics(m.value.data);
      if (d.status === "fulfilled") setDrift(d.value.data);
      if (t.status === "fulfilled") setTrainStatus(t.value.data);
      if (ms.status === "fulfilled") setMlopsStatus(ms.value.data);
      if (mh.status === "fulfilled") setMlopsHistory(mh.value.data?.items ?? []);
      if (lg.status === "fulfilled") setRecentLogs(lg.value.data ?? []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshAll();
    const id = setInterval(() => {
      api.get("/mlops/status").then((r) => setMlopsStatus(r.data)).catch(() => {});
      api.get("/mlops/history").then((r) => setMlopsHistory(r.data?.items ?? [])).catch(() => {});
      api.get("/scientist/retrain-status").then((r) => setTrainStatus(r.data)).catch(() => {});
      api.get("/operator/map-events").then((r) => setRecentLogs(Array.isArray(r.data) ? r.data.slice(-400) : [])).catch(() => {});

      // Custom Drift Poller: if Auto Retrain is ON and drift is Critical, we run pipeline!
      api.get("/scientist/drift").then((r) => {
          setDrift(r.data);
          if (autoRetrain && r.data?.status?.toLowerCase() === "critical") {
              if (mlopsStatus?.state?.status !== "running" && !busy) {
                 runFullPipeline();
              }
          }
      }).catch(() => {});

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
    } catch {
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
    } catch {
      setBusy(false);
    }
  }

  const fullState = mlopsStatus?.state?.status ?? "unknown";
  const promoted = mlopsHistory.filter((x) => x?.promoted === true);
  const nonPromoted = mlopsHistory.filter((x) => x?.promoted !== true);
  const logTail = (mlopsStatus?.log_tail ?? []).slice(-80).join("\n");

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", px: { xs: 1, md: 2 }, py: 2 }}>
      <Card sx={panel}>
        <CardContent sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "start", md: "center" }} spacing={1}>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#0f172a" }}>MLOps Continuous Platform Console</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap" }}>
                <Chip size="small" icon={<AccountTreeRoundedIcon />} label="CellPilot v9" />
                <Chip size="small" label={`System: ${health?.overall ?? "healthy"}`} sx={{ color: statusColor(health?.overall ?? "healthy") }} />
                <Chip size="small" label={`Kubernetes: API Online`} sx={{ color: statusColor("healthy") }} />
                <Chip size="small" label={`Drift Tracker: ${drift?.status ?? "unknown"}`} sx={{ color: statusColor(drift?.status) }} />
                <Chip size="small" label={`ML Pipeline: ${fullState}`} sx={{ color: statusColor(fullState) }} />
              </Stack>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <FormControlLabel
                control={
                    <Switch checked={autoRetrain} onChange={(e) => setAutoRetrain(e.target.checked)} color="warning" />
                }
                label={<Typography sx={{ fontSize: 13, fontWeight: 700, color: autoRetrain ? "#d97706" : "#64748b" }}>Auto-Retrain on Drift</Typography>}
              />
              <Divider orientation="vertical" flexItem sx={{ height: 24, mx: 1 }} />
              <IconButton onClick={refreshAll} disabled={busy}><RefreshRoundedIcon /></IconButton>
              <Button variant="contained" onClick={runRetrain} disabled={busy} startIcon={<AutorenewIcon />} sx={{ fontWeight: 800 }}>Retrain Core Models</Button>
              <Button variant="outlined" onClick={runFullPipeline} disabled={busy || fullState === "running"} startIcon={<SettingsSuggestIcon/>} sx={{ fontWeight: 900 }}>Run E2E MLOps Pipeline</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        
        {/* DRIFT ALERT (Visible if data coming in changes a lot) */}
        {drift?.status?.toLowerCase() === "critical" || drift?.status?.toLowerCase() === "warning" ? (
          <Alert severity={drift.status.toLowerCase() === "critical" ? "error" : "warning"} icon={<WarningAmberRoundedIcon fontSize="inherit" />}>
            <b>🚨 Active Data Drift Detected from Live Map Telemetry! </b> 
            {driftSummary(drift)}
            <br />
            <Button size="small" variant="text" onClick={runRetrain} sx={{ mt: 1 }}>Trigger Model Retraining Now</Button>
          </Alert>
        ) : (
             <Alert severity="success" icon={<CheckCircleRoundedIcon fontSize="inherit" />}>
             <b>Live Data Drift Status: Good.</b> Map inference telemetry matches the AI training baseline perfectly. No retraining required.
           </Alert>
        )}

        <Card sx={panel}>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }}>
              Monitoring, Models & Infrastructure Links
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              {links.mlflow ? <Button component="a" href={links.mlflow} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined">MLflow (Models & Experiments)</Button> : null}
              {links.grafana ? <Button component="a" href={links.grafana} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined">Grafana Dashboard</Button> : null}
              {links.prometheus ? <Button component="a" href={links.prometheus} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined">Prometheus</Button> : null}
              {links.kubernetes ? <Button component="a" href={links.kubernetes} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined">Kubernetes (k8s)</Button> : null}
              {links.apiDocs ? <Button component="a" href={links.apiDocs} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />} variant="outlined">Inference API & Terrafrom State</Button> : null}
            </Stack>
          </CardContent>
        </Card>

        {/* LIVE INFERENCE DATA STREAM */}
        <Card sx={panel}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }}>
                Live Map Telemetry Monitor
              </Typography>
              <Typography sx={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                {recentLogs.length} recent predictions tracked
              </Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            <Box sx={{ maxHeight: 200, overflow: "auto" }}>
              <Stack spacing={0.5}>
                {recentLogs.length > 0 ? recentLogs.reverse().slice(0, 10).map((log: any, idx: number) => (
                  <Stack key={idx} direction="row" spacing={2} sx={{ py: 0.5, px: 1, borderBottom: "1px solid #f1f5f9", fontSize: 13, "&:hover": { bgcolor: "#f8fafc" } }}>
                    <Typography sx={{ width: 80, color: "#64748b" }}>{new Date(log?.timestamp || Date.now()).toLocaleTimeString()}</Typography>
                    <Typography sx={{ width: 140, fontWeight: 600, color: statusColor(log?.handover_recommended ? "warning" : "ok") }}>
                      {log?.handover_recommended ? "HANDOVER (1)" : "STAY (0)"}
                    </Typography>
                    <Typography sx={{ flex: 1, color: "#334155" }}>
                        Risk: {((log?.risk ?? log?.dso1_risk ?? 0) * 100).toFixed(1)}% | 
                        RSRP: {(log?.rsrp?.toFixed(1) ?? "-")} dBm |
                        Speed: {(log?.velocity?.toFixed(1) ?? "-")} m/s | 
                        Net State: {log?.cluster_label || "Cluster " + log?.cluster} 
                    </Typography>
                  </Stack>
                )) : <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No live operator data flowing yet. Start the physics simulator.</Typography>}
              </Stack>
            </Box>
          </CardContent>
        </Card>

        <Card sx={panel}>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }}>
              Data Drift Details
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              <Chip size="small" label={`Status: ${drift?.status ?? "unknown"}`} sx={{ color: statusColor(drift?.status) }} />
              <Typography sx={{ fontSize: 12, color: "#334155" }}>
                {driftSummary(drift)}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={panel}>
          <CardContent sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase", mb: 1 }}>
              Full Pipeline Live Log
            </Typography>
            {fullState === "running" ? <LinearProgress sx={{ mb: 1 }} /> : null}
            <Box sx={{ p: 1.25, bgcolor: "#0f172a", color: "#cbd5e1", borderRadius: 1.5, border: "1px solid #1e293b", maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "ui-monospace,Consolas,monospace", fontSize: 11 }}>
              {logTail || "No logs yet"}
            </Box>
          </CardContent>
        </Card>

        <Card sx={panel}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "start", md: "center" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.1, color: "#64748b", textTransform: "uppercase" }}>
                Model Promotion Decisions
              </Typography>
              <Typography sx={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>
                {promoted.length} promoted / {nonPromoted.length} non-promoted
              </Typography>
            </Stack>
            <Divider sx={{ my: 1.2 }} />
            <Stack spacing={1}>
              {mlopsHistory.slice(0, 16).map((r, i) => (
                <Box key={i} sx={{ border: "1px solid #e5e7eb", borderRadius: 1.5, p: 1.2 }}>
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip size="small" label={r?.promoted ? "Promoted" : "Not Promoted"} color={r?.promoted ? "success" : "default"} />
                      <Chip size="small" label={r?.status ?? "unknown"} sx={{ color: statusColor(r?.status) }} />
                      <Typography sx={{ fontSize: 12, color: "#334155", fontWeight: 800 }}>
                        {r?.model_name ?? "model"} {r?.model_version ? `v${r.model_version}` : ""}
                      </Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 11, color: "#64748b" }}>
                      exit {r?.exit_code ?? "—"}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: "#0f172a", mt: 0.8 }}>
                    <b>Why:</b> {runReason(r)}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "#64748b", mt: 0.3 }}>
                    Evidence: status={r?.status ?? "unknown"} | promoted={String(Boolean(r?.promoted))} | version={r?.model_version ?? "none"} | exit={r?.exit_code ?? "—"}
                  </Typography>
                </Box>
              ))}
              {mlopsHistory.length === 0 ? (
                <Alert severity="info">No runs yet. Click <b>Run Full MLOps</b>.</Alert>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        {trainStatus?.status === "failed" ? (
          <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
            Retrain failed. Check logs and then run full pipeline.
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
