import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Alert, Box, Button, Container, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/auth";
export function LoginPage() {
    const [email, setEmail] = useState("admin@5g.local");
    const [password, setPassword] = useState("admin12345");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { setAuth } = useAuth();
    async function onSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post("/auth/signin", { email, password });
            setAuth(data.tokens.accessToken, data.user.role, data.user.email);
            navigate("/");
        }
        catch {
            setError("Sign in failed. Check credentials or seed users first.");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs(Container, { maxWidth: "sm", sx: { mt: 10 }, children: [_jsx(Typography, { variant: "h4", gutterBottom: true, children: "AI Handover Platform Login" }), _jsx(Typography, { variant: "body2", sx: { mb: 3 }, children: "Sign in as Admin, Network Operator, or Data Scientist." }), _jsx(Box, { component: "form", onSubmit: onSubmit, children: _jsxs(Stack, { spacing: 2, children: [error && _jsx(Alert, { severity: "error", children: error }), _jsx(TextField, { label: "Email", value: email, onChange: (e) => setEmail(e.target.value), fullWidth: true }), _jsx(TextField, { label: "Password", type: "password", value: password, onChange: (e) => setPassword(e.target.value), fullWidth: true }), _jsx(Button, { type: "submit", variant: "contained", disabled: loading, children: loading ? "Signing in..." : "Sign in" })] }) })] }));
}
