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

type Overview = {
  kpis: {
    recentPredictions15m: number;
    handoverRecommendationsLastHour: number;
    avgLatencyMs: number;
    highRiskPredictionsLastHour: number;
  };
  alerts: { id: string; severity: "high" | "medium"; message: string }[];
};

export function OperatorPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchOverview = useCallback(async () => {
    try {
      const { data } = await api.get("/operator/overview");
      setOverview(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOverview();
    timerRef.current = setInterval(fetchOverview, 5000);
    return () => clearInterval(timerRef.current);
  }, [fetchOverview]);

  const togglePlay = async () => {
    const next = playing ? "paused" : "playing";
    try { await api.post("/operator/playback", { status: next }); } catch {}
    setPlaying(!playing);
  };

  const changeSpeed = async (s: number) => {
    setSpeed(s);
    try { await api.post("/operator/playback", { speed: s }); } catch {}
  };

  const kpi = overview?.kpis;
  const alerts = overview?.alerts ?? [];

  const kpiCards = [
    { label: "Predictions (15m)", value: kpi?.recentPredictions15m ?? 0, gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)", icon: <SignalCellularAltRoundedIcon /> },
    { label: "Handover Recs (1h)", value: kpi?.handoverRecommendationsLastHour ?? 0, gradient: "linear-gradient(135deg,#a855f7,#6366f1)", icon: <CellTowerRoundedIcon /> },
    { label: "Avg Latency (ms)", value: kpi?.avgLatencyMs?.toFixed(1) ?? "0", gradient: "linear-gradient(135deg,#f59e0b,#ef4444)", icon: <SpeedRoundedIcon /> },
    { label: "High Risk (1h)", value: kpi?.highRiskPredictionsLastHour ?? 0, gradient: "linear-gradient(135deg,#ef4444,#dc2626)", icon: <WarningAmberRoundedIcon /> },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, height: "calc(100vh - 120px)" }}>
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.5 }}>Network Operations Center</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.3 }}>Real-time AI handover intelligence · Tunisia 5G Network</Typography>
        </Box>
        {/* Playback controls */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <IconButton onClick={togglePlay} size="small" sx={{ bgcolor: "rgba(34,211,238,0.1)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)", "&:hover": { bgcolor: "rgba(34,211,238,0.2)" } }}>
            {playing ? <PauseRoundedIcon fontSize="small" /> : <PlayArrowRoundedIcon fontSize="small" />}
          </IconButton>
          <ButtonGroup size="small">
            {[0.5, 1, 2, 4].map(s => (
              <Button key={s} onClick={() => changeSpeed(s)} sx={{
                fontWeight: 700, fontSize: 12, px: 1.5,
                color: speed === s ? "#0f172a" : "#475569",
                bgcolor: speed === s ? "#22d3ee" : "transparent",
                borderColor: "rgba(148,163,184,0.15)",
                "&:hover": { bgcolor: speed === s ? "#22d3ee" : "rgba(255,255,255,0.05)" },
              }}>{s}x</Button>
            ))}
          </ButtonGroup>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#22c55e", animation: "pulse 2s infinite", "@keyframes pulse": { "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.7)" }, "70%": { boxShadow: "0 0 0 6px rgba(34,197,94,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0)" } } }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#22c55e" }}>LIVE</Typography>
          </Stack>
        </Stack>
      </Stack>

      {/* KPI cards */}
      <Stack direction="row" spacing={2}>
        {kpiCards.map(k => (
          <Card key={k.label} sx={{ flex: 1, background: "rgba(13,27,46,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <CardContent sx={{ p: "14px !important", display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", background: k.gradient, color: "#fff", flexShrink: 0 }}>
                {k.icon}
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1 }}>{k.value}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>{k.label}</Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Alerts */}
      {alerts.slice(0, 2).map(a => (
        <Alert key={a.id} severity={a.severity === "high" ? "error" : "warning"} sx={{ py: 0.5, background: "rgba(13,27,46,0.8)", border: `1px solid ${a.severity === "high" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}` }}>
          {a.message}
        </Alert>
      ))}

      {/* Map — takes remaining height */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TunisiaMap />
      </Box>
    </Box>
  );
}
