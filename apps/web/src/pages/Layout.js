import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import { Avatar, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
export function Layout() {
    const { role, email, logout } = useAuth();
    const location = useLocation();
    const navItems = [
        {
            label: "Operator",
            to: "/operator",
            icon: _jsx(MapRoundedIcon, { fontSize: "small" }),
            show: role === "network_operator" || role === "admin",
        },
        {
            label: "Data Scientist",
            to: "/scientist",
            icon: _jsx(ScienceRoundedIcon, { fontSize: "small" }),
            show: role === "data_scientist" || role === "admin",
        },
        {
            label: "Admin",
            to: "/admin",
            icon: _jsx(AdminPanelSettingsRoundedIcon, { fontSize: "small" }),
            show: role === "admin",
        },
        {
            label: "Overview",
            to: "/home",
            icon: _jsx(AnalyticsRoundedIcon, { fontSize: "small" }),
            show: true,
        },
    ];
    return (_jsxs(Box, { sx: {
            minHeight: "100vh",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "250px 1fr" },
            background: "radial-gradient(circle at 20% 0%, #1b2a4d 0%, #0a0f1c 45%)",
        }, children: [_jsxs(Box, { sx: {
                    p: 2,
                    borderRight: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(180deg, rgba(22,31,56,0.95) 0%, rgba(12,18,33,0.95) 100%)",
                }, children: [_jsx(Typography, { variant: "h6", sx: { mb: 0.5 }, children: "5G Dashboard" }), _jsx(Typography, { variant: "caption", color: "text.secondary", children: "Handover Optimization Platform" }), _jsx(Stack, { spacing: 1.2, sx: { mt: 3 }, children: navItems
                            .filter((item) => item.show)
                            .map((item) => (_jsx(Button, { component: Link, to: item.to, startIcon: item.icon, fullWidth: true, variant: location.pathname.startsWith(item.to) ? "contained" : "text", sx: { justifyContent: "flex-start", textTransform: "none", py: 1.1 }, children: item.label }, item.to))) })] }), _jsxs(Box, { sx: { p: { xs: 2, md: 3 } }, children: [_jsxs(Box, { sx: {
                            mb: 3,
                            p: 2,
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 3,
                            background: "rgba(255,255,255,0.03)",
                            backdropFilter: "blur(8px)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }, children: [_jsxs(Stack, { children: [_jsx(Typography, { variant: "h5", sx: { fontWeight: 700 }, children: "Main Dashboard" }), _jsxs(Typography, { variant: "body2", color: "text.secondary", children: ["Real-time handover intelligence for role: ", role] })] }), _jsxs(Stack, { direction: "row", spacing: 1.2, alignItems: "center", children: [_jsx(Chip, { label: role, color: "primary", variant: "outlined", size: "small" }), _jsx(Chip, { label: email ?? "unknown", size: "small" }), _jsx(Avatar, { sx: { width: 30, height: 30, fontSize: 12 }, children: (email ?? "U")[0]?.toUpperCase() }), _jsx(Button, { startIcon: _jsx(LogoutRoundedIcon, {}), onClick: logout, variant: "outlined", size: "small", children: "Logout" })] })] }), _jsx(Outlet, {})] })] }));
}
