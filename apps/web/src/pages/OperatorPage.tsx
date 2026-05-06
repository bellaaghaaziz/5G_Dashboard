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

type HoPolicyComparison = {
  reactiveLegacyHoCount: number;
  predictiveHoCount: number;
  avgRsrpAtLegacyHoDbm: number | null;
  avgRsrpAtPredictiveHoDbm: number | null;
  signalHeadroomDb: number | null;
  legacyRsrpFloorDbm: number;
  predictiveWhileAboveLegacyFloor: number;
  narrative: string;
};

type Overview = {
  kpis: {
    recentPredictions15m: number;
    handoverRecommendationsLastHour: number;
    avgLatencyMs: number;
    highRiskPredictionsLastHour: number;
    hoSuccessRate: number;
  };
  hoPolicyComparison?: HoPolicyComparison;
  alerts: { id: string; severity: "high" | "medium"; message: string }[];
};

export function OperatorPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

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
  const pol = overview?.hoPolicyComparison;
  const alerts = overview?.alerts ?? [];

  const kpiCards = [
    { label: "Predictions (15m)", value: kpi?.recentPredictions15m ?? 0, gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)", icon: <SignalCellularAltRoundedIcon /> },
    { label: "Handover Recs (1h)", value: kpi?.handoverRecommendationsLastHour ?? 0, gradient: "linear-gradient(135deg,#a855f7,#6366f1)", icon: <CellTowerRoundedIcon /> },
    { label: "HO Success Rate", value: (kpi?.hoSuccessRate ?? 0) + "%", gradient: "linear-gradient(135deg,#10b981,#059669)", icon: <SignalCellularAltRoundedIcon /> },
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
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#a855f7" }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: "#a855f7" }}>REAL DATA</Typography>
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

      {pol && (pol.reactiveLegacyHoCount > 0 || pol.predictiveHoCount > 0) && (
        <Card sx={{ background: "linear-gradient(90deg, rgba(127,29,29,0.25), rgba(30,58,138,0.35))", border: "1px solid rgba(248,113,113,0.2)" }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "#fecaca", letterSpacing: 0.3 }}>
                  Predictive vs legacy (live sim)
                </Typography>
                <Typography variant="caption" sx={{ color: "#cbd5e1", display: "block", mt: 0.5, maxWidth: 720 }}>
                  {pol.narrative}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={`Legacy HO: ${pol.reactiveLegacyHoCount}`} sx={{ fontWeight: 700, color: "#fecaca", borderColor: "rgba(248,113,113,0.4)" }} variant="outlined" />
                <Chip size="small" label={`Predictive HO: ${pol.predictiveHoCount}`} sx={{ fontWeight: 700, color: "#67e8f9", borderColor: "rgba(34,211,238,0.4)" }} variant="outlined" />
                <Chip size="small" label={`RSRP legacy avg: ${pol.avgRsrpAtLegacyHoDbm ?? "—"} dBm`} sx={{ fontWeight: 600, color: "#e2e8f0" }} variant="outlined" />
                <Chip size="small" label={`RSRP predictive avg: ${pol.avgRsrpAtPredictiveHoDbm ?? "—"} dBm`} sx={{ fontWeight: 600, color: "#6ee7b7" }} variant="outlined" />
                <Chip size="small" label={`Headroom: ${pol.signalHeadroomDb != null ? `+${pol.signalHeadroomDb} dB` : "—"}`} sx={{ fontWeight: 800, color: "#fde047" }} variant="outlined" />
                <Chip size="small" label={`Proactive (above ${pol.legacyRsrpFloorDbm} dBm): ${pol.predictiveWhileAboveLegacyFloor}`} sx={{ fontWeight: 600, color: "#a5b4fc" }} variant="outlined" />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

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
