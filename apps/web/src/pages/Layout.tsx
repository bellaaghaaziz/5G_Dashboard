import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { Avatar, Box, Chip, Divider, Drawer, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { Chatbot, NexoLogo } from "../components";

const SIDEBAR_WIDTH = 260;

export function Layout() {
  const { role, email, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navSections = [
    {
      label: "Workspace",
      items: [
        { label: "Home", to: "/app/home", icon: <HomeRoundedIcon />, show: true },
        { label: "Operator", to: "/app/operator", icon: <MapRoundedIcon />, show: role === "network_operator" || role === "admin" },
        { label: "Data Scientist", to: "/app/scientist", icon: <ScienceRoundedIcon />, show: role === "data_scientist" || role === "admin" },
        { label: "ML Engineer", to: "/app/mlops", icon: <EngineeringRoundedIcon />, show: role === "ml_engineer" || role === "admin" },
        { label: "Admin", to: "/app/admin", icon: <AdminPanelSettingsRoundedIcon />, show: role === "admin" },
      ],
    },
    {
      label: "Analytics",
      items: [
        { label: "Live Metrics", to: "/app/operator", icon: <AnalyticsRoundedIcon />, show: true },
        { label: "Handover History", to: "/app/operator/handovers", icon: <HistoryRoundedIcon />, show: role === "network_operator" || role === "admin" },
      ],
    },
  ];

  const currentLabel = navSections.flatMap(s => s.items).find(n => location.pathname.startsWith(n.to))?.label ?? "Dashboard";

  const roleConfig: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "#ef4444" },
    network_operator: { label: "Operator", color: "#22d3ee" },
    data_scientist: { label: "Scientist", color: "#a855f7" },
    ml_engineer: { label: "ML Engineer", color: "#fbbf24" },
  };
  const rc = roleConfig[role ?? ""] ?? { label: role ?? "", color: "#94a3b8" };

  function handleLogout() {
    logout();
    navigate("/");
  }

  const sidebarContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(8,15,30,0.98)" }}>
      {/* Logo */}
      <Box sx={{ p: 3, pb: 2, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <NexoLogo size={38} />
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: 17, lineHeight: 1, letterSpacing: -0.5 }}>Nexo</Typography>
            <Typography sx={{ fontSize: 10, color: "#334155", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", mt: 0.3 }}>5G Platform</Typography>
          </Box>
        </Stack>
      </Box>

      {/* Live badge */}
      <Box sx={{ px: 3, py: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 14px", borderRadius: 2, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", animation: "pulse 2s infinite", "@keyframes pulse": { "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.6)" }, "70%": { boxShadow: "0 0 0 5px rgba(34,197,94,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0)" } } }} />
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#22c55e", lineHeight: 1 }}>LIVE DATA STREAMING</Typography>
            <Typography sx={{ fontSize: 10, color: "#164e13", fontWeight: 500, mt: 0.2 }}>AI Pipeline Active</Typography>
          </Box>
          <SignalCellularAltRoundedIcon sx={{ ml: "auto", color: "#22c55e", fontSize: 16 }} />
        </Box>
      </Box>

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1 }}>
        {navSections.map(sec => (
          <Box key={sec.label} sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#1e3a5f", letterSpacing: 2, textTransform: "uppercase", px: 1, mb: 1 }}>{sec.label}</Typography>
            <Stack spacing={0.5}>
              {sec.items.filter(i => i.show).map(item => {
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link key={item.to} to={item.to} style={{ textDecoration: "none" }} onClick={() => isMobile && setDrawerOpen(false)}>
                    <Box sx={{
                      display: "flex", alignItems: "center", gap: 1.5,
                      px: 2, py: 1.3, borderRadius: 2,
                      background: active ? "rgba(34,211,238,0.12)" : "transparent",
                      border: active ? "1px solid rgba(34,211,238,0.2)" : "1px solid transparent",
                      color: active ? "#22d3ee" : "#475569",
                      transition: "all 0.2s",
                      "&:hover": { background: active ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: active ? "#22d3ee" : "#94a3b8" },
                      cursor: "pointer",
                    }}>
                      <Box sx={{ "& .MuiSvgIcon-root": { fontSize: 18 }, color: active ? "#22d3ee" : "#334155", flexShrink: 0 }}>{item.icon}</Box>
                      <Typography sx={{ fontSize: 14, fontWeight: active ? 700 : 500, color: "inherit" }}>{item.label}</Typography>
                      {active && <Box sx={{ ml: "auto", width: 6, height: 6, borderRadius: "50%", bgcolor: "#22d3ee" }} />}
                    </Box>
                  </Link>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>

      {/* User profile */}
      <Box sx={{ p: 2, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`} sx={{ width: 36, height: 36, border: "2px solid rgba(34,211,238,0.2)" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email?.split("@")[0] ?? "User"}</Typography>
            <Chip label={rc.label} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: `${rc.color}18`, color: rc.color, border: `1px solid ${rc.color}30`, mt: 0.3 }} />
          </Box>
          <Tooltip title="Sign out">
            <IconButton onClick={handleLogout} size="small" sx={{ color: "#1e3a5f", "&:hover": { color: "#ef4444", bgcolor: "rgba(239,68,68,0.08)" } }}>
              <LogoutRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", background: "#050d1a" }}>

      {/* Sidebar — permanent on desktop, drawer on mobile */}
      {isMobile ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { width: SIDEBAR_WIDTH, background: "transparent", border: "none" } }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Box sx={{
          width: SIDEBAR_WIDTH, flexShrink: 0,
          background: "rgba(8,15,30,0.95)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50,
          backdropFilter: "blur(20px)",
        }}>
          {sidebarContent}
        </Box>
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` }, display: "flex", flexDirection: "column", minHeight: "100vh", minWidth: 0 }}>

        {/* Topbar */}
        <Box sx={{
          position: "sticky", top: 0, zIndex: 40,
          px: { xs: 2, md: 4 }, py: 1.8,
          background: "rgba(5,13,26,0.85)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {isMobile && (
              <IconButton onClick={() => setDrawerOpen(true)} size="small" sx={{ color: "#94a3b8", mr: 0.5 }}>
                <MenuRoundedIcon />
              </IconButton>
            )}
            <Typography sx={{ fontSize: 13, color: "#334155", fontWeight: 500, display: { xs: "none", sm: "block" } }}>CellPilot</Typography>
            <Typography sx={{ fontSize: 13, color: "#1e3a5f", display: { xs: "none", sm: "block" } }}>›</Typography>
            <Typography sx={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>{currentLabel}</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: { xs: 1, md: 2 }, py: 0.7, borderRadius: 2, bgcolor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.12)" }}>
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e" }} />
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>LIVE</Typography>
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.06)", my: 0.5, display: { xs: "none", sm: "flex" } }} />
            <Typography sx={{ fontSize: 13, color: "#334155", display: { xs: "none", sm: "block" } }}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Typography>
          </Stack>
        </Box>

        {/* Page content */}
        <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2, md: 4 } }}>
          <Outlet />
        </Box>
        <Chatbot />
      </Box>
    </Box>
  );
}
