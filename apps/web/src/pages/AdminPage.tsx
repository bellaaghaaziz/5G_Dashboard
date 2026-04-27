import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";

const roles = ["admin", "network_operator", "data_scientist"];

export function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "network_operator" });

  async function loadUsers() {
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data);
      setError(null);
    } catch {
      setError("Failed to load users");
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/admin/users", form);
      setForm({ email: "", fullName: "", password: "", role: "network_operator" });
      await loadUsers();
    } catch {
      setError("Failed to create user");
    }
  }

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}><Typography variant="h4">Admin User Management</Typography></Grid>
      {error && <Grid size={{ xs: 12 }}><Alert severity="error">{error}</Alert></Grid>}

      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Create User</Typography>
            <Box component="form" onSubmit={createUser}>
              <Stack spacing={2}>
                <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <TextField label="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                <TextField label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roles.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                </TextField>
                <Button variant="contained" type="submit">Create</Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Users</Typography>
            <Stack spacing={1}>
              {users.map((user) => (
                <Box key={user.id} sx={{ border: "1px solid #ddd", borderRadius: 1, p: 1.5 }}>
                  <Typography>{user.fullName} ({user.email})</Typography>
                  <Typography variant="body2" color="text.secondary">Role: {user.role}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
