import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Card,
  Stack,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
} from "@mui/material";
import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

type LegacyHo = Record<string, unknown> & {
  timestamp?: string;
  ue_id?: string;
  scenario?: string;
  from_cell?: number;
  to_cell?: number;
  rsrp_delta?: number;
  rsrp_at_ho?: number;
  dist_to_old_m?: number;
  dist_to_new_m?: number;
  ai_recommended?: boolean;
  ai_risk?: number;
  velocity?: number;
  policy?: string;
  kind?: string;
};

type PredictiveHoRow = Record<string, unknown> & {
  timestamp?: string;
  ue_id?: string;
  scenario?: string;
  from_cell?: number;
  to_cell?: number;
  rsrp_at_ho?: number;
  dso4_probability?: number;
  api_handover_recommended?: boolean;
  executed_via_model_guidance?: boolean;
  still_above_legacy_floor?: boolean;
  legacy_rsrp_floor_dbm?: number;
};

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

type HandoverHistoryResponse = {
  reactive: LegacyHo[];
  predictive: PredictiveHoRow[];
  summary: {
    reactiveCount: number;
    predictiveHoCount: number;
    predictiveInferenceCount: number;
    modelAlignedBeforeReactive: number;
  };
  hoPolicyComparison: HoPolicyComparison;
  sources: { reactiveLog: string; predictionsLog: string };
};

