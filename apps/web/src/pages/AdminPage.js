import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
const roles = ["admin", "network_operator", "data_scientist"];
export function AdminPage() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "network_operator" });
    async function loadUsers() {
        try {
            const { data } = await api.get("/admin/users");
            setUsers(data);
            setError(null);
        }
        catch {
            setError("Failed to load users");
        }
    }
    useEffect(() => {
        loadUsers();
    }, []);
    async function createUser(e) {
        e.preventDefault();
        try {
            await api.post("/admin/users", form);
            setForm({ email: "", fullName: "", password: "", role: "network_operator" });
            await loadUsers();
        }
        catch {
            setError("Failed to create user");
        }
    }
    return (_jsxs(Grid, { container: true, spacing: 2, children: [_jsx(Grid, { size: { xs: 12 }, children: _jsx(Typography, { variant: "h4", children: "Admin User Management" }) }), error && _jsx(Grid, { size: { xs: 12 }, children: _jsx(Alert, { severity: "error", children: error }) }), _jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", sx: { mb: 2 }, children: "Create User" }), _jsx(Box, { component: "form", onSubmit: createUser, children: _jsxs(Stack, { spacing: 2, children: [_jsx(TextField, { label: "Email", value: form.email, onChange: (e) => setForm({ ...form, email: e.target.value }), required: true }), _jsx(TextField, { label: "Full Name", value: form.fullName, onChange: (e) => setForm({ ...form, fullName: e.target.value }), required: true }), _jsx(TextField, { label: "Password", type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }), required: true }), _jsx(TextField, { select: true, label: "Role", value: form.role, onChange: (e) => setForm({ ...form, role: e.target.value }), children: roles.map((role) => _jsx(MenuItem, { value: role, children: role }, role)) }), _jsx(Button, { variant: "contained", type: "submit", children: "Create" })] }) })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 8 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", sx: { mb: 2 }, children: "Users" }), _jsx(Stack, { spacing: 1, children: users.map((user) => (_jsxs(Box, { sx: { border: "1px solid #ddd", borderRadius: 1, p: 1.5 }, children: [_jsxs(Typography, { children: [user.fullName, " (", user.email, ")"] }), _jsxs(Typography, { variant: "body2", color: "text.secondary", children: ["Role: ", user.role] })] }, user.id))) })] }) }) })] }));
}
