import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, IconButton, Stack, Typography, LinearProgress, Stepper, Step, StepLabel, Paper } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import DatasetRoundedIcon from "@mui/icons-material/DatasetRounded";
import PrecisionManufacturingRoundedIcon from "@mui/icons-material/PrecisionManufacturingRounded";
import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const MOCK_METRICS = [
  { epoch: 1, accuracy: 0.82, loss: 0.45 },
  { epoch: 2, accuracy: 0.85, loss: 0.38 },
  { epoch: 3, accuracy: 0.89, loss: 0.31 },
  { epoch: 4, accuracy: 0.91, loss: 0.25 },
  { epoch: 5, accuracy: 0.93, loss: 0.21 },
];

export function MLEngineerPage() {
  const [pipelineStatus, setPipelineStatus] = useState<string>("idle");
  const [pipelineStep, setPipelineStep] = useState<string>("");
  const [dataBuffer, setDataBuffer] = useState(0); // Mock map replay ingestion buffer
  const [lastTrained, setLastTrained] = useState("Never");
  const [modelMetrics, setModelMetrics] = useState<{f1: number, latency: number, drift: number}>({ f1: 0.92, latency: 12, drift: 0.05 });
  const [logTail, setLogTail] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logTail]);

  // Read LIVE MLOps Status from Backend
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get("/mlops/status");
        const state = res.data?.state;
        if (state) {
          setPipelineStatus(state.status || "idle");
          setPipelineStep(state.step || "");
          
          if (state.status === "completed" && state.completed_at) {
            setLastTrained(new Date(state.completed_at * 1000).toLocaleTimeString());
          }
        }
        if (res.data?.log_tail) {
          setLogTail(res.data.log_tail);
        }
      } catch (err) {
        console.error("Failed to fetch MLOps status", err);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch MLFlow and System Metrics occasionally
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Here we could fetch MLflow metrics from /mlops/mlflow-summary
        const res = await api.get("/mlops/mlflow-summary");
        // For demonstration we'll just mock random jitter on ping
        setModelMetrics(prev => ({
          f1: Math.min(0.99, prev.f1 + (Math.random() * 0.01 - 0.005)),
          latency: Math.max(5, prev.latency + (Math.random() * 2 - 1)),
          drift: Math.max(0, prev.drift + (Math.random() * 0.005 - 0.002))
        }));
      } catch (e) {
        // Fallback
      }
    };
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Automatically grow data buffer like a live map replay
  useEffect(() => {
    const timer = setInterval(() => {
      setDataBuffer((prev) => {
        if (prev >= 1000 && pipelineStatus === "idle") {
          handleTriggerPipeline(); // Auto trigger when buffer is full
          return 0;
        }
        return pipelineStatus === "idle" ? prev + Math.floor(Math.random() * 50) : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pipelineStatus]);

  const handleTriggerPipeline = async () => {
    try {
      await api.post("/mlops/run", {});
      setPipelineStatus("running");
      setDataBuffer(0);
    } catch (err) {
      console.error("Failed to trigger pipeline", err);
    }
  };

  const steps = ["Configuring DVC", "Training Models", "Evaluating Pipelines", "Registering to MLflow", "Promoting to Production"];
  
  const getActiveStep = () => {
    if (pipelineStatus === "idle" || pipelineStatus === "completed") return steps.length;
    if (pipelineStatus === "failed") return steps.length;
    // Heuristic mapping of pipeline_runner logs/steps to MUI stepper
    const s = pipelineStep.toLowerCase();
    if (s.includes("dvc") || s.includes("pull")) return 0;
    if (s.includes("train") || s.includes("scikit") || s.includes("keras")) return 1;
    if (s.includes("eval") || s.includes("predict")) return 2;
    if (s.includes("mlflow") || s.includes("register")) return 3;
    if (s.includes("promot") || s.includes("production")) return 4;
    return 1;
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto", position: "relative" }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 1.5 }}>
            <PrecisionManufacturingRoundedIcon fontSize="large" sx={{ color: "#fbbf24" }} />
            Automated MLOps Command Center
          </Typography>
          <Typography sx={{ color: "#94a3b8", mt: 1, fontSize: 15 }}>
            Manage the continuous integration and deployment loop for 5G Handover AI models.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={(pipelineStatus === "idle" || pipelineStatus === "completed" || pipelineStatus === "failed") ? <PlayArrowRoundedIcon /> : <CircularProgress size={20} color="inherit" />}
            onClick={handleTriggerPipeline}
            disabled={!(pipelineStatus === "idle" || pipelineStatus === "completed" || pipelineStatus === "failed")}
            sx={{ px: 3, fontWeight: 700, borderRadius: 2 }}
          >
            {(pipelineStatus === "idle" || pipelineStatus === "completed" || pipelineStatus === "failed") ? "Trigger Immediate Retrain" : "Pipeline Running..."}
          </Button>
        </Stack>
      </Box>

      {/* Main Grid */}
      <Grid container spacing={3}>
        {/* Pipeline Progress */}
        <Grid size={{ xs: 12 }}>
          <Card sx={{ p: 1, bgcolor: "rgba(20, 30, 50, 0.6)" }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
                 <Typography variant="h6">Live Pipeline Automation (API-Driven)</Typography>
                 <Chip label={`Status: ${pipelineStatus.toUpperCase()}`} color={pipelineStatus === 'running' ? 'primary' : pipelineStatus === 'failed' ? 'error' : pipelineStatus === 'completed' ? 'success' : 'default'} />
              </Box>
              <Stepper activeStep={getActiveStep()} alternativeLabel>
                {steps.map((label, index) => {
                  const isActive = getActiveStep() === index && (pipelineStatus === "running");
                  return (
                    <Step key={label}>
                      <StepLabel>
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <Typography sx={{ color: isActive ? "#22d3ee" : "text.primary", fontWeight: isActive ? 700 : 500 }}>
                            {label}
                          </Typography>
                          {isActive && <LinearProgress color="primary" sx={{ width: '100%', mt: 1, height: 2 }} />}
                        </Box>
                      </StepLabel>
                    </Step>
                  );
                })}
              </Stepper>
            </CardContent>
          </Card>
        </Grid>

        {/* Data Ingestion from Map Replay */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={3} sx={{ height: "100%" }}>
            <Card>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
                  <DatasetRoundedIcon sx={{ color: "#22d3ee" }} />
                  <Typography variant="h6">Replay Data Ingestion</Typography>
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                  Kafka/Simulator telemetry buffered before triggers pipeline.
                </Typography>
                
                <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)", borderRadius: 2, mb: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="subtitle2">Buffer to Retrain Trigger</Typography>
                    <Typography variant="subtitle2" sx={{ color: "#22d3ee" }}>{dataBuffer} / 1000</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(dataBuffer / 1000) * 100} sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)' }} />
                </Box>

                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1 }}>Real-time Source</Typography>
                <Chip label="DATASET/raw/live_data.csv" size="small" sx={{ bgcolor: "rgba(34,211,238,0.1)", color: "#22d3ee", fontFamily: "monospace" }} />
              </CardContent>
            </Card>

            <Paper sx={{ flexGrow: 1, p: 2, bgcolor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ color: "#94a3b8", mb: 1 }}>Remote Runner Logs ⚡</Typography>
                <Box ref={logContainerRef} sx={{ height: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11, color: "#22c55e" }}>
                    {logTail.length === 0 && <Typography sx={{ color: "gray", fontSize: 11 }}>Waiting for pipeline to run...</Typography>}
                    {logTail.map((line, i) => (
                        <div key={i}>{line}</div>
                    ))}
                </Box>
            </Paper>
          </Stack>
        </Grid>

        {/* Model Metrics */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <MemoryRoundedIcon sx={{ color: "#a855f7" }} />
                  <Typography variant="h6">Active Model Metrics (MLflow)</Typography>
                </Box>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Last retrained: {lastTrained}
                </Typography>
              </Box>

              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)", borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">F1 Score (Handover)</Typography>
                    <Typography variant="h5" sx={{ color: "#10b981", fontWeight: 700 }}>{(modelMetrics.f1 * 100).toFixed(1)}%</Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)", borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">Concept Drift</Typography>
                    <Typography variant="h5" sx={{ color: modelMetrics.drift > 0.05 ? "#ef4444" : "#10b981", fontWeight: 700 }}>{(modelMetrics.drift * 100).toFixed(1)}%</Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)", borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">Avg Latency (K8s)</Typography>
                    <Typography variant="h5" sx={{ color: "#eab308", fontWeight: 700 }}>{modelMetrics.latency.toFixed(1)} ms</Typography>
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ height: 200, width: "100%" }}>
                <ResponsiveContainer>
                  <AreaChart data={MOCK_METRICS} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="epoch" stroke="#64748b" tick={{ fill: "#64748b" }} />
                    <YAxis stroke="#64748b" tick={{ fill: "#64748b" }} />
                    <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.1)" }} />
                    <Area type="monotone" dataKey="accuracy" stroke="#22d3ee" fillOpacity={1} fill="url(#colorAccuracy)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}