export function HandoverHistoryPage() {
  const [data, setData] = useState<HandoverHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const fetchHistory = useCallback(async () => {
    try {
      const { data: d } = await api.get<HandoverHistoryResponse>("/operator/handover-history");
      setData(d);
    } catch (e) {
      console.error("Failed to fetch handover history", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 2000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const reactive = data?.reactive ?? [];
  const predictive = data?.predictive ?? [];
  const summary = data?.summary;
  const pol = data?.hoPolicyComparison;

  const scenarioEmoji: Record<string, string> = {
    hbahn: "🚋",
    mobile: "📱",
    static: "🏢",
    pedestrian: "🚶",
    car: "🚗",
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" marginBottom={2}>
        <HistoryRoundedIcon sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.5 }}>
            Handover History
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.3 }}>
            <b>Legacy reactive</b> waits until RSRP drops below a floor (signal already degraded).{" "}
            <b>Predictive</b> uses your pipeline to hand over earlier while RSRP is still stronger.
          </Typography>
        </Box>
      </Stack>

      {pol && (
        <Card
          sx={{
            mb: 2,
            p: 2,
            background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,27,75,0.9))",
            border: "1px solid rgba(168,85,247,0.25)",
          }}
        >
          <Typography variant="subtitle2" sx={{ color: "#c084fc", fontWeight: 800, mb: 1 }}>
            Live comparison (from simulator / logs)
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            <Chip
              label={`Legacy HO (degraded): ${pol.reactiveLegacyHoCount}`}
              sx={{ fontWeight: 700, background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}
            />
            <Chip
              label={`Predictive HO: ${pol.predictiveHoCount}`}
              sx={{ fontWeight: 700, background: "rgba(34,211,238,0.15)", color: "#67e8f9" }}
            />
            <Chip
              label={`Avg RSRP legacy: ${pol.avgRsrpAtLegacyHoDbm ?? "—"} dBm`}
              sx={{ fontWeight: 700, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" }}
            />
            <Chip
              label={`Avg RSRP predictive: ${pol.avgRsrpAtPredictiveHoDbm ?? "—"} dBm`}
              sx={{ fontWeight: 700, background: "rgba(52,211,153,0.15)", color: "#6ee7b7" }}
            />
            <Chip
              label={`Headroom: ${pol.signalHeadroomDb != null ? `${pol.signalHeadroomDb} dB` : "—"}`}
              title="Positive means predictive handovers at stronger (less degraded) signal"
              sx={{ fontWeight: 800, background: "rgba(250,204,21,0.12)", color: "#fde047" }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: "#cbd5e1", lineHeight: 1.5 }}>
            {pol.narrative}
          </Typography>
        </Card>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip
          label={`Legacy rows: ${summary?.reactiveCount ?? 0}`}
          sx={{ fontWeight: 700, background: "rgba(239,68,68,0.12)", color: "#f87171" }}
        />
        <Chip
          label={`Predictive HO rows: ${summary?.predictiveHoCount ?? 0}`}
          sx={{ fontWeight: 700, background: "rgba(34,211,238,0.12)", color: "#22d3ee" }}
        />
        <Chip
          label={`Model ticks (inference): ${summary?.predictiveInferenceCount ?? 0}`}
          sx={{ fontWeight: 600, background: "rgba(100,116,139,0.12)", color: "#94a3b8" }}
        />
      </Stack>

      <Card
        sx={{
          background: "rgba(13,27,46,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          height: "calc(100vh - 420px)",
          minHeight: 320,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            minHeight: 42,
            "& .MuiTab-root": { minHeight: 42, textTransform: "none", fontWeight: 700 },
          }}
        >
          <Tab label={`Legacy (reactive / dataset) · ${reactive.length}`} />
          <Tab label={`Predictive (AI handovers) · ${predictive.length}`} />
        </Tabs>

        <TableContainer sx={{ flexGrow: 1 }}>
          {tab === 0 && (
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Time</TableCell>
                  <TableCell sx={headSx}>UE</TableCell>
                  <TableCell sx={headSx}>Handover</TableCell>
                  <TableCell sx={headSx}>RSRP @ HO</TableCell>
                  <TableCell align="right" sx={headSx}>
                    RSRP Δ
                  </TableCell>
                  <TableCell sx={headSx}>Policy</TableCell>
                  <TableCell sx={headSx}>AI prior tick</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reactive.map((ho, idx) => {
                  const rsrpDelta = Number(ho.rsrp_delta ?? 0);
                  const rsrpAt = ho.rsrp_at_ho;
                  const aiRisk = Number(ho.ai_risk ?? 0);
                  const distDelta =
                    Number(ho.dist_to_old_m ?? 0) - Number(ho.dist_to_new_m ?? 0);
                  const isLegacy = ho.kind === "reactive_legacy";
                  return (
                    <TableRow key={idx} sx={{ "&:hover": { background: "rgba(255,255,255,0.03)" } }}>
                      <TableCell sx={{ fontSize: 11, color: "#64748b" }}>
                        {ho.timestamp ? new Date(String(ho.timestamp)).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                        {String(ho.ue_id ?? "").slice(-12) || "Unknown"}{" "}
                        {scenarioEmoji[String(ho.scenario)] || "📡"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: "#64748b" }}>Cell {ho.from_cell}</span>
                        <span style={{ color: "#475569", margin: "0 4px" }}>→</span>
                        <span style={{ color: "#f87171" }}>Cell {ho.to_cell}</span>
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: isLegacy ? "#f87171" : "#94a3b8" }}>
                        {rsrpAt != null ? `${Number(rsrpAt).toFixed(1)} dBm` : "—"}
                        {isLegacy && (
                          <Chip
                            label="degraded"
                            size="small"
                            sx={{ ml: 0.5, height: 18, fontSize: 10, color: "#fecaca" }}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontSize: 11, color: rsrpDelta > 0 ? "#22c55e" : "#ef4444" }}
                      >
                        {rsrpDelta > 0 ? "+" : ""}
                        {rsrpDelta.toFixed(1)} dB
                        {rsrpAt == null && distDelta !== 0 && (
                          <span style={{ color: "#64748b" }}>
                            {" "}
                            (Δdist {distDelta > 0 ? "+" : ""}
                            {distDelta.toFixed(0)}m)
                          </span>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 10, color: "#94a3b8" }}>
                        {String(ho.policy ?? ho.kind ?? "—")}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11 }}>
                        {ho.ai_recommended != null ? (
                          ho.ai_recommended ? (
                            <span style={{ color: "#a855f7" }}>✓ ({(aiRisk * 100).toFixed(0)}%)</span>
                          ) : (
                            <span style={{ color: "#64748b" }}>—</span>
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {reactive.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: "center", py: 4, color: "#475569" }}>
                      {loading ? (
                        <CircularProgress size={24} />
                      ) : (
                        <>No legacy handovers yet. Run <code>python run_city.py</code> or replay.</>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {tab === 1 && (
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Time</TableCell>
                  <TableCell sx={headSx}>UE</TableCell>
                  <TableCell sx={headSx}>Handover</TableCell>
                  <TableCell sx={headSx}>RSRP @ HO</TableCell>
                  <TableCell align="right" sx={headSx}>
                    P(ho)
                  </TableCell>
                  <TableCell sx={headSx}>Above legacy floor?</TableCell>
                  <TableCell sx={headSx}>Strict API HO</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {predictive.map((ev, idx) => {
                  const rsrp = Number(ev.rsrp_at_ho);
                  const floor = Number(ev.legacy_rsrp_floor_dbm ?? -98);
                  const above = ev.still_above_legacy_floor !== false && rsrp > floor;
                  return (
                    <TableRow key={idx} sx={{ "&:hover": { background: "rgba(255,255,255,0.03)" } }}>
                      <TableCell sx={{ fontSize: 11, color: "#64748b" }}>
                        {ev.timestamp ? new Date(String(ev.timestamp)).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                        {String(ev.ue_id ?? "").slice(-12) || "Unknown"}{" "}
                        {scenarioEmoji[String(ev.scenario)] || "📡"}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: "#64748b" }}>Cell {ev.from_cell}</span>
                        <span style={{ color: "#475569", margin: "0 4px" }}>→</span>
                        <span style={{ color: "#22d3ee" }}>Cell {ev.to_cell}</span>
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: above ? "#6ee7b7" : "#fbbf24" }}>
                        {rsrp.toFixed(1)} dBm
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: 11, color: "#c084fc", fontWeight: 700 }}>
                        {((Number(ev.dso4_probability) || 0) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell sx={{ fontSize: 11 }}>
                        {above ? (
                          <Chip label="Yes — proactive" size="small" sx={{ height: 22, color: "#6ee7b7" }} />
                        ) : (
                          <Chip label="At / past floor" size="small" sx={{ height: 22, color: "#fbbf24" }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        {ev.api_handover_recommended ? (
                          <span style={{ color: "#22d3ee" }}>✓ API</span>
                        ) : (
                          <span style={{ color: "#c084fc" }}>guided</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {predictive.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: "center", py: 4, color: "#475569" }}>
                      {loading ? (
                        <CircularProgress size={24} />
                      ) : (
                        <>
                          No predictive handover executions logged. Start <code>run_city.py</code> with the
                          API on port 8000.
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>
    </Box>
  );
}

const headSx = {
  background: "rgba(13,27,46,0.95)",
  fontWeight: 700,
  color: "primary.main",
} as const;
