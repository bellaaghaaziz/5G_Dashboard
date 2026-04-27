import { Card, CardContent, Grid, Typography } from "@mui/material";
import { useAuth } from "../context/auth";

export function HomePage() {
  const { role } = useAuth();

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Welcome Back!</Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", mt: 1 }}>
          You are currently logged in as <strong>{role?.replace("_", " ")}</strong>.
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%", p: 1 }}>
          <CardContent>
            <Typography variant="h6" sx={{ color: "primary.main", mb: 1 }}>Admin Console</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Manage system users, access control, and platform configuration.
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%", p: 1 }}>
          <CardContent>
            <Typography variant="h6" sx={{ color: "primary.main", mb: 1 }}>Network Operations</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Monitor live 5G signal risk, view handover recommendations on the map, and take action.
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%", p: 1 }}>
          <CardContent>
            <Typography variant="h6" sx={{ color: "primary.main", mb: 1 }}>Intelligence Lab</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Analyze model performance, view SHAP explainability charts, and review training experiments.
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
