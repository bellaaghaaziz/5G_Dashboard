import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/auth";
import { NexoLogo } from "../components";

const DEMO_USERS = [
  { label: "Admin", email: "admin@5g.local", password: "admin12345", color: "#ef4444", icon: "⚙️" },
  { label: "Operator", email: "operator@5g.local", password: "admin12345", color: "#22d3ee", icon: "📡" },
  { label: "Scientist", email: "scientist@5g.local", password: "admin12345", color: "#a855f7", icon: "🧬" },
  { label: "ML Engineer", email: "mlops@5g.local", password: "admin12345", color: "#fbbf24", icon: "🛠️" },
];

export function LoginPage() {
  const [email, setEmail] = useState("admin@5g.local");
  const [password, setPassword] = useState("admin12345");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/auth/signin", { email, password });
      setAuth(data.tokens.accessToken, data.user.role, data.user.email);
      navigate("/app");
    } catch {
      setError("Invalid credentials. Try a demo account below.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", fontFamily: "'Inter', sans-serif",
      background: "#050d1a", color: "#f1f5f9",
    }}>
      {/* ── LEFT PANEL ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "48px 64px",
        background: "linear-gradient(135deg, #050d1a 0%, #0a1628 100%)",
        position: "relative", overflow: "hidden",
      }}>
        {/* Grid background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(90deg,rgba(34,211,238,0.04) 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }} />
        {/* Glow */}
        <div style={{ position: "absolute", bottom: "-10%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(34,211,238,0.08) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "20%", right: "-5%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(168,85,247,0.06) 0%,transparent 70%)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <NexoLogo size={40} />
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }}>Nexo</span>
          <button onClick={() => navigate("/")} style={{
            marginLeft: "auto", fontSize: 13, color: "#475569", background: "none",
            border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
          }}>← Back to home</button>
        </div>

        {/* Hero text */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px",
            borderRadius: 100, border: "1px solid rgba(34,211,238,0.2)",
            background: "rgba(34,211,238,0.06)", marginBottom: 28,
            fontSize: 12, fontWeight: 600, color: "#22d3ee",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", display: "inline-block" }} />
            AI-Powered 5G Platform
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 900, lineHeight: 1.1, letterSpacing: -2, marginBottom: 20 }}>
            Intelligent Network <br />
            <span style={{ background: "linear-gradient(135deg,#22d3ee,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Operations</span>
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.8, fontSize: 15, maxWidth: 400 }}>
            Sign in to access real-time handover predictions, network topology monitoring, and AI-driven insights for your 5G infrastructure.
          </p>

          {/* Feature bullets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
            {[
              { icon: "📡", text: "Live topology map with UE movement" },
              { icon: "🧠", text: "DSO pipeline: 97.9% ROC AUC" },
              { icon: "🔁", text: "In-app model retraining & drift detection" },
              { icon: "🔐", text: "Role-based access — Operator, Scientist, Admin" },
            ].map(f => (
              <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{f.icon}</div>
                <span style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 40 }}>
          {[{ n: "200K+", l: "Samples" }, { n: "~30ms", l: "Latency" }, { n: "4-Stage", l: "Pipeline" }].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#22d3ee" }}>{s.n}</div>
              <div style={{ fontSize: 11, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div style={{
        width: "min(480px, 45%)", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "64px 56px",
        background: "#080f1e",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>Welcome back</h2>
          <p style={{ color: "#475569", fontSize: 15 }}>Sign in to your workspace</p>
        </div>

        {/* Demo Quick-Fill */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Quick Login</p>
          <div style={{ display: "flex", gap: 8 }}>
            {DEMO_USERS.map(u => (
              <button key={u.label} onClick={() => { setEmail(u.email); setPassword(u.password); setError(null); }} style={{
                flex: 1, padding: "10px 8px", borderRadius: 10,
                background: `${u.color}10`, border: `1px solid ${u.color}25`,
                color: u.color, fontWeight: 700, fontSize: 12, cursor: "pointer",
                fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = `${u.color}20`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${u.color}10`; }}>
                <span style={{ fontSize: 18 }}>{u.icon}</span>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <span style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>OR SIGN IN MANUALLY</span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginBottom: 20,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#fca5a5", fontSize: 14, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>Email Address</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>✉️</span>
              <input type="email" value={email} required
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${focusedField === "email" ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit",
                  transition: "border-color 0.2s", boxSizing: "border-box",
                  boxShadow: focusedField === "email" ? "0 0 0 3px rgba(34,211,238,0.08)" : "none",
                }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }}>Password</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔒</span>
              <input type="password" value={password} required
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${focusedField === "password" ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit",
                  transition: "border-color 0.2s", boxSizing: "border-box",
                  boxShadow: focusedField === "password" ? "0 0 0 3px rgba(34,211,238,0.08)" : "none",
                }} />
            </div>
          </div>
          <button type="submit" disabled={loading} style={{
            marginTop: 8, padding: "15px", borderRadius: 12, border: "none",
            background: loading ? "rgba(34,211,238,0.3)" : "linear-gradient(135deg,#22d3ee,#3b82f6)",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "all 0.3s", letterSpacing: 0.3,
            boxShadow: loading ? "none" : "0 4px 24px rgba(34,211,238,0.3)",
          }}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <p style={{ marginTop: 32, fontSize: 12, color: "#1e3a5f", textAlign: "center" }}>
          Secured with JWT · Role-based access control · Research Platform
        </p>
      </div>
    </div>
  );
}
