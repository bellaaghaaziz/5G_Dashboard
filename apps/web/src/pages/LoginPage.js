import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/auth";
const DEMO_USERS = [
    { label: "Admin", email: "admin@5g.local", password: "admin12345", color: "#ef4444", icon: "⚙️" },
    { label: "Operator", email: "operator@5g.local", password: "admin12345", color: "#22d3ee", icon: "📡" },
    { label: "Scientist", email: "scientist@5g.local", password: "admin12345", color: "#a855f7", icon: "🧬" },
];
export function LoginPage() {
    const [email, setEmail] = useState("admin@5g.local");
    const [password, setPassword] = useState("admin12345");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [focusedField, setFocusedField] = useState(null);
    const navigate = useNavigate();
    const { setAuth } = useAuth();
    async function onSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post("/auth/signin", { email, password });
            setAuth(data.tokens.accessToken, data.user.role, data.user.email);
            navigate("/app");
        }
        catch {
            setError("Invalid credentials. Try a demo account below.");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { style: {
            minHeight: "100vh", display: "flex", fontFamily: "'Inter', sans-serif",
            background: "#050d1a", color: "#f1f5f9",
        }, children: [_jsxs("div", { style: {
                    flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between",
                    padding: "48px 64px",
                    background: "linear-gradient(135deg, #050d1a 0%, #0a1628 100%)",
                    position: "relative", overflow: "hidden",
                }, children: [_jsx("div", { style: {
                            position: "absolute", inset: 0,
                            backgroundImage: `linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(90deg,rgba(34,211,238,0.04) 1px, transparent 1px)`,
                            backgroundSize: "50px 50px",
                        } }), _jsx("div", { style: { position: "absolute", bottom: "-10%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(34,211,238,0.08) 0%,transparent 70%)", pointerEvents: "none" } }), _jsx("div", { style: { position: "absolute", top: "20%", right: "-5%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(168,85,247,0.06) 0%,transparent 70%)", pointerEvents: "none" } }), _jsxs("div", { style: { position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }, children: [_jsx("div", { style: {
                                    width: 40, height: 40, borderRadius: 12,
                                    background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 900, fontSize: 14, color: "#fff",
                                }, children: "5G" }), _jsx("span", { style: { fontWeight: 800, fontSize: 20, letterSpacing: -0.5 }, children: "CellPilot" }), _jsx("button", { onClick: () => navigate("/"), style: {
                                    marginLeft: "auto", fontSize: 13, color: "#475569", background: "none",
                                    border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                                }, children: "\u2190 Back to home" })] }), _jsxs("div", { style: { position: "relative", zIndex: 1 }, children: [_jsxs("div", { style: {
                                    display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px",
                                    borderRadius: 100, border: "1px solid rgba(34,211,238,0.2)",
                                    background: "rgba(34,211,238,0.06)", marginBottom: 28,
                                    fontSize: 12, fontWeight: 600, color: "#22d3ee",
                                }, children: [_jsx("span", { style: { width: 5, height: 5, borderRadius: "50%", background: "#22d3ee", display: "inline-block" } }), "AI-Powered 5G Platform"] }), _jsxs("h1", { style: { fontSize: 42, fontWeight: 900, lineHeight: 1.1, letterSpacing: -2, marginBottom: 20 }, children: ["Intelligent Network ", _jsx("br", {}), _jsx("span", { style: { background: "linear-gradient(135deg,#22d3ee,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: "Operations" })] }), _jsx("p", { style: { color: "#475569", lineHeight: 1.8, fontSize: 15, maxWidth: 400 }, children: "Sign in to access real-time handover predictions, network topology monitoring, and AI-driven insights for your 5G infrastructure." }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }, children: [
                                    { icon: "📡", text: "Live topology map with UE movement" },
                                    { icon: "🧠", text: "DSO pipeline: 97.9% ROC AUC" },
                                    { icon: "🔁", text: "In-app model retraining & drift detection" },
                                    { icon: "🔐", text: "Role-based access — Operator, Scientist, Admin" },
                                ].map(f => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 14 }, children: [_jsx("div", { style: { width: 36, height: 36, borderRadius: 10, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }, children: f.icon }), _jsx("span", { style: { fontSize: 14, color: "#64748b", fontWeight: 500 }, children: f.text })] }, f.text))) })] }), _jsx("div", { style: { position: "relative", zIndex: 1, display: "flex", gap: 40 }, children: [{ n: "200K+", l: "Samples" }, { n: "~30ms", l: "Latency" }, { n: "4-Stage", l: "Pipeline" }].map(s => (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 20, fontWeight: 900, color: "#22d3ee" }, children: s.n }), _jsx("div", { style: { fontSize: 11, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }, children: s.l })] }, s.l))) })] }), _jsxs("div", { style: {
                    width: "min(480px, 45%)", display: "flex", flexDirection: "column",
                    justifyContent: "center", padding: "64px 56px",
                    background: "#080f1e",
                    borderLeft: "1px solid rgba(255,255,255,0.05)",
                }, children: [_jsxs("div", { style: { marginBottom: 40 }, children: [_jsx("h2", { style: { fontSize: 28, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }, children: "Welcome back" }), _jsx("p", { style: { color: "#475569", fontSize: 15 }, children: "Sign in to your workspace" })] }), _jsxs("div", { style: { marginBottom: 28 }, children: [_jsx("p", { style: { fontSize: 12, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }, children: "Quick Login" }), _jsx("div", { style: { display: "flex", gap: 8 }, children: DEMO_USERS.map(u => (_jsxs("button", { onClick: () => { setEmail(u.email); setPassword(u.password); setError(null); }, style: {
                                        flex: 1, padding: "10px 8px", borderRadius: 10,
                                        background: `${u.color}10`, border: `1px solid ${u.color}25`,
                                        color: u.color, fontWeight: 700, fontSize: 12, cursor: "pointer",
                                        fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                        transition: "all 0.2s",
                                    }, onMouseEnter: e => { e.currentTarget.style.background = `${u.color}20`; }, onMouseLeave: e => { e.currentTarget.style.background = `${u.color}10`; }, children: [_jsx("span", { style: { fontSize: 18 }, children: u.icon }), u.label] }, u.label))) })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }, children: [_jsx("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,0.06)" } }), _jsx("span", { style: { fontSize: 12, color: "#334155", fontWeight: 600 }, children: "OR SIGN IN MANUALLY" }), _jsx("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,0.06)" } })] }), error && (_jsxs("div", { style: {
                            padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                            color: "#fca5a5", fontSize: 14, display: "flex", alignItems: "center", gap: 8,
                        }, children: [_jsx("span", { children: "\u26A0\uFE0F" }), " ", error] })), _jsxs("form", { onSubmit: onSubmit, style: { display: "flex", flexDirection: "column", gap: 18 }, children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 13, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }, children: "Email Address" }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("span", { style: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }, children: "\u2709\uFE0F" }), _jsx("input", { type: "email", value: email, required: true, onChange: e => setEmail(e.target.value), onFocus: () => setFocusedField("email"), onBlur: () => setFocusedField(null), style: {
                                                    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
                                                    background: "rgba(255,255,255,0.04)",
                                                    border: `1px solid ${focusedField === "email" ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.08)"}`,
                                                    color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit",
                                                    transition: "border-color 0.2s", boxSizing: "border-box",
                                                    boxShadow: focusedField === "email" ? "0 0 0 3px rgba(34,211,238,0.08)" : "none",
                                                } })] })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 13, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 8 }, children: "Password" }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("span", { style: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }, children: "\uD83D\uDD12" }), _jsx("input", { type: "password", value: password, required: true, onChange: e => setPassword(e.target.value), onFocus: () => setFocusedField("password"), onBlur: () => setFocusedField(null), style: {
                                                    width: "100%", padding: "13px 14px 13px 42px", borderRadius: 12,
                                                    background: "rgba(255,255,255,0.04)",
                                                    border: `1px solid ${focusedField === "password" ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.08)"}`,
                                                    color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "inherit",
                                                    transition: "border-color 0.2s", boxSizing: "border-box",
                                                    boxShadow: focusedField === "password" ? "0 0 0 3px rgba(34,211,238,0.08)" : "none",
                                                } })] })] }), _jsx("button", { type: "submit", disabled: loading, style: {
                                    marginTop: 8, padding: "15px", borderRadius: 12, border: "none",
                                    background: loading ? "rgba(34,211,238,0.3)" : "linear-gradient(135deg,#22d3ee,#3b82f6)",
                                    color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
                                    fontFamily: "inherit", transition: "all 0.3s", letterSpacing: 0.3,
                                    boxShadow: loading ? "none" : "0 4px 24px rgba(34,211,238,0.3)",
                                }, children: loading ? "Signing in…" : "Sign In →" })] }), _jsx("p", { style: { marginTop: 32, fontSize: 12, color: "#1e3a5f", textAlign: "center" }, children: "Secured with JWT \u00B7 Role-based access control \u00B7 Research Platform" })] })] }));
}
