import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/auth";
import { AdminPage } from "./pages/AdminPage";
import { HomePage } from "./pages/HomePage";
import { Layout } from "./pages/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OperatorPage } from "./pages/OperatorPage";
import { ScientistPage } from "./pages/ScientistPage";
const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: "#3b82f6" },
        secondary: { main: "#22d3ee" },
        background: {
            default: "#0a0f1c",
            paper: "#121a2b",
        },
        text: {
            primary: "#e6edf9",
            secondary: "#9fb0d0",
        },
    },
    shape: {
        borderRadius: 14,
    },
    typography: {
        fontFamily: `"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif`,
    },
});
function RoleRedirect() {
    const { token, role } = useAuth();
    if (!token || !role)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (role === "admin")
        return _jsx(Navigate, { to: "/admin", replace: true });
    if (role === "network_operator")
        return _jsx(Navigate, { to: "/operator", replace: true });
    return _jsx(Navigate, { to: "/scientist", replace: true });
}
export default function App() {
    return (_jsxs(ThemeProvider, { theme: theme, children: [_jsx(CssBaseline, {}), _jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { path: "/", element: _jsx(Layout, {}), children: [_jsx(Route, { index: true, element: _jsx(RoleRedirect, {}) }), _jsx(Route, { path: "home", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "network_operator", "data_scientist"], children: _jsx(HomePage, {}) }) }), _jsx(Route, { path: "admin", element: _jsx(ProtectedRoute, { allowedRoles: ["admin"], children: _jsx(AdminPage, {}) }) }), _jsx(Route, { path: "operator", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "network_operator"], children: _jsx(OperatorPage, {}) }) }), _jsx(Route, { path: "scientist", element: _jsx(ProtectedRoute, { allowedRoles: ["admin", "data_scientist"], children: _jsx(ScientistPage, {}) }) })] })] }) }) })] }));
}
