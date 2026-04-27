import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, CardContent, Grid, Typography } from "@mui/material";
import { useAuth } from "../context/auth";
export function HomePage() {
    const { role } = useAuth();
    return (_jsxs(Grid, { container: true, spacing: 2, children: [_jsxs(Grid, { size: { xs: 12 }, children: [_jsx(Typography, { variant: "h4", children: "Welcome" }), _jsxs(Typography, { variant: "body1", sx: { mb: 2 }, children: ["Current role: ", role] })] }), _jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", children: "Admin" }), _jsx(Typography, { children: "User lifecycle, roles, and access control." })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", children: "Network Operator" }), _jsx(Typography, { children: "Live map, risk stream, and handover actions." })] }) }) }), _jsx(Grid, { size: { xs: 12, md: 4 }, children: _jsx(Card, { children: _jsxs(CardContent, { children: [_jsx(Typography, { variant: "h6", children: "Data Scientist" }), _jsx(Typography, { children: "Model KPIs and experiment snapshots." })] }) }) })] }));
}
