import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import CellTowerRoundedIcon from "@mui/icons-material/CellTowerRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import { Box, Card, CardActionArea, CardContent, Grid, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
const GLASS = {
    background: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 3,
};
const sections = [
    {
        title: "Network Operations",
        desc: "Monitor live 5G signal risk, view handover recommendations on the topology map, and take action in real-time.",
        icon: _jsx(CellTowerRoundedIcon, { sx: { fontSize: 36 } }),
        gradient: "linear-gradient(135deg, #22d3ee, #3b82f6)",
        shadow: "rgba(34,211,238,0.3)",
        path: "/app/operator",
    },
    {
        title: "Intelligence Lab",
        desc: "Analyze model performance metrics, review training experiments, and understand the DSO pipeline accuracy.",
        icon: _jsx(ScienceRoundedIcon, { sx: { fontSize: 36 } }),
        gradient: "linear-gradient(135deg, #a855f7, #6366f1)",
        shadow: "rgba(168,85,247,0.3)",
        path: "/app/scientist",
    },
    {
        title: "Admin Console",
        desc: "Manage system users, assign roles (operator, scientist, admin), and control platform access.",
        icon: _jsx(AdminPanelSettingsRoundedIcon, { sx: { fontSize: 36 } }),
        gradient: "linear-gradient(135deg, #f59e0b, #ef4444)",
        shadow: "rgba(245,158,11,0.3)",
        path: "/app/admin",
    },
];
export function HomePage() {
    const { role } = useAuth();
    const navigate = useNavigate();
    return (_jsxs(Box, { children: [_jsxs(Box, { sx: { mb: 5 }, children: [_jsx(Typography, { variant: "h3", sx: {
                            fontWeight: 900,
                            letterSpacing: -1,
                            background: "linear-gradient(135deg, #22d3ee, #a855f7)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            mb: 1,
                        }, children: "5G Handover AI" }), _jsxs(Typography, { variant: "h6", sx: { color: "text.secondary", fontWeight: 400, maxWidth: 600 }, children: ["Welcome back! You are logged in as", " ", _jsx(Box, { component: "span", sx: { fontWeight: 700, color: "primary.main" }, children: role?.replace("_", " ") ?? "user" }), ". Select a module below to get started."] })] }), _jsx(Grid, { container: true, spacing: 3, children: sections.map((s) => (_jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { sx: {
                            ...GLASS,
                            height: "100%",
                            transition: "transform 0.25s ease, box-shadow 0.25s ease",
                            "&:hover": {
                                transform: "translateY(-6px)",
                                boxShadow: `0 12px 40px ${s.shadow}`,
                            },
                        }, children: _jsx(CardActionArea, { onClick: () => navigate(s.path), sx: { height: "100%" }, children: _jsxs(CardContent, { sx: { p: 3.5 }, children: [_jsx(Box, { sx: {
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
                                        }, children: s.icon }), _jsx(Typography, { variant: "h5", sx: { fontWeight: 800, mb: 1 }, children: s.title }), _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", lineHeight: 1.7 }, children: s.desc })] }) }) }) }, s.title))) })] }));
}
