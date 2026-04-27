import DeviceHubRoundedIcon from "@mui/icons-material/DeviceHubRounded";
import GppMaybeRoundedIcon from "@mui/icons-material/GppMaybeRounded";
import RadarRoundedIcon from "@mui/icons-material/RadarRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import { Alert, Box, Card, CardContent, Chip, Divider, Grid, Stack, Typography, LinearProgress, IconButton } from "@mui/material";
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { api } from "../api/client";

type OverviewResponse = {
  kpis: {
    recentPredictions15m: number;
    handoverRecommendationsLastHour: number;
    avgLatencyMs: number;
    highRiskPredictionsLastHour: number;
  };
  alerts: Array<{ id: string; severity: "high" | "medium"; message: string }>;
  source?: { type: string; path: string };
};

type MapEvent = {
  id: string;
  lat: number;
  lng: number;
  risk: number;
  recommended: boolean;
  timestamp?: string;
  hasGps?: boolean;
};

export function OperatorPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);

  useEffect(() => {
    api.get("/operator/overview").then((res: { data: OverviewResponse }) => setOverview(res.data));
    api.get("/operator/map-events").then((res: { data: MapEvent[] }) => setEvents(res.data));
  }, []);

  const chartData = events.map((event, idx) => ({
    name: `E${idx + 1}`,
    risk: Number((event.risk * 100).toFixed(2)),
  }));

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <Typography variant="h4">Network Operator Console</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Chip
            label={`Source: ${overview?.source?.type === "prediction_logs" ? "Real prediction logs" : "Unknown"}`}
            color="primary"
            variant="outlined"
            size="small"
          />
          {overview?.source?.path && <Chip label={overview.source.path} size="small" variant="outlined" />}
        </Stack>
      </Grid>

      {overview?.alerts?.map((a: any) => (
        <Grid size={{ xs: 12 }} key={a.id}>
          <Alert severity={a.severity === "high" ? "error" : "warning"}>{a.message}</Alert>
        </Grid>
      ))}

      <Grid size={{ xs: 12, md: 3 }}>
        <Card sx={{ p: 1 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: "rgba(255, 193, 7, 0.1)", color: "#FFC107" }}>
                <DeviceHubRoundedIcon />
              </Box>
              <IconButton size="small"><MoreHorizRoundedIcon fontSize="small" /></IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
              Predictions (15m)
            </Typography>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {overview?.kpis?.recentPredictions15m ?? "--"}
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ color: "success.main" }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>12%</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 3 }}>
        <Card sx={{ p: 1 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: "rgba(26, 26, 26, 0.05)", color: "#1a1a1a" }}>
                <RadarRoundedIcon />
              </Box>
              <IconButton size="small"><MoreHorizRoundedIcon fontSize="small" /></IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
              HO Recommendations
            </Typography>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {overview?.kpis?.handoverRecommendationsLastHour ?? "--"}
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ color: "error.main" }}>
                <TrendingDownRoundedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>5%</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 3 }}>
        <Card sx={{ p: 1 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: "rgba(33, 150, 243, 0.1)", color: "#2196f3" }}>
                <SpeedRoundedIcon />
              </Box>
              <IconButton size="small"><MoreHorizRoundedIcon fontSize="small" /></IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
              Avg Latency (ms)
            </Typography>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {overview?.kpis?.avgLatencyMs ?? "--"}
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ color: "success.main" }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>0.5ms</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 3 }}>
        <Card sx={{ p: 1 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box sx={{ p: 1, borderRadius: 1.5, backgroundColor: "rgba(244, 67, 54, 0.1)", color: "#f44336" }}>
                <GppMaybeRoundedIcon />
              </Box>
              <IconButton size="small"><MoreHorizRoundedIcon fontSize="small" /></IconButton>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
              High Risk Cases
            </Typography>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {overview?.kpis?.highRiskPredictionsLastHour ?? "--"}
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ color: "error.main" }}>
                <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>2%</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
              <Typography variant="h6">Risk Event Trend</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "primary.main" }} />
                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>Active Predictions</Typography>
              </Stack>
            </Stack>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC107" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#FFC107" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#999" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#999" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                />
                <Line
                  type="monotone"
                  dataKey="risk"
                  stroke="#FFC107"
                  strokeWidth={4}
                  dot={{ r: 4, fill: "#FFC107", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>Map Statistics</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              Envoy's visitor management dashboard displays your visitor data in real-time.
            </Typography>

            <Stack spacing={3}>
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Signal Stability</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>80%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={80} sx={{ height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.05)", "& .MuiLinearProgress-bar": { backgroundColor: "#4caf50" } }} />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Neighbor Availability</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>38%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={38} sx={{ height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.05)", "& .MuiLinearProgress-bar": { backgroundColor: "#f44336" } }} />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Capacity Margin</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>60%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={60} sx={{ height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.05)", "& .MuiLinearProgress-bar": { backgroundColor: "#2196f3" } }} />
              </Box>

              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Handover Success Rate</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>92%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={92} sx={{ height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.05)", "& .MuiLinearProgress-bar": { backgroundColor: "#FFC107" } }} />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card sx={{ p: 0, overflow: "hidden" }}>
          <Box sx={{ p: 3, borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
            <Typography variant="h6">Live Handover Map</Typography>
          </Box>
          <Box sx={{ height: 400 }}>
            <MapContainer center={[51.5, 7.44]} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {events.map((event) => (
                <Marker key={event.id} position={[event.lat, event.lng]}>
                  <Popup>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Event Info</Typography>
                    Risk: {(event.risk * 100).toFixed(1)}%<br />
                    Recommended: {event.recommended ? "Yes" : "No"}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </Box>
        </Card>
      </Grid>
    </Grid>
  );
}
