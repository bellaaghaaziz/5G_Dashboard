import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import { Avatar, Box, Chip, Divider, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
export function Layout() {
    const { role, email, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const navSections = [
        {
            label: "Workspace",
            items: [
                { label: "Home", to: "/app/home", icon: _jsx(HomeRoundedIcon, {}), show: true },
                { label: "Operator", to: "/app/operator", icon: _jsx(MapRoundedIcon, {}), show: role === "network_operator" || role === "admin" },
                { label: "Data Scientist", to: "/app/scientist", icon: _jsx(ScienceRoundedIcon, {}), show: role === "data_scientist" || role === "admin" },
                { label: "Admin", to: "/app/admin", icon: _jsx(AdminPanelSettingsRoundedIcon, {}), show: role === "admin" },
            ],
        },
        {
            label: "Analytics",
            items: [
                { label: "Live Metrics", to: "/app/operator", icon: _jsx(AnalyticsRoundedIcon, {}), show: true },
                { label: "Handover History", to: "/app/operator/handovers", icon: _jsx(HistoryRoundedIcon, {}), show: role === "network_operator" || role === "admin" },
            ],
        },
    ];
    const currentLabel = navSections.flatMap(s => s.items).find(n => location.pathname.startsWith(n.to))?.label ?? "Dashboard";
    const roleConfig = {
        admin: { label: "Admin", color: "#ef4444" },
        network_operator: { label: "Operator", color: "#22d3ee" },
        data_scientist: { label: "Scientist", color: "#a855f7" },
    };
    const rc = roleConfig[role ?? ""] ?? { label: role ?? "", color: "#94a3b8" };
    function handleLogout() {
        logout();
        navigate("/");
    }
    return (_jsxs(Box, { sx: { minHeight: "100vh", display: "flex", background: "#050d1a" }, children: [_jsxs(Box, { sx: {
                    width: 260, flexShrink: 0,
                    background: "rgba(8,15,30,0.95)",
                    borderRight: "1px solid rgba(255,255,255,0.05)",
                    display: "flex", flexDirection: "column",
                    position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50,
                    backdropFilter: "blur(20px)",
                }, children: [_jsx(Box, { sx: { p: 3, pb: 2, borderBottom: "1px solid rgba(255,255,255,0.04)" }, children: _jsxs(Stack, { direction: "row", alignItems: "center", spacing: 1.5, children: [_jsx(Box, { sx: {
                                        width: 38, height: 38, borderRadius: "11px",
                                        background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "#fff", fontWeight: 900, fontSize: 13, flexShrink: 0,
                                        boxShadow: "0 4px 16px rgba(34,211,238,0.3)",
                                    }, children: "5G" }), _jsxs(Box, { children: [_jsx(Typography, { sx: { fontWeight: 900, fontSize: 17, lineHeight: 1, letterSpacing: -0.5 }, children: "CellPilot" }), _jsx(Typography, { sx: { fontSize: 10, color: "#334155", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", mt: 0.3 }, children: "5G Platform" })] })] }) }), _jsx(Box, { sx: { px: 3, py: 1.5 }, children: _jsxs(Box, { sx: { display: "flex", alignItems: "center", gap: 1.5, p: "10px 14px", borderRadius: 2, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }, children: [_jsx(Box, { sx: { width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", animation: "pulse 2s infinite", "@keyframes pulse": { "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.6)" }, "70%": { boxShadow: "0 0 0 5px rgba(34,197,94,0)" }, "100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0)" } } } }), _jsxs(Box, { children: [_jsx(Typography, { sx: { fontSize: 11, fontWeight: 700, color: "#22c55e", lineHeight: 1 }, children: "LIVE DATA STREAMING" }), _jsx(Typography, { sx: { fontSize: 10, color: "#164e13", fontWeight: 500, mt: 0.2 }, children: "DSO Pipeline Active" })] }), _jsx(SignalCellularAltRoundedIcon, { sx: { ml: "auto", color: "#22c55e", fontSize: 16 } })] }) }), _jsx(Box, { sx: { flex: 1, overflowY: "auto", px: 2, py: 1 }, children: navSections.map(sec => (_jsxs(Box, { sx: { mb: 3 }, children: [_jsx(Typography, { sx: { fontSize: 10, fontWeight: 700, color: "#1e3a5f", letterSpacing: 2, textTransform: "uppercase", px: 1, mb: 1 }, children: sec.label }), _jsx(Stack, { spacing: 0.5, children: sec.items.filter(i => i.show).map(item => {
                                        const active = location.pathname.startsWith(item.to);
                                        return (_jsx(Link, { to: item.to, style: { textDecoration: "none" }, children: _jsxs(Box, { sx: {
                                                    display: "flex", alignItems: "center", gap: 1.5,
                                                    px: 2, py: 1.3, borderRadius: 2,
                                                    background: active ? "rgba(34,211,238,0.12)" : "transparent",
                                                    border: active ? "1px solid rgba(34,211,238,0.2)" : "1px solid transparent",
                                                    color: active ? "#22d3ee" : "#475569",
                                                    transition: "all 0.2s",
                                                    "&:hover": { background: active ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: active ? "#22d3ee" : "#94a3b8" },
                                                    cursor: "pointer",
                                                }, children: [_jsx(Box, { sx: { "& .MuiSvgIcon-root": { fontSize: 18 }, color: active ? "#22d3ee" : "#334155", flexShrink: 0 }, children: item.icon }), _jsx(Typography, { sx: { fontSize: 14, fontWeight: active ? 700 : 500, color: "inherit" }, children: item.label }), active && _jsx(Box, { sx: { ml: "auto", width: 6, height: 6, borderRadius: "50%", bgcolor: "#22d3ee" } })] }) }, item.to));
                                    }) })] }, sec.label))) }), _jsx(Box, { sx: { p: 2, borderTop: "1px solid rgba(255,255,255,0.04)" }, children: _jsxs(Stack, { direction: "row", spacing: 1.5, alignItems: "center", children: [_jsx(Avatar, { src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`, sx: { width: 36, height: 36, border: "2px solid rgba(34,211,238,0.2)" } }), _jsxs(Box, { sx: { flex: 1, minWidth: 0 }, children: [_jsx(Typography, { sx: { fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: email?.split("@")[0] ?? "User" }), _jsx(Chip, { label: rc.label, size: "small", sx: { height: 18, fontSize: 10, fontWeight: 700, bgcolor: `${rc.color}18`, color: rc.color, border: `1px solid ${rc.color}30`, mt: 0.3 } })] }), _jsx(Tooltip, { title: "Sign out", children: _jsx(IconButton, { onClick: handleLogout, size: "small", sx: { color: "#1e3a5f", "&:hover": { color: "#ef4444", bgcolor: "rgba(239,68,68,0.08)" } }, children: _jsx(LogoutRoundedIcon, { fontSize: "small" }) }) })] }) })] }), _jsxs(Box, { sx: { flex: 1, ml: "260px", display: "flex", flexDirection: "column", minHeight: "100vh" }, children: [_jsxs(Box, { sx: {
                            position: "sticky", top: 0, zIndex: 40,
                            px: 4, py: 1.8,
                            background: "rgba(5,13,26,0.85)", backdropFilter: "blur(20px)",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                        }, children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", children: [_jsx(Typography, { sx: { fontSize: 13, color: "#334155", fontWeight: 500 }, children: "CellPilot" }), _jsx(Typography, { sx: { fontSize: 13, color: "#1e3a5f" }, children: "\u203A" }), _jsx(Typography, { sx: { fontSize: 13, color: "#94a3b8", fontWeight: 600 }, children: currentLabel })] }), _jsxs(Stack, { direction: "row", spacing: 2, alignItems: "center", children: [_jsxs(Box, { sx: { display: "flex", alignItems: "center", gap: 1, px: 2, py: 0.7, borderRadius: 2, bgcolor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.12)" }, children: [_jsx(Box, { sx: { width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e" } }), _jsx(Typography, { sx: { fontSize: 11, fontWeight: 700, color: "#22c55e" }, children: "LIVE" })] }), _jsx(Divider, { orientation: "vertical", flexItem: true, sx: { borderColor: "rgba(255,255,255,0.06)", my: 0.5 } }), _jsx(Typography, { sx: { fontSize: 13, color: "#334155" }, children: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })] })] }), _jsx(Box, { sx: { flex: 1, p: 4 }, children: _jsx(Outlet, {}) })] })] }));
}
