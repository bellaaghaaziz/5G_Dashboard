import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Grid, IconButton, MenuItem, Stack, TextField, Typography, } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
const GLASS = {
    background: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 3,
};
const roles = ["admin", "network_operator", "data_scientist"];
const roleColors = {
    admin: "error", network_operator: "primary", data_scientist: "secondary",
};
function initials(name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
export function AdminPage() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "network_operator" });
    const [health, setHealth] = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);
    async function loadUsers() {
        try {
            const { data } = await api.get("/admin/users");
            setUsers(data);
            setError(null);
        }
        catch (err) {
            setError(`Failed to load users: ${err?.response?.data?.message || err?.message || "Unknown"}`);
        }
    }
    async function loadHealth() {
        setHealthLoading(true);
        try {
            const { data } = await api.get("/system/health");
            setHealth(data);
        }
        catch {
            setHealth(null);
        }
        setHealthLoading(false);
    }
    useEffect(() => {
        loadUsers();
        loadHealth();
        const id = setInterval(loadHealth, 15000);
        return () => clearInterval(id);
    }, []);
    async function createUser(e) {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await api.post("/admin/users", form);
            setForm({ email: "", fullName: "", password: "", role: "network_operator" });
            setSuccess("User created successfully!");
            await loadUsers();
        }
        catch (err) {
            setError(err?.response?.data?.message || err?.message || "Failed");
        }
    }
    const services = health?.services ?? [];
    return (_jsxs(Box, { children: [_jsx(Typography, { variant: "h4", sx: { fontWeight: 800, letterSpacing: -0.5, mb: 3 }, children: "Admin Console" }), error && _jsx(Alert, { severity: "error", sx: { mb: 2, ...GLASS, color: "#fca5a5", ".MuiAlert-icon": { color: "#ef4444" } }, children: error }), success && _jsx(Alert, { severity: "success", sx: { mb: 2, ...GLASS, color: "#86efac", ".MuiAlert-icon": { color: "#22c55e" } }, children: success }), _jsx(Card, { sx: { ...GLASS, mb: 3 }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsxs(Stack, { direction: "row", justifyContent: "space-between", alignItems: "center", sx: { mb: 2 }, children: [_jsxs(Stack, { direction: "row", spacing: 1.5, alignItems: "center", children: [_jsx(Typography, { variant: "h6", sx: { fontWeight: 700 }, children: "System Health" }), health && (_jsx(Chip, { label: health.overall, size: "small", sx: {
                                                fontWeight: 700, textTransform: "uppercase",
                                                bgcolor: health.overall === "healthy" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                                color: health.overall === "healthy" ? "#22c55e" : "#ef4444",
                                            } }))] }), _jsx(IconButton, { onClick: loadHealth, disabled: healthLoading, sx: { color: "text.secondary" }, children: _jsx(RefreshRoundedIcon, { sx: { animation: healthLoading ? "spin 1s linear infinite" : "none", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } } }) })] }), _jsxs(Grid, { container: true, spacing: 2, children: [services.map((svc) => (_jsx(Grid, { size: { xs: 6, md: 2.4 }, children: _jsxs(Box, { sx: {
                                            p: 2, borderRadius: 2,
                                            bgcolor: svc.status === "healthy" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                                            border: `1px solid ${svc.status === "healthy" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                                            transition: "all 0.3s",
                                        }, children: [_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", sx: { mb: 1 }, children: [svc.status === "healthy"
                                                        ? _jsx(CheckCircleRoundedIcon, { sx: { color: "#22c55e", fontSize: 18 } })
                                                        : _jsx(ErrorRoundedIcon, { sx: { color: "#ef4444", fontSize: 18 } }), _jsx(Typography, { variant: "body2", sx: { fontWeight: 700, fontSize: 12 }, children: svc.name })] }), _jsxs(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: [svc.responseMs, "ms"] }), svc.details?.predictions_served != null && (_jsxs(Typography, { variant: "caption", sx: { color: "text.secondary", display: "block" }, children: [svc.details.predictions_served, " predictions"] })), svc.details?.uptime_seconds != null && (_jsxs(Typography, { variant: "caption", sx: { color: "text.secondary", display: "block" }, children: ["Up ", Math.floor(svc.details.uptime_seconds / 60), "m"] }))] }) }, svc.name))), services.length === 0 && !healthLoading && (_jsx(Grid, { size: { xs: 12 }, children: _jsx(Typography, { variant: "body2", sx: { color: "text.secondary", textAlign: "center", py: 2 }, children: "Unable to fetch system health. Check service connectivity." }) }))] })] }) }), _jsxs(Grid, { container: true, spacing: 3, children: [_jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { sx: { ...GLASS }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsxs(Stack, { direction: "row", alignItems: "center", spacing: 1, sx: { mb: 3 }, children: [_jsx(PersonAddRoundedIcon, { sx: { color: "#22d3ee" } }), _jsx(Typography, { variant: "h6", sx: { fontWeight: 700 }, children: "Create User" })] }), _jsx(Box, { component: "form", onSubmit: createUser, children: _jsxs(Stack, { spacing: 2.5, children: [_jsx(TextField, { label: "Email", value: form.email, onChange: e => setForm({ ...form, email: e.target.value }), required: true, size: "small", fullWidth: true }), _jsx(TextField, { label: "Full Name", value: form.fullName, onChange: e => setForm({ ...form, fullName: e.target.value }), required: true, size: "small", fullWidth: true }), _jsx(TextField, { label: "Password", type: "password", value: form.password, onChange: e => setForm({ ...form, password: e.target.value }), required: true, size: "small", fullWidth: true }), _jsx(TextField, { select: true, label: "Role", value: form.role, onChange: e => setForm({ ...form, role: e.target.value }), size: "small", fullWidth: true, children: roles.map(role => _jsx(MenuItem, { value: role, children: role.replace("_", " ") }, role)) }), _jsx(Button, { variant: "contained", type: "submit", sx: { borderRadius: 2, fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#3b82f6)" }, children: "Create User" })] }) })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 8 }, children: _jsx(Card, { sx: { ...GLASS }, children: _jsxs(CardContent, { sx: { p: 3 }, children: [_jsxs(Typography, { variant: "h6", sx: { fontWeight: 700, mb: 2 }, children: ["Users (", users.length, ")"] }), _jsxs(Stack, { spacing: 1.5, children: [users.length === 0 && (_jsx(Typography, { variant: "body2", sx: { color: "text.secondary", py: 4, textAlign: "center" }, children: "No users found. Create one to get started." })), users.map(user => (_jsxs(Stack, { direction: "row", alignItems: "center", justifyContent: "space-between", sx: { p: 2, borderRadius: 2, background: "rgba(255,255,255,0.03)", transition: "background 0.2s", "&:hover": { background: "rgba(255,255,255,0.06)" } }, children: [_jsxs(Stack, { direction: "row", alignItems: "center", spacing: 2, children: [_jsx(Avatar, { sx: { width: 40, height: 40, background: "linear-gradient(135deg,#6366f1,#a855f7)", fontWeight: 700, fontSize: 14 }, children: initials(user.fullName || user.email) }), _jsxs(Box, { children: [_jsx(Typography, { variant: "body1", sx: { fontWeight: 600 }, children: user.fullName }), _jsx(Typography, { variant: "caption", sx: { color: "text.secondary" }, children: user.email })] })] }), _jsx(Chip, { label: user.role?.replace("_", " "), color: roleColors[user.role] ?? "default", size: "small", sx: { fontWeight: 700, textTransform: "capitalize" } })] }, user.id)))] })] }) }) })] })] }));
}
