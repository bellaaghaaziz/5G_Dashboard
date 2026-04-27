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
    mode: "light",
    primary: { main: "#FFC107" }, // Orange accent
    secondary: { main: "#1a1a1a" }, // Dark secondary
    background: {
      default: "#f4f7f7", // Light gray background
      paper: "#ffffff",   // White cards
    },
    text: {
      primary: "#1a1a1a",
      secondary: "#6c757d",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: `"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif`,
    h5: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          border: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
  },
});

function RoleRedirect() {
  const { token, role } = useAuth();
  if (!token || !role) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "network_operator") return <Navigate to="/operator" replace />;
  return <Navigate to="/scientist" replace />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<RoleRedirect />} />
              <Route
                path="home"
                element={
                  <ProtectedRoute allowedRoles={["admin", "network_operator", "data_scientist"]}>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="operator"
                element={
                  <ProtectedRoute allowedRoles={["admin", "network_operator"]}>
                    <OperatorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="scientist"
                element={
                  <ProtectedRoute allowedRoles={["admin", "data_scientist"]}>
                    <ScientistPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
