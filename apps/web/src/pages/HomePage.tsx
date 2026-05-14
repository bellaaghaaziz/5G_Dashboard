import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import CellTowerRoundedIcon from "@mui/icons-material/CellTowerRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

const GLASS = {
  background: "rgba(15, 23, 42, 0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 3,
};

const sections = [
  {
    title: "Live Map",
    desc: "Watch devices move across the city in real time and see the AI keeping connections strong automatically.",
    icon: <CellTowerRoundedIcon sx={{ fontSize: 36 }} />,
    gradient: "linear-gradient(135deg, #22d3ee, #3b82f6)",
    shadow: "rgba(34,211,238,0.3)",
    path: "/app/operator",
  },
  {
    title: "AI Results",
    desc: "A simple view of how well the AI has been performing — accuracy, reliability, and any alerts worth knowing about.",
    icon: <ScienceRoundedIcon sx={{ fontSize: 36 }} />,
    gradient: "linear-gradient(135deg, #a855f7, #6366f1)",
    shadow: "rgba(168,85,247,0.3)",
    path: "/app/scientist",
  },
  {
    title: "Admin",
    desc: "Add or remove users and decide what each person is allowed to see and do on the platform.",
    icon: <AdminPanelSettingsRoundedIcon sx={{ fontSize: 36 }} />,
    gradient: "linear-gradient(135deg, #f59e0b, #ef4444)",
    shadow: "rgba(245,158,11,0.3)",
    path: "/app/admin",
  },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <Box>
      {/* Hero */}
      <Box sx={{ mb: 5 }}>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 900,
            letterSpacing: -1,
            background: "linear-gradient(135deg, #22d3ee, #a855f7)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            mb: 1,
          }}
        >
          5G Handover AI
        </Typography>
        <Typography variant="h6" sx={{ color: "text.secondary", fontWeight: 400, maxWidth: 600 }}>
          Welcome back! Where would you like to go?
        </Typography>
      </Box>

      {/* Module Cards */}
      <Grid container spacing={3}>
        {sections.map((s) => (
          <Grid size={{ xs: 12, md: 4 }} key={s.title}>
            <Card
              sx={{
                ...GLASS,
                height: "100%",
                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                "&:hover": {
                  transform: "translateY(-6px)",
                  boxShadow: `0 12px 40px ${s.shadow}`,
                },
              }}
            >
              <CardActionArea onClick={() => navigate(s.path)} sx={{ height: "100%" }}>
                <CardContent sx={{ p: 3.5 }}>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: s.gradient,
                      color: "#fff",
                      mb: 2.5,
                      boxShadow: `0 6px 20px ${s.shadow}`,
                    }}
                  >
                    {s.icon}
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
                    {s.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
                    {s.desc}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
