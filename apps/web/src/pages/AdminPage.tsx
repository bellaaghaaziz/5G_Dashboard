import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, Grid,
  IconButton, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";

const GLASS = {
  background: "rgba(15, 23, 42, 0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 3,
};

const roles = ["admin", "network_operator", "data_scientist"];
const roleColors: Record<string, "error" | "primary" | "secondary"> = {
  admin: "error", network_operator: "primary", data_scientist: "secondary",
};

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "network_operator" });
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  async function loadUsers() {
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load users: ${err?.response?.data?.message || err?.message || "Unknown"}`);
    }
  }

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const { data } = await api.get("/system/health");
      setHealth(data);
    } catch {
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

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      await api.post("/admin/users", form);
      setForm({ email: "", fullName: "", password: "", role: "network_operator" });
      setSuccess("User created successfully!");
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed");
    }
  }

  const services = health?.services ?? [];

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5, mb: 3 }}>Admin Console</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, ...GLASS, color: "#fca5a5", ".MuiAlert-icon": { color: "#ef4444" } }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, ...GLASS, color: "#86efac", ".MuiAlert-icon": { color: "#22c55e" } }}>{success}</Alert>}

      {/* System Health */}
      <Card sx={{ ...GLASS, mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>System Health</Typography>
              {health && (
                <Chip
                  label={health.overall}
                  size="small"
                  sx={{
                    fontWeight: 700, textTransform: "uppercase",
                    bgcolor: health.overall === "healthy" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: health.overall === "healthy" ? "#22c55e" : "#ef4444",
                  }}
                />
              )}
            </Stack>
            <IconButton onClick={loadHealth} disabled={healthLoading} sx={{ color: "text.secondary" }}>
              <RefreshRoundedIcon sx={{ animation: healthLoading ? "spin 1s linear infinite" : "none", "@keyframes spin": { "100%": { transform: "rotate(360deg)" } } }} />
            </IconButton>
          </Stack>
          <Grid container spacing={2}>
            {services.map((svc: any) => (
              <Grid size={{ xs: 6, md: 2.4 }} key={svc.name}>
                <Box sx={{
                  p: 2, borderRadius: 2,
                  bgcolor: svc.status === "healthy" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${svc.status === "healthy" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                  transition: "all 0.3s",
                }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    {svc.status === "healthy"
                      ? <CheckCircleRoundedIcon sx={{ color: "#22c55e", fontSize: 18 }} />
                      : <ErrorRoundedIcon sx={{ color: "#ef4444", fontSize: 18 }} />}
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 12 }}>{svc.name}</Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {svc.responseMs}ms
                  </Typography>
                  {svc.details?.predictions_served != null && (
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                      {svc.details.predictions_served} predictions
                    </Typography>
                  )}
                  {svc.details?.uptime_seconds != null && (
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                      Up {Math.floor(svc.details.uptime_seconds / 60)}m
                    </Typography>
                  )}
                </Box>
              </Grid>
            ))}
            {services.length === 0 && !healthLoading && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 2 }}>
                  Unable to fetch system health. Check service connectivity.
                </Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* User Management */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ ...GLASS }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
                <PersonAddRoundedIcon sx={{ color: "#22d3ee" }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Create User</Typography>
              </Stack>
              <Box component="form" onSubmit={createUser}>
                <Stack spacing={2.5}>
                  <TextField label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required size="small" fullWidth />
                  <TextField label="Full Name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required size="small" fullWidth />
                  <TextField label="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required size="small" fullWidth />
                  <TextField select label="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} size="small" fullWidth>
                    {roles.map(role => <MenuItem key={role} value={role}>{role.replace("_", " ")}</MenuItem>)}
                  </TextField>
                  <Button variant="contained" type="submit" sx={{ borderRadius: 2, fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#3b82f6)" }}>
                    Create User
                  </Button>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card sx={{ ...GLASS }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Users ({users.length})</Typography>
              <Stack spacing={1.5}>
                {users.length === 0 && (
                  <Typography variant="body2" sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>
                    No users found. Create one to get started.
                  </Typography>
                )}
                {users.map(user => (
                  <Stack key={user.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, borderRadius: 2, background: "rgba(255,255,255,0.03)", transition: "background 0.2s", "&:hover": { background: "rgba(255,255,255,0.06)" } }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Avatar sx={{ width: 40, height: 40, background: "linear-gradient(135deg,#6366f1,#a855f7)", fontWeight: 700, fontSize: 14 }}>
                        {initials(user.fullName || user.email)}
                      </Avatar>
                      <Box>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>{user.fullName}</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>{user.email}</Typography>
                      </Box>
                    </Stack>
                    <Chip label={user.role?.replace("_", " ")} color={roleColors[user.role] ?? "default"} size="small" sx={{ fontWeight: 700, textTransform: "capitalize" }} />
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
