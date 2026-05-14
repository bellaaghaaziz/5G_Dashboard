import { useState, useEffect, useRef } from "react";
import {
  Box, Button, Card, CardContent, Chip, CircularProgress,
  Stack, Typography, LinearProgress, Stepper, Step, StepLabel,
} from "@mui/material";
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────────

type PipelineStatus = "idle" | "running" | "completed" | "failed";

type RunRecord = {
  started_at: number;
  completed_at: number;
  status: string;
  exit_code: number | null;
  run_id: string | null;
  model_name: string;
  model_version: string | null;
  promoted: boolean;
  promotion_reason: string;
  error: string | null;
};

type DriftReport = {
  status?: string;
  overall_drift?: boolean;
  drift_detected?: boolean;
  features?: Array<{
    feature: string;
    drift_score?: number;
    psi?: number;
    drifted?: boolean;
    p_value?: number;
    stattest_name?: string;
  }>;
  n_features?: number;
  n_drifted?: number;
  error?: string;
};

type ModelMetrics = {
  dso1_roc_auc?: number;
  dso1_pr_auc?: number;
  dso1_mcc?: number;
  dso4_roc_auc?: number;
  dso4_pr_auc?: number;
  dso4_mcc?: number;
  dso4_threshold?: number;
  dso4_ho_recall?: number;
  dso4_stay_recall?: number;
  dso4_accuracy?: number;
  latestExperiment?: string;
};

type ShapFeature = { feature: string; importance: number; type: string };
type ShapReport  = { dso: string; model: string; n_samples: number; features: ShapFeature[] };

type MlflowVersion = {
  version: string;
  current_stage: string;
  run_id: string;
  creation_timestamp: number;
};

type MlflowSummary = {
  experiment?: string;
  registered_models?: Array<{ name: string; versions: MlflowVersion[] }>;
  runs?: Array<{ run_id: string; start_time?: number; metrics?: Record<string, number> }>;
  error?: string;
};

type Tab = "drift" | "metrics" | "shap_dso1" | "shap_dso4" | "log" | "dvc";

type TabData = {
  drift?: DriftReport;
  metrics?: ModelMetrics;
  shap_dso1?: ShapReport;
  shap_dso4?: ShapReport;
  dvc?: DvcStatus;
};

type DvcStage = { name: string; cmd: string; deps: string[]; outs: string[] };
type DvcStatus = {
  ok: boolean;
  stages?: DvcStage[];
  changed?: boolean;
  summary?: string[];
  error?: string;
};

