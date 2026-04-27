import { Card, CardContent, Grid, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";

export function ScientistPage() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    api.get("/scientist/metrics").then((res: { data: unknown }) => setMetrics(res.data));
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <Typography variant="h4">Data Scientist Workspace</Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card><CardContent><Typography variant="subtitle2">Latest Experiment</Typography><Typography variant="h6">{metrics?.latestExperiment ?? "--"}</Typography></CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent><Typography variant="subtitle2">DSO1 ROC AUC</Typography><Typography variant="h5">{metrics?.dso1_roc_auc ?? "--"}</Typography></CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 3 }}>
        <Card><CardContent><Typography variant="subtitle2">DSO4 ROC AUC</Typography><Typography variant="h5">{metrics?.dso4_roc_auc ?? "--"}</Typography></CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card><CardContent><Typography variant="subtitle2">DSO4 MCC</Typography><Typography variant="h5">{metrics?.dso4_mcc ?? "--"}</Typography></CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card><CardContent><Typography variant="subtitle2">DSO4 Threshold</Typography><Typography variant="h5">{metrics?.dso4_threshold ?? "--"}</Typography></CardContent></Card>
      </Grid>
    </Grid>
  );
}
