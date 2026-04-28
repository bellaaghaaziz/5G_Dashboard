import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import BiotechRoundedIcon from "@mui/icons-material/BiotechRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert, Box, Button, Card, CardContent, Chip, Grid,
  LinearProgress, Stack, Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api/client";

const GLASS = {
  background: "rgba(15, 23, 42, 0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 3,
};

function scoreColor(v: number): string {
  if (v >= 0.85) return "#22c55e";
  if (v >= 0.7) return "#f59e0b";
  return "#ef4444";
}

function driftStatusColor(s: string) {
  if (s === "critical") return "#ef4444";
  if (s === "warning") return "#f59e0b";
  if (s === "stable") return "#22c55e";
  return "#94a3b8";
}

export function ScientistPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [drift, setDrift] = useState<any>(null);
  const [trainStatus, setTrainStatus] = useState<any>(null);
  const [retraining, setRetraining] = useState(false);
  const trainPollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    api.get("/scientist/metrics").then(r => setMetrics(r.data)).catch(() => {});
    api.get("/scientist/drift").then(r => setDrift(r.data)).catch(() => {});
    api.get("/scientist/retrain-status").then(r => setTrainStatus(r.data)).catch(() => {});
  }, []);

  // Drift auto-refresh
  useEffect(() => {
    const id = setInterval(() => {
      api.get("/scientist/drift").then(r => setDrift(r.data)).catch(() => {});
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
            api.get("/scientist/metrics").then(r => setMetrics(r.data)).catch(() => {});
          }
        } catch {}
      }, 2000);
    } catch {
      setRetraining(false);
    }
  };

  useEffect(() => () => clearInterval(trainPollRef.current), []);

  /* Metric cards */
  const metricCards = [
    { label: "DSO1 ROC AUC", desc: "Signal risk classifier", value: metrics?.dso1_roc_auc, icon: <BarChartRoundedIcon />, gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
    { label: "DSO4 ROC AUC", desc: "Handover decision", value: metrics?.dso4_roc_auc, icon: <ScienceRoundedIcon />, gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)" },
    { label: "DSO4 MCC", desc: "Matthews Correlation", value: metrics?.dso4_mcc, icon: <BiotechRoundedIcon />, gradient: "linear-gradient(135deg,#f59e0b,#ef4444)" },
    { label: "DSO4 Threshold", desc: "Calibrated boundary", value: metrics?.dso4_threshold, icon: <TuneRoundedIcon />, gradient: "linear-gradient(135deg,#22c55e,#16a34a)" },
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

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>Intelligence Lab</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip icon={<ScienceRoundedIcon />} label={metrics?.latestExperiment ?? "Loading…"} color="primary" size="small" sx={{ fontWeight: 700 }} />
            {drift?.status && (
              <Chip label={`Drift: ${drift.status}`} size="small" sx={{ fontWeight: 700, bgcolor: `${driftStatusColor(drift.status)}22`, color: driftStatusColor(drift.status), border: `1px solid ${driftStatusColor(drift.status)}44` }} />
            )}
          </Stack>
        </Box>
      </Stack>

      {/* Metric Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {metricCards.map(m => (
          <Grid size={{ xs: 6, md: 3 }} key={m.label}>
            <Card sx={{ ...GLASS }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: m.gradient, color: "#fff", mb: 1.5, boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>
                  {m.icon}
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500, mb: 0.5 }}>{m.label}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: m.value != null ? scoreColor(m.value) : "text.primary" }}>
                  {m.value != null ? m.value.toFixed(4) : "--"}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>{m.desc}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Row 2: Chart + Retrain */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ ...GLASS }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Model Performance</Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barSize={45}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis domain={[0, 1]} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={chartColors[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Retrain Panel */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ ...GLASS, height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Model Retraining</Typography>
              {trainStatus?.status === "running" || retraining ? (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{trainStatus?.step ?? "Starting..."}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: "#22d3ee" }}>{trainStatus?.progress ?? 0}%</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={trainStatus?.progress ?? 0} sx={{ height: 8, borderRadius: 4, bgcolor: "rgba(255,255,255,0.05)", "& .MuiLinearProgress-bar": { background: "linear-gradient(90deg,#22d3ee,#3b82f6)", borderRadius: 4 } }} />
                </Box>
              ) : trainStatus?.status === "completed" ? (
                <Box>
                  <Alert severity="success" sx={{ mb: 2, ...GLASS, color: "#86efac", ".MuiAlert-icon": { color: "#22c55e" } }}>
                    Training completed successfully!
                  </Alert>
                  {trainStatus.old_metrics && trainStatus.new_metrics && (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Comparison</Typography>
                      {[
                        { l: "DSO1 AUC", o: trainStatus.old_metrics.dso1?.roc_auc, n: trainStatus.new_metrics.dso1?.roc_auc },
                        { l: "DSO4 AUC", o: trainStatus.old_metrics.dso4?.roc_auc, n: trainStatus.new_metrics.dso4?.roc_auc },
                        { l: "DSO4 MCC", o: trainStatus.old_metrics.dso4?.mcc, n: trainStatus.new_metrics.dso4?.mcc },
                      ].map(cmp => (
                        <Stack key={cmp.l} direction="row" justifyContent="space-between" sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)", mb: 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>{cmp.l}</Typography>
                          <Stack direction="row" spacing={1}>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>{cmp.o?.toFixed(4) ?? "—"}</Typography>
                            <Typography variant="caption">→</Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: (cmp.n ?? 0) >= (cmp.o ?? 0) ? "#22c55e" : "#ef4444" }}>{cmp.n?.toFixed(4) ?? "—"}</Typography>
                          </Stack>
                        </Stack>
                      ))}
                    </Box>
                  )}
                  <Button onClick={startRetrain} startIcon={<PlayArrowRoundedIcon />} variant="outlined" size="small" sx={{ mt: 2, fontWeight: 700, borderColor: "rgba(34,211,238,0.3)", color: "#22d3ee" }}>
                    Retrain Again
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                    Retrain all DSO models using the current dataset. This will re-fit DSO1, DSO3, and DSO4, update metrics, and reload models in-place.
                  </Typography>
                  <Stack spacing={1} sx={{ mb: 2 }}>
                    {["DSO3 — KMeans + LR Clustering", "DSO1 — XGBoost Signal Risk", "DSO4 — Calibrated XGBoost Handover"].map(s => (
                      <Box key={s} sx={{ p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>{s}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Button onClick={startRetrain} startIcon={<PlayArrowRoundedIcon />} variant="contained" sx={{ fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#3b82f6)", borderRadius: 2 }}>
                    Start Retraining
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Drift Monitor */}
      <Card sx={{ ...GLASS }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <WarningAmberRoundedIcon sx={{ verticalAlign: "middle", mr: 1, fontSize: 20 }} />
              Data Drift Monitor
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>Auto-refreshes every 30s</Typography>
          </Stack>
          {drift?.status === "no_baseline" ? (
            <Alert severity="info" sx={{ ...GLASS, color: "#93c5fd", ".MuiAlert-icon": { color: "#3b82f6" } }}>
              No drift baseline computed yet. Run training first to establish baselines.
            </Alert>
          ) : driftFeatures.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 3 }}>
              Waiting for prediction data to accumulate ({drift?.window_size ?? 0} samples collected)...
            </Typography>
          ) : (
            <Grid container spacing={1}>
              {driftFeatures.map((f: any) => (
                <Grid size={{ xs: 6, md: 3 }} key={f.feature}>
                  <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)", border: `1px solid ${driftStatusColor(f.status)}22` }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{f.feature}</Typography>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: driftStatusColor(f.status) }} />
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: driftStatusColor(f.status) }}>
                      PSI: {f.psi?.toFixed(3) ?? "—"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Z-shift: {f.z_shift?.toFixed(2) ?? "—"} | n={f.window_size}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
