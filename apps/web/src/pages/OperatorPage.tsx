import RouterRoundedIcon from "@mui/icons-material/RouterRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import TrafficRoundedIcon from "@mui/icons-material/TrafficRounded";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { TunisiaMap } from "../components/TunisiaMap";
import { useMapWebSocket } from "../api/useMapWebSocket";

function KpiCard({ label, sublabel, value, unit, icon, color }: {
  label: string; sublabel: string; value: string | number;
  unit?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3 }}>
      <CardContent sx={{ p: "14px !important" }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.8, mb: 0.4 }}>
              {label}
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={0.5}>
              <Typography sx={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: "#f1f5f9" }}>{value}</Typography>
              {unit && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{unit}</Typography>}
            </Stack>
            <Typography sx={{ fontSize: 10, color: "text.disabled", mt: 0.4 }}>{sublabel}</Typography>
          </Box>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}1a`, color, flexShrink: 0, mt: 0.5 }}>
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OperatorPage() {
  const { overview, mapState, towers, connected } = useMapWebSocket();

  const kpi = overview?.kpis;
  const gainPositive = (kpi?.avgRsrpGain ?? 0) >= 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: { xs: "auto", md: "calc(100vh - 112px)" } }}>

      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.5, color: "#f1f5f9", fontSize: { xs: 18, md: 24 } }}>
            Network Operations Center
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.2 }}>
            Real 5G measurements from the Ruhr region of Germany — streaming live via Kafka
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ background: connected ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", border: connected ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(245,158,11,0.25)", borderRadius: 2, px: 1.5, py: 0.75 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: connected ? "#22c55e" : "#f59e0b", boxShadow: connected ? "0 0 6px #22c55e" : "0 0 6px #f59e0b" }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: connected ? "#22c55e" : "#f59e0b" }}>{connected ? "LIVE" : "CONNECTING…"}</Typography>
        </Stack>
      </Stack>

      {/* KPI Cards — real data from dataset replay */}
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", "& > *": { minWidth: { xs: "calc(50% - 6px)", sm: 0 }, flex: 1 } }}>
        <KpiCard
          label="Tower Switches"
          sublabel="total handovers logged so far"
          value={kpi?.totalHandovers ?? 0}
          icon={<RouterRoundedIcon sx={{ fontSize: 18 }} />}
          color="#a855f7"
        />
        <KpiCard
          label="Moving"
          sublabel="switches while device in motion"
          value={kpi?.mobilityHandovers ?? 0}
          icon={<DirectionsCarRoundedIcon sx={{ fontSize: 18 }} />}
          color="#22d3ee"
        />
        <KpiCard
          label="Congestion"
          sublabel="switches due to tower overload"
          value={kpi?.congestionHandovers ?? 0}
          icon={<TrafficRoundedIcon sx={{ fontSize: 18 }} />}
          color="#f59e0b"
        />
        <KpiCard
          label="Avg Signal Change"
          sublabel="RSRP gain/loss per tower switch"
          value={`${gainPositive ? "+" : ""}${kpi?.avgRsrpGain ?? 0}`}
          unit="dB"
          icon={<SignalCellularAltRoundedIcon sx={{ fontSize: 18 }} />}
          color={gainPositive ? "#22c55e" : "#ef4444"}
        />
        <KpiCard
          label="AI Proactive Rate"
          sublabel={`${kpi?.aiProactiveCount ?? 0} switches caught early · avg +${kpi?.aiAvgHeadroomDb ?? 0} dB headroom`}
          value={kpi?.aiProactiveRate ?? 0}
          unit="%"
          icon={<PsychologyRoundedIcon sx={{ fontSize: 18 }} />}
          color="#22d3ee"
        />
      </Stack>

      {/* Map — fills all remaining space */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <TunisiaMap trips={mapState} towers={towers} connected={connected} />
      </Box>
    </Box>
  );
}
