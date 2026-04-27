import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import RadarRoundedIcon from "@mui/icons-material/RadarRounded";
import DeviceHubRoundedIcon from "@mui/icons-material/DeviceHubRounded";
import { Avatar, Box, Button, Chip, Divider, Stack, Typography } from "@mui/material";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";

export function Layout() {
  const { role, email, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    {
      label: "Operator",
      to: "/operator",
      icon: <MapRoundedIcon fontSize="small" />,
      show: role === "network_operator" || role === "admin",
    },
    {
      label: "Data Scientist",
      to: "/scientist",
      icon: <ScienceRoundedIcon fontSize="small" />,
      show: role === "data_scientist" || role === "admin",
    },
    {
      label: "Admin",
      to: "/admin",
      icon: <AdminPanelSettingsRoundedIcon fontSize="small" />,
      show: role === "admin",
    },
    {
      label: "Overview",
      to: "/home",
      icon: <AnalyticsRoundedIcon fontSize="small" />,
      show: true,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "260px 1fr" },
        backgroundColor: "background.default",
      }}
    >
      <Box
        sx={{
          p: 3,
          backgroundColor: "#1a1a1a",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: 900,
            }}
          >
            F
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
            5G Platform
          </Typography>
        </Box>

        <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.4)", mb: 1, fontWeight: 700 }}>
          NETWORK
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 1, mb: 4 }}>
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <Button
                key={item.to}
                component={Link}
                to={item.to}
                startIcon={item.icon}
                fullWidth
                sx={{
                  justifyContent: "flex-start",
                  textTransform: "none",
                  py: 1.2,
                  px: 2,
                  color: location.pathname.startsWith(item.to) ? "#000" : "rgba(255,255,255,0.7)",
                  backgroundColor: location.pathname.startsWith(item.to) ? "primary.main" : "transparent",
                  "&:hover": {
                    backgroundColor: location.pathname.startsWith(item.to)
                      ? "primary.main"
                      : "rgba(255,255,255,0.05)",
                  },
                  borderRadius: 1,
                  fontWeight: 600,
                }}
              >
                {item.label}
              </Button>
            ))}
        </Stack>

        <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.4)", mb: 1, fontWeight: 700 }}>
          ANALYTICS
        </Typography>
        <Stack spacing={0.5}>
          <Button
            startIcon={<AnalyticsRoundedIcon fontSize="small" />}
            fullWidth
            sx={{
              justifyContent: "flex-start",
              textTransform: "none",
              py: 1.2,
              px: 2,
              color: "rgba(255,255,255,0.7)",
              "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
            }}
          >
            Traffic Reports
          </Button>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Top Header Bar */}
        <Box
          sx={{
            p: 2,
            px: 3,
            borderRadius: 2,
            backgroundColor: "#fff",
            boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "text.secondary" }}>
              Dashboard {">"}{" "}
              <span style={{ color: "#1a1a1a" }}>{navItems.find((n) => location.pathname.startsWith(n.to))?.label}</span>
            </Typography>
          </Box>
          <Stack direction="row" spacing={3} alignItems="center">
            <Stack direction="row" spacing={2} sx={{ color: "text.secondary" }}>
              <Box sx={{ position: "relative" }}>
                <RadarRoundedIcon sx={{ fontSize: 20 }} />
                <Box
                  sx={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "error.main",
                    border: "2px solid #fff",
                  }}
                />
              </Box>
              <DeviceHubRoundedIcon sx={{ fontSize: 20 }} />
            </Stack>
            <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {email?.split("@")[0] ?? "User"}
              </Typography>
              <Avatar
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`}
                sx={{ width: 36, height: 36 }}
              />
              <Button
                variant="text"
                size="small"
                onClick={logout}
                sx={{ minWidth: 0, p: 0.5, color: "text.secondary" }}
              >
                <LogoutRoundedIcon fontSize="small" />
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Box>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
