import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import { Box, Card, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type AIPrediction = {
  recommended: boolean;
  ai_rsrp: number;
  actual_ho_rsrp: number;
  proactive_headroom_db: number | null;
  dso4_probability: number;
  dso1_risk_score: number;
  dso3_cluster: number;
  dso3_label: string;
};

type HOEvent = {
  ue_id: string;
  name: string;
  color: string;
  timestamp: string;
  from_cell: number;
  to_cell: number;
  rsrp_before: number;
  rsrp_after: number;
  rsrp_gain: number;
  velocity: number;
  reason: "mobility" | "congestion";
  scenario: string;
  lat: number;
  lng: number;
  ai_prediction: AIPrediction | null;
};

const SCENARIO_ICON: Record<string, string> = {
  hbahn: "🚋",
  mobile: "📱",
  static: "🏢",
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function GainBadge({ gain }: { gain: number }) {
  const positive = gain > 0;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: positive ? "#22c55e" : "#ef4444",
        background: positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        border: `1px solid ${positive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {positive ? "+" : ""}{gain.toFixed(1)} dB
    </span>
  );
}

function AIBadge({ ai }: { ai: AIPrediction | null }) {
  if (!ai) {
    return <span style={{ fontSize: 10, color: "#334155" }}>—</span>;
  }

  const isProactive = ai.recommended && ai.proactive_headroom_db !== null && ai.proactive_headroom_db > 0;
  const isAligned   = ai.recommended && !isProactive;
  const isReactive  = !ai.recommended;

  const color  = isProactive ? "#22c55e" : isAligned ? "#22d3ee" : "#f59e0b";
  const bg     = isProactive ? "rgba(34,197,94,0.1)" : isAligned ? "rgba(34,211,238,0.1)" : "rgba(245,158,11,0.1)";
  const border = isProactive ? "rgba(34,197,94,0.3)" : isAligned ? "rgba(34,211,238,0.3)" : "rgba(245,158,11,0.3)";

  const label = isProactive
    ? `+${ai.proactive_headroom_db!.toFixed(1)} dB early`
    : isAligned
    ? "Aligned"
    : "No signal";

  const tooltipContent = (
    <Box sx={{ p: 0.5, minWidth: 200 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#f1f5f9", mb: 0.5 }}>
        AI Decision Analysis
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" }}>
        {[
          ["DSO3 Profile", ai.dso3_label || `Cluster ${ai.dso3_cluster}`],
          ["DSO4 Prob", `${(ai.dso4_probability * 100).toFixed(1)}%`],
          ["Risk Score", `${(ai.dso1_risk_score * 100).toFixed(1)}%`],
          ["AI at RSRP", `${ai.ai_rsrp} dBm`],
          ["HO at RSRP", `${ai.actual_ho_rsrp} dBm`],
          ...(ai.proactive_headroom_db !== null
            ? [["Headroom", `${ai.proactive_headroom_db > 0 ? "+" : ""}${ai.proactive_headroom_db.toFixed(1)} dB`]]
            : []),
        ].map(([k, v]) => (
          <>
            <Typography key={`k-${k}`} sx={{ fontSize: 10, color: "#64748b" }}>{k}</Typography>
            <Typography key={`v-${k}`} sx={{ fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>{v}</Typography>
          </>
        ))}
      </Box>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="left">
      <Stack direction="column" spacing={0.3} sx={{ cursor: "help" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 5,
            padding: "1px 5px",
            whiteSpace: "nowrap",
          }}
        >
          🤖 {label}
        </span>
        <Typography sx={{ fontSize: 9, color: "#475569", lineHeight: 1 }}>
          P={((ai.dso4_probability ?? 0) * 100).toFixed(0)}% · {ai.dso3_label ? ai.dso3_label.split("/")[0] : "—"}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

export function HandoverHistoryPage() {
  const [events, setEvents] = useState<HOEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get<HOEvent[]>("/operator/dataset-handovers");
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchEvents]);

  // Unique devices from events
  const devices = Array.from(
    new Map(events.map((e) => [e.ue_id, { ue_id: e.ue_id, name: e.name, color: e.color }])).values(),
  );

  const filtered = filter === "all" ? events : events.filter((e) => e.ue_id === filter);

  // Stats
  const mobilityCount   = events.filter((e) => e.reason === "mobility").length;
  const congestionCount = events.filter((e) => e.reason === "congestion").length;
  const avgGain =
    events.length > 0
      ? (events.reduce((s, e) => s + e.rsrp_gain, 0) / events.length).toFixed(1)
      : "0";

  // AI stats
  const aiProactive  = events.filter(
    (e) => e.ai_prediction?.recommended && (e.ai_prediction?.proactive_headroom_db ?? 0) > 0,
  ).length;
  const aiAligned    = events.filter(
    (e) => e.ai_prediction?.recommended && !((e.ai_prediction?.proactive_headroom_db ?? 0) > 0),
  ).length;
  const headrooms    = events
    .map((e) => e.ai_prediction?.proactive_headroom_db)
    .filter((h): h is number => typeof h === "number" && h > 0);
  const avgHeadroom  =
    headrooms.length > 0
      ? (headrooms.reduce((a, b) => a + b, 0) / headrooms.length).toFixed(1)
      : "—";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", gap: 2 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Stack direction="row" spacing={1.5} alignItems="center">
          <HistoryRoundedIcon sx={{ fontSize: 28, color: "#94a3b8" }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.5, color: "#f1f5f9" }}>
              Tower Switch Log
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.3 }}>
              Every cell handover with AI prediction analysis — traditional vs model-driven decision
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 2, px: 1.5, py: 0.75 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: "#22c55e" }}>LIVE</Typography>
        </Stack>
      </Stack>

      {/* Summary stats — 6 cards */}
      <Stack direction="row" spacing={1.5}>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }}>{events.length}</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>Total tower switches</Typography>
        </Card>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#a855f7", lineHeight: 1 }}>{mobilityCount}</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>Due to movement</Typography>
        </Card>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{congestionCount}</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>Due to congestion</Typography>
        </Card>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, p: "12px 16px" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: Number(avgGain) >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>
            {Number(avgGain) > 0 ? "+" : ""}{avgGain} dB
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>Avg signal change</Typography>
        </Card>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 3, p: "12px 16px" }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <PsychologyRoundedIcon sx={{ fontSize: 16, color: "#22d3ee" }} />
            <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#22d3ee", lineHeight: 1 }}>{aiProactive}</Typography>
          </Stack>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>AI proactive switches</Typography>
        </Card>
        <Card sx={{ flex: 1, background: "rgba(10,20,40,0.7)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 3, p: "12px 16px" }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#22c55e", lineHeight: 1 }}>
            {avgHeadroom !== "—" ? `+${avgHeadroom}` : "—"}{avgHeadroom !== "—" ? " dB" : ""}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>Avg AI headroom vs reactive</Typography>
        </Card>
      </Stack>

      {/* Device filter */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip
          label="All devices"
          onClick={() => setFilter("all")}
          sx={{
            fontWeight: 700,
            background: filter === "all" ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.07)",
            color: "#e2e8f0",
            border: filter === "all" ? "1px solid rgba(148,163,184,0.4)" : "1px solid rgba(148,163,184,0.1)",
          }}
        />
        {devices.map((d) => (
          <Chip
            key={d.ue_id}
            label={`${SCENARIO_ICON[d.ue_id.includes("SM-S901") ? "hbahn" : d.ue_id.includes("RM500") ? "mobile" : "static"] ?? "📡"} ${d.name}`}
            onClick={() => setFilter(d.ue_id)}
            sx={{
              fontWeight: 700,
              background: filter === d.ue_id ? `${d.color}22` : "rgba(255,255,255,0.05)",
              color: filter === d.ue_id ? d.color : "#94a3b8",
              border: filter === d.ue_id ? `1px solid ${d.color}55` : "1px solid rgba(255,255,255,0.07)",
            }}
          />
        ))}
      </Stack>

      {/* Event feed */}
      <Card
        sx={{
          flex: 1,
          minHeight: 0,
          background: "rgba(8,16,32,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
            <CircularProgress size={28} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 1 }}>
            <Typography sx={{ color: "#334155", fontSize: 14 }}>
              No tower switches recorded yet
            </Typography>
            <Typography sx={{ color: "#1e293b", fontSize: 12 }}>
              The dataset replayer is starting up — events will appear here shortly
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: "auto", p: "0 4px" }}>
            {/* Column headers */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "80px 160px 130px 78px 78px 70px 62px 1fr",
                px: 2,
                py: 1,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                position: "sticky",
                top: 0,
                background: "rgba(8,16,32,0.95)",
                zIndex: 1,
              }}
            >
              {["Time", "Device", "Tower switch", "Before", "After", "Change", "Reason", "AI Intel"].map((h) => (
                <Typography key={h} sx={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {h}
                </Typography>
              ))}
            </Box>

            {filtered.map((ev, i) => {
              const icon = SCENARIO_ICON[ev.scenario] ?? "📡";
              const reasonColor = ev.reason === "mobility" ? "#a855f7" : "#f59e0b";
              return (
                <Box
                  key={i}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "80px 160px 130px 78px 78px 70px 62px 1fr",
                    px: 2,
                    py: "7px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    alignItems: "center",
                    "&:hover": { background: "rgba(255,255,255,0.02)" },
                  }}
                >
                  {/* Time */}
                  <Typography sx={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
                    {fmtTime(ev.timestamp)}
                  </Typography>

                  {/* Device */}
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: ev.color, boxShadow: `0 0 5px ${ev.color}`, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1" }}>
                      {icon} {ev.name}
                    </Typography>
                  </Stack>

                  {/* Tower switch */}
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>
                    <span style={{ color: "#64748b" }}>#{ev.from_cell}</span>
                    <span style={{ color: "#334155", margin: "0 5px" }}>→</span>
                    <span style={{ color: "#e2e8f0" }}>#{ev.to_cell}</span>
                  </Typography>

                  {/* RSRP before */}
                  <Typography sx={{ fontSize: 11, color: ev.rsrp_before >= -85 ? "#22c55e" : ev.rsrp_before >= -100 ? "#f59e0b" : "#ef4444" }}>
                    {ev.rsrp_before.toFixed(0)} dBm
                  </Typography>

                  {/* RSRP after */}
                  <Typography sx={{ fontSize: 11, color: ev.rsrp_after >= -85 ? "#22c55e" : ev.rsrp_after >= -100 ? "#f59e0b" : "#ef4444" }}>
                    {ev.rsrp_after.toFixed(0)} dBm
                  </Typography>

                  {/* Gain */}
                  <Box>
                    <GainBadge gain={ev.rsrp_gain} />
                  </Box>

                  {/* Reason */}
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: reasonColor }}>
                    {ev.reason === "mobility" ? "Moving" : "Congest."}
                    {ev.reason === "mobility" && ev.velocity > 0 && (
                      <span style={{ color: "#475569", fontWeight: 400, display: "block", fontSize: 9 }}>{Math.round(ev.velocity)} km/h</span>
                    )}
                  </Typography>

                  {/* AI Intel */}
                  <Box>
                    <AIBadge ai={ev.ai_prediction ?? null} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Card>

      {/* AI legend */}
      {events.some((e) => e.ai_prediction != null) && (
        <Stack direction="row" spacing={2} sx={{ px: 1, pb: 0.5 }}>
          <Typography sx={{ fontSize: 10, color: "#334155" }}>AI Intel legend:</Typography>
          {[
            { color: "#22c55e", label: "Proactive — AI recommended before signal degraded (+ dB headroom vs traditional)" },
            { color: "#22d3ee", label: "Aligned — AI agreed with the handover" },
            { color: "#f59e0b", label: "No signal — AI said STAY, but traditional system still switched" },
          ].map(({ color, label }) => (
            <Stack key={label} direction="row" spacing={0.5} alignItems="center">
              <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: color }} />
              <Typography sx={{ fontSize: 10, color: "#475569" }}>{label}</Typography>
            </Stack>
          ))}
          <Typography sx={{ fontSize: 10, color: "#475569" }}>· Hover AI badge for full model breakdown</Typography>
        </Stack>
      )}
    </Box>
  );
}