type AutoRetrainResult = {
  triggered: boolean;
  reason: string;
  n_critical?: number;
  n_warning?: number;
  drift_score?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleString([], {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function fmtMsDate(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(start: number, end: number) {
  const s = Math.round(end - start);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function qColor(val: number, lo = 0.7, hi = 0.9): string {
  return val >= hi ? "#22c55e" : val >= lo ? "#f59e0b" : "#ef4444";
}

const STAGE_CFG: Record<string, { bg: string; color: string; border: string }> = {
  Production: { bg: "rgba(34,197,94,0.1)",   color: "#22c55e", border: "rgba(34,197,94,0.3)"   },
  Staging:    { bg: "rgba(34,211,238,0.1)",  color: "#22d3ee", border: "rgba(34,211,238,0.3)"  },
  None:       { bg: "rgba(100,116,139,0.08)", color: "#64748b", border: "rgba(100,116,139,0.2)" },
  Archived:   { bg: "rgba(100,116,139,0.08)", color: "#475569", border: "rgba(100,116,139,0.2)" },
};

const TAB_DEFS: Array<{ id: Tab; label: string; color: string }> = [
  { id: "drift",     label: "Data Drift",    color: "#22d3ee" },
  { id: "metrics",   label: "Model Metrics", color: "#a855f7" },
  { id: "shap_dso1", label: "SHAP — DSO1",   color: "#f59e0b" },
  { id: "shap_dso4", label: "SHAP — DSO4",   color: "#10b981" },
  { id: "dvc",       label: "DVC Pipeline",  color: "#38bdf8" },
  { id: "log",       label: "Pipeline Log",  color: "#64748b" },
];

const PIPELINE_STEPS = [
  "Data Validation",
  "Train DSO3 + DSO1",
  "Train DSO4 Controller",
  "Register in MLflow",
  "Promote to Production",
];

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, badge, badgeGreen }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  badge?: string;
  badgeGreen?: boolean;
}) {
  return (
    <Card sx={{ background: "rgba(8,16,32,0.85)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3 }}>
      <CardContent sx={{ p: "16px 18px !important" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Box sx={{ color: "#334155" }}>{icon}</Box>
          {badge && (
            <Chip label={badge} size="small" sx={{
              fontSize: 10, fontWeight: 800, height: 18,
              background: badgeGreen ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color: badgeGreen ? "#22c55e" : "#ef4444",
              border: `1px solid ${badgeGreen ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }} />
          )}
        </Stack>
        <Typography sx={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", mt: 0.5 }}>{label}</Typography>
        {sub && <Typography sx={{ fontSize: 11, color: "#475569", mt: 0.2 }}>{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

// ── Drift panel ───────────────────────────────────────────────────────────────

function DriftPanel({ report }: { report: DriftReport | null }) {
  if (!report) return (
    <Box sx={{ textAlign: "center", py: 6, color: "#334155", fontSize: 13 }}>
      Click <strong style={{ color: "#22d3ee" }}>↺ Refresh</strong> to run feature distribution analysis.
    </Box>
  );
  if (report.error) return (
    <Box sx={{ color: "#ef4444", p: 2, fontFamily: "monospace", fontSize: 12,
      background: "rgba(239,68,68,0.05)", borderRadius: 2 }}>{report.error}</Box>
  );

  const detected = report.overall_drift || report.drift_detected || (report.n_drifted ?? 0) > 0;
  const features = report.features ?? [];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={2.5}>
        <Chip
          label={detected ? "⚠  Drift Detected" : "✓  Stable — No Drift"}
          sx={{
            fontWeight: 800, fontSize: 12,
            background: detected ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
            color: detected ? "#ef4444" : "#22c55e",
            border: `1px solid ${detected ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)"}`,
          }}
        />
        {report.n_drifted != null && (
          <Typography sx={{ fontSize: 12, color: "#64748b" }}>
            {report.n_drifted} / {report.n_features ?? features.length} features drifted
          </Typography>
        )}
      </Stack>

      {features.length > 0 ? (
        <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 72px",
            px: 1.5, pb: 1, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            {["Feature", "Score", "Test Method", "Status"].map(h => (
              <Typography key={h} sx={{ fontSize: 9, fontWeight: 700, color: "#475569",
                textTransform: "uppercase", letterSpacing: 0.9 }}>{h}</Typography>
            ))}
          </Box>
          {features.map((f, i) => {
            const score = f.drift_score ?? f.psi ?? 0;
            const bad = f.drifted ?? score > 0.1;
            return (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 72px",
                px: 1.5, py: "6px", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center",
                "&:hover": { background: "rgba(255,255,255,0.02)" } }}>
                <Typography sx={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "monospace" }}>{f.feature}</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: bad ? "#ef4444" : "#22c55e" }}>
                  {score.toFixed(4)}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "#475569" }}>
                  {f.stattest_name ?? (f.p_value != null ? "Kolmogorov-Smirnov" : "PSI")}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.7 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: bad ? "#ef4444" : "#22c55e",
                    boxShadow: `0 0 5px ${bad ? "#ef444480" : "#22c55e80"}` }} />
                  <Typography sx={{ fontSize: 10, color: bad ? "#ef4444" : "#22c55e" }}>
                    {bad ? "Drifted" : "OK"}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12, color: "#475569", textAlign: "center", py: 3 }}>
          Drift detector returned no feature-level details.
        </Typography>
      )}
    </Box>
  );
}

// ── Metrics panel ─────────────────────────────────────────────────────────────

function MetricsPanel({ metrics }: { metrics: ModelMetrics | null }) {
  if (!metrics) return (
    <Box sx={{ textAlign: "center", py: 6, color: "#334155", fontSize: 13 }}>
      Click <strong style={{ color: "#a855f7" }}>↺ Refresh</strong> to load DSO1 &amp; DSO4 performance metrics.
    </Box>
  );

  const kpis: Array<{ label: string; value: number | undefined; lo?: number; hi?: number; fmt: (v: number) => string }> = [
    { label: "DSO1 ROC-AUC",     value: metrics.dso1_roc_auc,    fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO1 MCC",         value: metrics.dso1_mcc,         lo: 0.5, hi: 0.75, fmt: (v: number) => v.toFixed(3) },
    { label: "DSO1 PR-AUC",      value: metrics.dso1_pr_auc,      fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO4 ROC-AUC",     value: metrics.dso4_roc_auc,     fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO4 MCC",         value: metrics.dso4_mcc,         lo: 0.5, hi: 0.75, fmt: (v: number) => v.toFixed(3) },
    { label: "DSO4 PR-AUC",      value: metrics.dso4_pr_auc,      fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO4 HO Recall",   value: metrics.dso4_ho_recall,   fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO4 Stay Recall", value: metrics.dso4_stay_recall, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
    { label: "DSO4 Threshold",   value: metrics.dso4_threshold,   lo: 0, hi: 1, fmt: (v: number) => v.toFixed(3) },
    { label: "DSO4 Accuracy",    value: metrics.dso4_accuracy,    fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
  ].filter(k => k.value != null);

  return (
    <Box>
      {metrics.latestExperiment && (
        <Typography sx={{ fontSize: 11, color: "#475569", mb: 2 }}>
          MLflow experiment: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{metrics.latestExperiment}</span>
        </Typography>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1.5 }}>
        {kpis.map(k => {
          const col = qColor(k.value!, k.lo, k.hi);
          return (
            <Box key={k.label} sx={{ p: "12px 14px", background: "rgba(255,255,255,0.03)",
              borderRadius: 2, border: `1px solid ${col}20` }}>
              <Typography sx={{ fontSize: 10, color: "#64748b", mb: 0.5, letterSpacing: 0.3, textTransform: "uppercase" }}>
                {k.label}
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: col, lineHeight: 1 }}>
                {k.fmt(k.value!)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ── SHAP panel ────────────────────────────────────────────────────────────────

function ShapPanel({ report, color }: { report: ShapReport | null; color: string }) {
  if (!report) return (
    <Box sx={{ textAlign: "center", py: 6, color: "#334155", fontSize: 13 }}>
      Click <strong style={{ color }}>↺ Refresh</strong> to compute feature importances from the production model.
    </Box>
  );

  const maxVal = Math.max(...report.features.map(f => f.importance), 0.0001);
  const isShap = report.features[0]?.type === "shap";

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" mb={2.5}>
        <Typography sx={{ fontSize: 12, color: "#64748b" }}>
          {report.model} · {report.n_samples} samples
        </Typography>
        <Chip
          label={isShap ? "True SHAP values" : "Gini importance (SHAP unavailable)"}
          size="small"
          sx={{
            fontSize: 10, fontWeight: 700,
            background: isShap ? "rgba(34,211,238,0.1)" : "rgba(245,158,11,0.1)",
            color: isShap ? "#22d3ee" : "#f59e0b",
            border: `1px solid ${isShap ? "rgba(34,211,238,0.3)" : "rgba(245,158,11,0.3)"}`,
          }}
        />
      </Stack>
      <Box sx={{ maxHeight: 320, overflowY: "auto", pr: 1 }}>
        {report.features.map(f => {
          const pct = (f.importance / maxVal) * 100;
          const fmtVal = f.importance < 0.0001 ? f.importance.toExponential(2) : f.importance.toFixed(4);
          return (
            <Box key={f.feature} sx={{ mb: 1.2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.4 }}>
                <Typography sx={{ fontSize: 11.5, color: "#94a3b8", fontFamily: "monospace" }}>{f.feature}</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>{fmtVal}</Typography>
              </Box>
              <Box sx={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${pct}%`,
                  background: `linear-gradient(90deg,${color},${color}55)`,
                  borderRadius: 3, transition: "width 0.7s ease" }} />
              </Box>
            </Box>
          );
        })}
      </Box>
      <Typography sx={{ fontSize: 10, color: "#334155", mt: 1.5 }}>
        {isShap
          ? "Mean |SHAP| — how much each feature pushes the prediction away from the baseline on average."
          : "Gini impurity reduction (install shap package for true Shapley values)."}
      </Typography>
    </Box>
  );
}

// ── Pipeline log ──────────────────────────────────────────────────────────────

function PipelineLog({ logTail, logRef }: {
  logTail: string[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <Box
      ref={logRef}
      sx={{ height: 260, overflowY: "auto", fontFamily: "monospace", fontSize: 11,
        background: "#020810", borderRadius: 2, p: 1.5,
        border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {logTail.length === 0 ? (
        <Typography sx={{ color: "#334155", fontSize: 11 }}>No log output yet — run the pipeline to see output here.</Typography>
      ) : logTail.map((line, i) => (
        <Box key={i} sx={{ mb: 0.25, lineHeight: 1.65,
          color: line.includes("ERROR") || line.includes("FAIL") || line.includes("failed")
            ? "#ef4444"
            : line.includes("Promoted") || line.includes("SUCCESS") || line.includes("✓")
            ? "#22c55e"
            : "#4ade80" }}>
          {line}
        </Box>
      ))}
    </Box>
  );
}

// ── DVC pipeline panel ────────────────────────────────────────────────────────

function DvcPanel({ dvc }: { dvc: DvcStatus | null }) {
  if (!dvc) return (
    <Box sx={{ textAlign: "center", py: 4 }}>
      <Typography sx={{ color: "#475569", fontSize: 13 }}>
        Click Refresh to load DVC pipeline status.
      </Typography>
    </Box>
  );

  if (dvc.error) return (
    <Box sx={{ p: 2, borderRadius: 2, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
      <Typography sx={{ color: "#ef4444", fontSize: 13 }}>{dvc.error}</Typography>
    </Box>
  );

  const stages = dvc.stages ?? [];
  return (
    <Box>
      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
        <Chip label={dvc.changed ? "Changes detected" : "Up to date"} size="small"
          sx={{ fontSize: 10, fontWeight: 700, height: 20,
            background: dvc.changed ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
            color: dvc.changed ? "#f59e0b" : "#22c55e",
            border: `1px solid ${dvc.changed ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)"}` }} />
        <Chip label={`${stages.length} stages`} size="small"
          sx={{ fontSize: 10, fontWeight: 700, height: 20,
            background: "rgba(56,189,248,0.08)", color: "#38bdf8",
            border: "1px solid rgba(56,189,248,0.2)" }} />
      </Stack>

      {stages.map((stage, idx) => (
        <Box key={stage.name} sx={{ mb: 1.5, p: "12px 14px", borderRadius: 2,
          background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Stack direction="row" spacing={1.5} alignItems="center" mb={0.75}>
            <Box sx={{ width: 22, height: 22, borderRadius: "50%",
              background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#38bdf8" }}>{idx + 1}</Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
              {stage.name}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: 11, color: "#4ade80", fontFamily: "monospace",
            background: "#020810", p: "4px 8px", borderRadius: 1, mb: 0.75 }}>
            $ {stage.cmd}
          </Typography>
          <Stack direction="row" spacing={2}>
            {stage.deps.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, color: "#475569", mb: 0.25 }}>DEPS</Typography>
                {stage.deps.map((d, i) => (
                  <Typography key={i} sx={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                    {typeof d === "string" ? d : Object.keys(d)[0]}
                  </Typography>
                ))}
              </Box>
            )}
            {stage.outs.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 10, color: "#475569", mb: 0.25 }}>OUTPUTS</Typography>
                {stage.outs.map((o, i) => (
                  <Typography key={i} sx={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>
                    {typeof o === "string" ? o : Object.keys(o)[0]}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        </Box>
      ))}

      {dvc.summary && dvc.summary.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 11, color: "#475569", mb: 0.5 }}>Status output:</Typography>
          <Box sx={{ fontFamily: "monospace", fontSize: 11, background: "#020810",
            borderRadius: 2, p: 1.5, color: "#94a3b8" }}>
            {dvc.summary.map((l, i) => <Box key={i}>{l}</Box>)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Model registry table ──────────────────────────────────────────────────────

function ModelRegistry({ summary, runs }: { summary: MlflowSummary | null; runs: RunRecord[] }) {
  type RegistryRow = {
    name: string;
    stage: string;
    version: string;
    run_id: string | null;
    roc_auc: number | null;
    trained_at: number | null;
  };

  const rows: RegistryRow[] = [];

  if (summary?.registered_models?.length) {
    const metricsMap = new Map<string, number>();
    (summary.runs ?? []).forEach(r => {
      if (r.metrics?.roc_auc) metricsMap.set(r.run_id, r.metrics.roc_auc);
    });
    for (const model of summary.registered_models) {
      const sorted = [...model.versions].sort((a, b) => b.creation_timestamp - a.creation_timestamp);
      for (const v of sorted) {
        rows.push({
          name: model.name,
          stage: v.current_stage || "None",
          version: v.version,
          run_id: v.run_id ?? null,
          roc_auc: metricsMap.get(v.run_id) ?? null,
          trained_at: v.creation_timestamp ? Math.floor(v.creation_timestamp / 1000) : null,
        });
      }
    }
  } else if (runs.length > 0) {
    const seen = new Set<string>();
    for (const r of runs) {
      const key = `${r.model_name}-${r.model_version ?? "x"}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({
          name: r.model_name || "handover_model",
          stage: r.promoted ? "Production" : "None",
          version: r.model_version ?? "—",
          run_id: r.run_id,
          roc_auc: null,
          trained_at: r.completed_at || r.started_at,
        });
      }
    }
  }

  const stageOrder: Record<string, number> = { Production: 0, Staging: 1, None: 2, Archived: 3 };
  rows.sort((a, b) => (stageOrder[a.stage] ?? 4) - (stageOrder[b.stage] ?? 4));

  const COLS = ["Model Name", "Stage", "Version", "ROC-AUC", "Registered", "Run ID"];
  const GRID = "1fr 110px 72px 90px 130px 120px";

  if (rows.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4, color: "#334155", fontSize: 13 }}>
        No registered models yet. Run the full pipeline to register models in MLflow.
      </Box>
    );
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: GRID, px: 2, py: "9px",
        borderBottom: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.025)", borderRadius: "6px 6px 0 0" }}>
        {COLS.map(c => (
          <Typography key={c} sx={{ fontSize: 10, fontWeight: 700, color: "#475569",
            textTransform: "uppercase", letterSpacing: 0.9 }}>{c}</Typography>
        ))}
      </Box>

      {rows.map((row, i) => {
        const sc = STAGE_CFG[row.stage] ?? STAGE_CFG.None;
        const isProd = row.stage === "Production";
        return (
          <Box key={i} sx={{
            display: "grid", gridTemplateColumns: GRID, px: 2, py: "11px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            alignItems: "center",
            background: isProd ? "rgba(34,197,94,0.025)" : i % 2 ? "rgba(255,255,255,0.01)" : "transparent",
            "&:hover": { background: "rgba(255,255,255,0.04)" },
          }}>

            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: sc.color,
                boxShadow: isProd ? `0 0 7px ${sc.color}` : "none" }} />
              <Typography sx={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </Typography>
            </Stack>

            <Chip label={row.stage} size="small" sx={{
              fontSize: 10, fontWeight: 700, height: 20,
              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
              width: "fit-content",
            }} />

            <Typography sx={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
              {row.version !== "—" ? `v${row.version}` : "—"}
            </Typography>

            <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace",
              color: row.roc_auc != null ? qColor(row.roc_auc) : "#334155" }}>
              {row.roc_auc != null ? `${(row.roc_auc * 100).toFixed(1)}%` : "—"}
            </Typography>

            <Typography sx={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
              {row.trained_at ? fmtDate(row.trained_at) : "—"}
            </Typography>

            <Typography sx={{ fontSize: 10, color: "#334155", fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.run_id ? `${row.run_id.slice(0, 14)}…` : "—"}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// ── Training history table ────────────────────────────────────────────────────

function HistoryTable({ runs }: { runs: RunRecord[] }) {
  if (runs.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4, color: "#334155", fontSize: 13 }}>
        No training runs yet. Click "Run Pipeline" to start.
      </Box>
    );
  }

  const COLS = ["Started", "Duration", "Exit", "MLflow Run ID", "Version", "Promotion Result"];
  const GRID = "120px 72px 64px 150px 80px 1fr";

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: GRID, px: 2, py: "9px",
        borderBottom: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.025)", borderRadius: "6px 6px 0 0" }}>
        {COLS.map(c => (
          <Typography key={c} sx={{ fontSize: 10, fontWeight: 700, color: "#475569",
            textTransform: "uppercase", letterSpacing: 0.9 }}>{c}</Typography>
        ))}
      </Box>
      {runs.map((r, i) => {
        const ok = r.status === "completed" && r.exit_code === 0;
        return (
          <Box key={i} sx={{
            display: "grid", gridTemplateColumns: GRID, px: 2, py: "9px",
            borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center",
            background: r.promoted ? "rgba(34,197,94,0.02)" : i % 2 ? "rgba(255,255,255,0.01)" : "transparent",
            "&:hover": { background: "rgba(255,255,255,0.04)" },
          }}>
            <Typography sx={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
              {fmtDate(r.started_at)}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
              {r.completed_at ? fmtDuration(r.started_at, r.completed_at) : "—"}
            </Typography>
            <Chip label={ok ? "✓ OK" : `✗ ${r.exit_code ?? "err"}`} size="small" sx={{
              fontSize: 9, fontWeight: 800, height: 18, width: "fit-content",
              background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color: ok ? "#22c55e" : "#ef4444",
              border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            }} />
            <Typography sx={{ fontSize: 10, color: "#475569", fontFamily: "monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.run_id ? `${r.run_id.slice(0, 16)}…` : "—"}
            </Typography>
            <Box>
              {r.model_version ? (
                <Chip label={`v${r.model_version}`} size="small" sx={{
                  fontSize: 9, fontWeight: 700, height: 18,
                  background: "rgba(34,211,238,0.1)", color: "#22d3ee",
                  border: "1px solid rgba(34,211,238,0.25)" }}
                />
              ) : <Typography sx={{ fontSize: 11, color: "#334155" }}>—</Typography>}
            </Box>
            <Stack direction="row" spacing={0.6} alignItems="center">
              {r.promoted
                ? <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "#22c55e", flexShrink: 0 }} />
                : <CancelRoundedIcon sx={{ fontSize: 14, color: r.status === "failed" ? "#ef4444" : "#475569", flexShrink: 0 }} />}
              <Typography sx={{ fontSize: 10, color: r.promoted ? "#22c55e" : "#64748b",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.promotion_reason || (r.error ? r.error.slice(0, 80) : "—")}
              </Typography>
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EXTERNAL_LINKS = [
  { label: "MLflow",     url: "http://localhost:5001" },
  { label: "Grafana",   url: "http://localhost:3001" },
  { label: "Prometheus", url: "http://localhost:9090" },
];

export function MLEngineerPage() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("idle");
  const [pipelineStep,   setPipelineStep]   = useState("");
  const [logTail,        setLogTail]        = useState<string[]>([]);
  const [lastTrained,    setLastTrained]    = useState<string | null>(null);
  const [runs,           setRuns]           = useState<RunRecord[]>([]);
  const [mlflowSummary,  setMlflowSummary]  = useState<MlflowSummary | null>(null);

  const [activeTab,  setActiveTab]  = useState<Tab>("drift");
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [tabData,    setTabData]    = useState<TabData>({});
  const [autoRetrainLoading, setAutoRetrainLoading] = useState(false);
  const [autoRetrainResult,  setAutoRetrainResult]  = useState<AutoRetrainResult | null>(null);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logTail]);

  // Load MLflow summary once
  useEffect(() => {
    api.get("/mlops/mlflow-summary").then(r => setMlflowSummary(r.data)).catch(() => {});
  }, []);

  // Poll pipeline status + history every 3 s
  useEffect(() => {
    const poll = async () => {
      try {
        const [sRes, hRes] = await Promise.all([
          api.get("/mlops/status"),
          api.get("/mlops/history"),
        ]);
        const s = sRes.data?.state;
        if (s) {
          setPipelineStatus(s.status ?? "idle");
          setPipelineStep(s.step ?? "");
          if (s.status === "completed" && s.completed_at)
            setLastTrained(new Date(s.completed_at * 1000).toLocaleTimeString());
        }
        if (sRes.data?.log_tail) setLogTail(sRes.data.log_tail);
        if (hRes.data?.items)    setRuns(hRes.data.items);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const fetchTab = async (tab: Tab, force = false) => {
    if (loadingTab || tab === "log") return;
    if (!force && tabData[tab as keyof TabData]) return;
    setLoadingTab(tab);
    try {
      if (tab === "drift") {
        const r = await api.get("/scientist/drift");
        setTabData(prev => ({ ...prev, drift: r.data }));
      } else if (tab === "metrics") {
        const r = await api.get("/scientist/metrics");
        setTabData(prev => ({ ...prev, metrics: r.data }));
      } else if (tab === "shap_dso1") {
        const r = await api.get("/mlops/shap/dso1");
        setTabData(prev => ({ ...prev, shap_dso1: r.data }));
      } else if (tab === "shap_dso4") {
        const r = await api.get("/mlops/shap/dso4");
        setTabData(prev => ({ ...prev, shap_dso4: r.data }));
      } else if (tab === "dvc") {
        const [dagRes, statusRes] = await Promise.allSettled([
          api.get("/mlops/dvc/dag"),
          api.get("/mlops/dvc/status"),
        ]);
        const stages = dagRes.status === "fulfilled" ? dagRes.value.data?.stages ?? [] : [];
        const statusInfo = statusRes.status === "fulfilled" ? statusRes.value.data : {};
        // exclude 'stages' from statusInfo to avoid overwriting the DAG array
        const { stages: _s, ...statusRest } = statusInfo as Record<string, unknown>;
        setTabData(prev => ({ ...prev, dvc: { ok: true, stages, ...statusRest } }));
      }
    } catch {}
    setLoadingTab(null);
  };

  const handleAutoRetrain = async () => {
    setAutoRetrainLoading(true);
    setAutoRetrainResult(null);
    try {
      const r = await api.post("/mlops/auto-retrain", {});
      setAutoRetrainResult(r.data);
      if (r.data.triggered) setPipelineStatus("running");
    } catch (e: any) {
      setAutoRetrainResult({ triggered: false, reason: e?.response?.data?.detail ?? "Request failed" });
    }
    setAutoRetrainLoading(false);
  };

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    fetchTab(tab);
  };

  const handleRetrain = async () => {
    try {
      await api.post("/mlops/run", {});
      setPipelineStatus("running");
    } catch {}
  };

  const pipelineRunning = pipelineStatus === "running";

  const getActiveStep = () => {
    if (!pipelineRunning) return -1;
    const s = pipelineStep.toLowerCase();
    if (s.includes("dvc") || s.includes("data") || s.includes("valid")) return 0;
    if (s.includes("dso3") || s.includes("dso1") || s.includes("cluster")) return 1;
    if (s.includes("dso4") || s.includes("calibrat")) return 2;
    if (s.includes("mlflow") || s.includes("register")) return 3;
    if (s.includes("promot") || s.includes("production")) return 4;
    return 1;
  };

  // Derived stat values
  const prodCount = mlflowSummary?.registered_models
    ?.flatMap(m => m.versions).filter(v => v.current_stage === "Production").length
    ?? runs.filter(r => r.promoted).length;

  const driftDetected: boolean | null = tabData.drift
    ? (tabData.drift.overall_drift || tabData.drift.drift_detected || (tabData.drift.n_drifted ?? 0) > 0) ?? false
    : null;

  const promotedCount = runs.filter(r => r.promoted).length;
  const failedCount   = runs.filter(r => r.status === "failed").length;

  const activeDef = TAB_DEFS.find(t => t.id === activeTab)!;

  const statusCfg = {
    idle:      { color: "#64748b", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)" },
    running:   { color: "#22d3ee", bg: "rgba(34,211,238,0.12)",  border: "rgba(34,211,238,0.4)" },
    completed: { color: "#22c55e", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.4)"  },
    failed:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.4)"  },
  }[pipelineStatus];

  return (
    <Box sx={{ maxWidth: 1440, mx: "auto" }}>

      {/* ── Header ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: "#f1f5f9",
            display: "flex", alignItems: "center", gap: 1.5 }}>
            <PrecisionManufacturingRoundedIcon fontSize="large" sx={{ color: "#fbbf24" }} />
            MLOps Control Center
          </Typography>
          <Typography sx={{ color: "#64748b", mt: 0.5, fontSize: 13 }}>
            Monitor drift · inspect metrics · explain models · track training runs
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {lastTrained && (
            <Typography sx={{ fontSize: 12, color: "#475569" }}>Last run: {lastTrained}</Typography>
          )}
          <Chip
            label={pipelineStatus.toUpperCase()}
            sx={{ fontWeight: 800, fontSize: 11,
              background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}` }}
          />
          <Button
            variant="outlined"
            onClick={handleAutoRetrain}
            disabled={pipelineRunning || autoRetrainLoading}
            startIcon={autoRetrainLoading
              ? <CircularProgress size={15} color="inherit" />
              : <WaterDropRoundedIcon />}
            sx={{ borderColor: "#22d3ee", color: "#22d3ee",
              "&:hover": { borderColor: "#06b6d4", background: "rgba(34,211,238,0.08)" },
              fontWeight: 700, borderRadius: 2, px: 2, textTransform: "none" }}
          >
            {autoRetrainLoading ? "Checking…" : "Auto-Retrain"}
          </Button>
          <Button
            variant="contained"
            onClick={handleRetrain}
            disabled={pipelineRunning}
            startIcon={pipelineRunning
              ? <CircularProgress size={15} color="inherit" />
              : <PlayArrowRoundedIcon />}
            sx={{ background: "#22c55e", "&:hover": { background: "#16a34a" },
              fontWeight: 700, borderRadius: 2, px: 2.5, textTransform: "none" }}
          >
            {pipelineRunning ? "Pipeline Running…" : "Run Pipeline"}
          </Button>
        </Stack>
      </Box>

      {/* ── Auto-retrain result banner ── */}
      {autoRetrainResult && (
        <Box sx={{
          mb: 2, p: "10px 16px", borderRadius: 2,
          background: autoRetrainResult.triggered ? "rgba(34,211,238,0.08)" : "rgba(100,116,139,0.08)",
          border: `1px solid ${autoRetrainResult.triggered ? "rgba(34,211,238,0.3)" : "rgba(100,116,139,0.2)"}`,
          display: "flex", alignItems: "center", gap: 1.5,
        }}>
          {autoRetrainResult.triggered
            ? <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "#22d3ee" }} />
            : <CancelRoundedIcon sx={{ fontSize: 18, color: "#64748b" }} />}
          <Typography sx={{ fontSize: 13, color: autoRetrainResult.triggered ? "#22d3ee" : "#94a3b8" }}>
            {autoRetrainResult.triggered
              ? `Champion/Challenger retraining triggered — ${autoRetrainResult.n_critical ?? 0} critical + ${autoRetrainResult.n_warning ?? 0} warning features drifted.`
              : autoRetrainResult.reason}
          </Typography>
        </Box>
      )}

      {/* ── Overview stat cards ── */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, mb: 3 }}>
        <StatCard
          icon={<CheckCircleRoundedIcon />}
          label="Production Models"
          value={prodCount}
          sub="Models promoted to production stage"
          badge={prodCount > 0 ? `${prodCount} active` : undefined}
          badgeGreen
        />
        <StatCard
          icon={<WaterDropRoundedIcon />}
          label="Data Drift"
          value={driftDetected === null ? "—" : driftDetected ? "Drift!" : "Stable"}
          sub={driftDetected === null ? "Click Data Drift tab to check" : driftDetected ? "Feature distribution shifted" : "Training vs live data aligned"}
          badge={driftDetected === null ? undefined : driftDetected ? "⚠ Action needed" : "✓ OK"}
          badgeGreen={driftDetected === false}
        />
        <StatCard
          icon={<SpeedRoundedIcon />}
          label="Last Trained"
          value={lastTrained ?? "Never"}
          sub="Most recent pipeline completion"
        />
        <StatCard
          icon={<TimelineRoundedIcon />}
          label="Training Runs"
          value={runs.length}
          sub={`${promotedCount} promoted · ${failedCount} failed`}
          badge={promotedCount > 0 ? `${promotedCount} promoted` : undefined}
          badgeGreen
        />
      </Box>

      {/* ── Tab navigation ── */}
      <Box sx={{ display: "flex", gap: 0.5, borderBottom: "1px solid rgba(255,255,255,0.07)", mb: 0, pl: 0.5 }}>
        {TAB_DEFS.map(t => {
          const isActive = activeTab === t.id;
          return (
            <Button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              startIcon={
                loadingTab === t.id ? (
                  <CircularProgress size={13} sx={{ color: t.color }} />
                ) : t.id === "drift" ? (
                  <WaterDropRoundedIcon sx={{ fontSize: 15 }} />
                ) : t.id === "metrics" ? (
                  <SpeedRoundedIcon sx={{ fontSize: 15 }} />
                ) : t.id === "shap_dso1" || t.id === "shap_dso4" ? (
                  <PsychologyRoundedIcon sx={{ fontSize: 15 }} />
                ) : (
                  <ArticleRoundedIcon sx={{ fontSize: 15 }} />
                )
              }
              sx={{
                textTransform: "none",
                borderRadius: "8px 8px 0 0",
                px: 2, py: "9px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? t.color : "#475569",
                background: isActive ? `${t.color}12` : "transparent",
                borderBottom: `2px solid ${isActive ? t.color : "transparent"}`,
                "&:hover": { background: `${t.color}0a`, color: t.color },
                transition: "all 0.15s ease",
                minWidth: "unset",
                gap: 0.5,
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </Box>

      {/* ── Active tab panel ── */}
      <Card sx={{
        mb: 3,
        background: "rgba(8,16,32,0.85)",
        border: `1px solid ${activeDef.color}22`,
        borderTop: "none",
        borderRadius: "0 0 12px 12px",
      }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: activeDef.color }}>
              {activeDef.label}
            </Typography>
            {activeTab !== "log" && (
              <Button
                size="small"
                disabled={loadingTab === activeTab}
                onClick={() => fetchTab(activeTab, true)}
                sx={{ fontSize: 11, color: "#64748b", textTransform: "none",
                  "&:hover": { color: activeDef.color } }}
              >
                ↺ Refresh
              </Button>
            )}
          </Stack>

          {loadingTab === activeTab ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 6 }}>
              <CircularProgress sx={{ color: activeDef.color }} />
            </Box>
          ) : activeTab === "drift" ? (
            <DriftPanel report={tabData.drift ?? null} />
          ) : activeTab === "metrics" ? (
            <MetricsPanel metrics={tabData.metrics ?? null} />
          ) : activeTab === "shap_dso1" ? (
            <ShapPanel report={tabData.shap_dso1 ?? null} color="#f59e0b" />
          ) : activeTab === "shap_dso4" ? (
            <ShapPanel report={tabData.shap_dso4 ?? null} color="#10b981" />
          ) : activeTab === "dvc" ? (
            <DvcPanel dvc={tabData.dvc ?? null} />
          ) : (
            <PipelineLog logTail={logTail} logRef={logRef} />
          )}
        </CardContent>
      </Card>

      {/* ── Model Registry ── */}
      <Card sx={{ mb: 2, background: "rgba(8,16,32,0.85)",
        border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <StorageRoundedIcon sx={{ fontSize: 18, color: "#22c55e" }} />
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
                Model Registry
              </Typography>
              {prodCount > 0 && (
                <Chip label={`${prodCount} in Production`} size="small" sx={{
                  fontSize: 10, fontWeight: 700, height: 18,
                  background: "rgba(34,197,94,0.1)", color: "#22c55e",
                  border: "1px solid rgba(34,197,94,0.25)" }} />
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              {EXTERNAL_LINKS.map(link => (
                <Button
                  key={link.label}
                  onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 12 }} />}
                  size="small"
                  sx={{ fontSize: 11, color: "#475569", textTransform: "none",
                    border: "1px solid rgba(255,255,255,0.07)", borderRadius: 1.5, px: 1.5,
                    "&:hover": { color: "#22d3ee", border: "1px solid rgba(34,211,238,0.3)",
                      background: "rgba(34,211,238,0.05)" } }}
                >
                  {link.label}
                </Button>
              ))}
            </Stack>
          </Stack>
          <ModelRegistry summary={mlflowSummary} runs={runs} />
        </CardContent>
      </Card>

      {/* ── Training history ── */}
      <Card sx={{ mb: 2, background: "rgba(8,16,32,0.85)",
        border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TimelineRoundedIcon sx={{ fontSize: 18, color: "#64748b" }} />
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>
                Training History
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                <CheckCircleRoundedIcon sx={{ fontSize: 13, color: "#22c55e" }} />
                <Typography sx={{ fontSize: 11, color: "#64748b" }}>{promotedCount} promoted</Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                <CancelRoundedIcon sx={{ fontSize: 13, color: "#ef4444" }} />
                <Typography sx={{ fontSize: 11, color: "#64748b" }}>{failedCount} failed</Typography>
              </Box>
            </Stack>
          </Stack>
          <HistoryTable runs={runs} />
        </CardContent>
      </Card>

      {/* ── Pipeline stepper (only when running) ── */}
      {pipelineRunning && (
        <Card sx={{ background: "rgba(8,16,32,0.85)",
          border: "1px solid rgba(34,211,238,0.15)", borderRadius: 3 }}>
          <CardContent>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#22d3ee", mb: 2.5 }}>
              Pipeline running — <em style={{ color: "#94a3b8" }}>{pipelineStep || "initializing…"}</em>
            </Typography>
            <Stepper activeStep={getActiveStep()} alternativeLabel>
              {PIPELINE_STEPS.map((label, i) => {
                const isActive = getActiveStep() === i;
                return (
                  <Step key={label}>
                    <StepLabel>
                      <Typography sx={{ fontSize: 11, fontWeight: isActive ? 700 : 400,
                        color: isActive ? "#22d3ee" : "text.secondary" }}>
                        {label}
                      </Typography>
                      {isActive && (
                        <LinearProgress sx={{ mt: 0.5, height: 2, borderRadius: 1,
                          "& .MuiLinearProgress-bar": { background: "#22d3ee" } }} />
                      )}
                    </StepLabel>
                  </Step>
                );
              })}
            </Stepper>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
