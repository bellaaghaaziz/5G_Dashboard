import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/auth";
import { AdminPage } from "./pages/AdminPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { Layout } from "./pages/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OperatorPage } from "./pages/OperatorPage";
import { HandoverHistoryPage } from "./pages/HandoverHistoryPage";
import { ScientistPage } from "./pages/ScientistPage";
const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: "#22d3ee" },
        secondary: { main: "#a855f7" },
        warning: { main: "#f59e0b" },
        error: { main: "#ef4444" },
        success: { main: "#22c55e" },
        background: { default: "#050d1a", paper: "#0d1b2e" },
        text: { primary: "#f1f5f9", secondary: "#64748b" },
        divider: "rgba(148,163,184,0.08)",
    },
    shape: { borderRadius: 14 },
    typography: {
        fontFamily: `"Inter", "Segoe UI", "Roboto", sans-serif`,
        h3: { fontWeight: 900 },
        h4: { fontWeight: 800 },
        h5: { fontWeight: 700 },
        h6: { fontWeight: 600 },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    background: "#050d1a",
                    backgroundImage: "radial-gradient(ellipse at 20% 10%, rgba(34,211,238,0.04) 0%, transparent 50%), radial-gradient(ellipse at 80% 90%, rgba(168,85,247,0.04) 0%, transparent 50%)",
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: "none",
                    backgroundColor: "rgba(13,27,46,0.8)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(148,163,184,0.08)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                },
            },
        },
        MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 700, borderRadius: 10 } } },
        MuiTextField: {
            styleOverrides: {
                root: {
                    "& .MuiOutlinedInput-root": {
                        borderRadius: 10,
                        "& fieldset": { borderColor: "rgba(148,163,184,0.15)" },
                        "&:hover fieldset": { borderColor: "rgba(148,163,184,0.3)" },
                        "&.Mui-focused fieldset": { borderColor: "#22d3ee" },
                    },
                },
            },
        },
        MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
        MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
        MuiLinearProgress: { styleOverrides: { root: { borderRadius: 8 } } },
    },
});
function RoleRedirect() {
    const { token, role } = useAuth();
    if (!token || !role)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (role === "admin")
        return _jsx(Navigate, { to: "/app/admin", replace: true });
    if (role === "network_operator")
        return _jsx(Navigate, { to: "/app/operator", replace: true });
    return _jsx(Navigate, { to: "/app/scientist", replace: true });
}
export default function App() {
    return (_jsxs(ThemeProvider, { theme: theme, children: [_jsx(CssBaseline, {}), _jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LandingPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { path: "/app", element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(RoleRedirect, {}) }), _jsx(Route, { path: "home", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "network_operator", "data_scientist"], children: _jsx(HomePage, {}) }) }), _jsx(Route, { path: "admin", element: _jsx(ProtectedRoute, { allowedRoles: ["admin"], children: _jsx(AdminPage, {}) }) }), _jsx(Route, { path: "operator", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "network_operator"], children: _jsx(OperatorPage, {}) }) }), _jsx(Route, { path: "operator/handovers", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "network_operator"], children: _jsx(HandoverHistoryPage, {}) }) }), _jsx(Route, { path: "scientist", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "data_scientist"], children: _jsx(ScientistPage, {}) }) })] })] }) }) })] }));
}
