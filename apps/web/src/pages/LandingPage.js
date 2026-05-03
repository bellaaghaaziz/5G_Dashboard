import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
export function LandingPage() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    return (_jsxs("div", { style: { background: "#050d1a", color: "#f1f5f9", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }, children: [_jsxs("nav", { style: {
                    position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
                    padding: "0 48px", height: 68,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: scrolled ? "rgba(5,13,26,0.92)" : "transparent",
                    backdropFilter: scrolled ? "blur(20px)" : "none",
                    borderBottom: scrolled ? "1px solid rgba(34,211,238,0.1)" : "none",
                    transition: "all 0.3s ease",
                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: {
                                    width: 36, height: 36, borderRadius: 10,
                                    background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 900, fontSize: 13, color: "#fff",
                                }, children: "5G" }), _jsx("span", { style: { fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }, children: "CellPilot" })] }), _jsx("div", { style: { display: "flex", gap: 36, fontSize: 14, fontWeight: 500, color: "#94a3b8" }, children: ["Features", "About", "Contact"].map(l => (_jsx("a", { href: `#${l.toLowerCase()}`, style: { color: "inherit", textDecoration: "none", transition: "color 0.2s" }, onMouseEnter: e => (e.currentTarget.style.color = "#22d3ee"), onMouseLeave: e => (e.currentTarget.style.color = "#94a3b8"), children: l }, l))) }), _jsx("button", { onClick: () => navigate("/login"), style: {
                            padding: "9px 22px", borderRadius: 8, border: "1px solid rgba(34,211,238,0.4)",
                            background: "rgba(34,211,238,0.08)", color: "#22d3ee",
                            fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s",
                            fontFamily: "inherit",
                        }, onMouseEnter: e => { e.currentTarget.style.background = "rgba(34,211,238,0.18)"; }, onMouseLeave: e => { e.currentTarget.style.background = "rgba(34,211,238,0.08)"; }, children: "Sign In \u2192" })] }), _jsxs("section", { style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "120px 24px 80px" }, children: [_jsx("div", { style: {
                            position: "absolute", inset: 0, zIndex: 0,
                            backgroundImage: `
            linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)`,
                            backgroundSize: "60px 60px",
                        } }), _jsx("div", { style: { position: "absolute", top: "15%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 70%)", pointerEvents: "none" } }), _jsx("div", { style: { position: "absolute", bottom: "15%", right: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.07) 0%, transparent 70%)", pointerEvents: "none" } }), _jsxs("div", { style: { position: "relative", zIndex: 1, textAlign: "center", maxWidth: 820 }, children: [_jsxs("div", { style: {
                                    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px",
                                    borderRadius: 100, border: "1px solid rgba(34,211,238,0.25)",
                                    background: "rgba(34,211,238,0.06)", marginBottom: 32,
                                    fontSize: 13, fontWeight: 600, color: "#22d3ee",
                                }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", display: "inline-block", animation: "pulse 2s infinite" } }), "Live AI-Powered 5G Network Intelligence"] }), _jsxs("h1", { style: {
                                    fontSize: "clamp(42px,6vw,80px)", fontWeight: 900, lineHeight: 1.08,
                                    letterSpacing: -2, marginBottom: 24,
                                }, children: [_jsx("span", { style: { background: "linear-gradient(135deg,#f1f5f9,#94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: "The Intelligence Layer" }), _jsx("br", {}), _jsx("span", { style: { background: "linear-gradient(135deg,#22d3ee,#3b82f6,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: "for 5G Networks" })] }), _jsx("p", { style: { fontSize: 19, color: "#64748b", lineHeight: 1.75, maxWidth: 620, margin: "0 auto 48px", fontWeight: 400 }, children: "Real-time handover prediction, network state profiling, and automated decision-making powered by a four-stage DSO machine learning pipeline." }), _jsxs("div", { style: { display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }, children: [_jsx("button", { onClick: () => navigate("/login"), style: {
                                            padding: "15px 36px", borderRadius: 12, border: "none",
                                            background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
                                            color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer",
                                            boxShadow: "0 0 40px rgba(34,211,238,0.3)", transition: "all 0.3s",
                                            fontFamily: "inherit",
                                        }, onMouseEnter: e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(34,211,238,0.45)"; }, onMouseLeave: e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(34,211,238,0.3)"; }, children: "Launch Dashboard" }), _jsx("a", { href: "#about", style: {
                                            padding: "15px 36px", borderRadius: 12,
                                            border: "1px solid rgba(148,163,184,0.2)",
                                            background: "rgba(255,255,255,0.03)", color: "#94a3b8",
                                            fontWeight: 600, fontSize: 16, cursor: "pointer", textDecoration: "none",
                                            display: "flex", alignItems: "center", transition: "all 0.3s",
                                        }, onMouseEnter: e => { e.currentTarget.style.color = "#f1f5f9"; e.currentTarget.style.borderColor = "rgba(148,163,184,0.4)"; }, onMouseLeave: e => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "rgba(148,163,184,0.2)"; }, children: "Learn More \u2193" })] }), _jsx("div", { style: { display: "flex", gap: 48, justifyContent: "center", marginTop: 72, flexWrap: "wrap" }, children: [
                                    { n: "97.9%", l: "DSO4 ROC AUC" },
                                    { n: "~30ms", l: "Inference Latency" },
                                    { n: "200K+", l: "Training Samples" },
                                    { n: "4-Stage", l: "DSO Pipeline" },
                                ].map(s => (_jsxs("div", { style: { textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 28, fontWeight: 900, background: "linear-gradient(135deg,#22d3ee,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: s.n }), _jsx("div", { style: { fontSize: 12, color: "#475569", fontWeight: 600, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }, children: s.l })] }, s.l))) })] })] }), _jsx("section", { id: "features", style: { padding: "120px 48px" }, children: _jsxs("div", { style: { maxWidth: 1100, margin: "0 auto" }, children: [_jsxs("div", { style: { textAlign: "center", marginBottom: 72 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#22d3ee", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }, children: "Platform Features" }), _jsxs("h2", { style: { fontSize: 44, fontWeight: 900, letterSpacing: -1.5, marginBottom: 16 }, children: ["Built for ", _jsx("span", { style: { background: "linear-gradient(135deg,#22d3ee,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: "Telecom Professionals" })] }), _jsx("p", { style: { color: "#64748b", fontSize: 17, maxWidth: 520, margin: "0 auto" }, children: "Three dedicated workspaces for every role in the network operations team." })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }, children: [
                                {
                                    icon: "📡", title: "Network Operations Center",
                                    desc: "Live 5G topology map with real-time UE movement, congestion pulsing, handover recommendations, and playback controls.",
                                    tags: ["Live Map", "HO Alerts", "Replay"],
                                    color: "#22d3ee",
                                },
                                {
                                    icon: "🧬", title: "Intelligence Lab",
                                    desc: "Full DSO pipeline metrics, in-app model retraining with live progress, and PSI-based data drift detection.",
                                    tags: ["AUC 0.979", "Live Retrain", "Drift PSI"],
                                    color: "#a855f7",
                                },
                                {
                                    icon: "⚙️", title: "Admin Console",
                                    desc: "Service health monitoring for all microservices, user management with role-based access, and system diagnostics.",
                                    tags: ["RBAC", "Health Checks", "User Mgmt"],
                                    color: "#f59e0b",
                                },
                            ].map(f => (_jsxs("div", { style: {
                                    padding: 32, borderRadius: 20,
                                    background: "rgba(15,23,42,0.6)",
                                    border: `1px solid ${f.color}22`,
                                    backdropFilter: "blur(16px)",
                                    transition: "all 0.3s", cursor: "default",
                                }, onMouseEnter: e => { e.currentTarget.style.border = `1px solid ${f.color}55`; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 20px 60px ${f.color}15`; }, onMouseLeave: e => { e.currentTarget.style.border = `1px solid ${f.color}22`; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }, children: [_jsx("div", { style: { fontSize: 36, marginBottom: 20 }, children: f.icon }), _jsx("h3", { style: { fontSize: 20, fontWeight: 800, marginBottom: 12 }, children: f.title }), _jsx("p", { style: { color: "#64748b", lineHeight: 1.7, fontSize: 15, marginBottom: 20 }, children: f.desc }), _jsx("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: f.tags.map(t => (_jsx("span", { style: {
                                                padding: "4px 12px", borderRadius: 100, fontSize: 11, fontWeight: 700,
                                                background: `${f.color}15`, color: f.color,
                                                border: `1px solid ${f.color}30`,
                                            }, children: t }, t))) })] }, f.title))) })] }) }), _jsx("section", { style: { padding: "80px 48px", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }, children: _jsxs("div", { style: { maxWidth: 1100, margin: "0 auto", textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#a855f7", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }, children: "AI Pipeline" }), _jsx("h2", { style: { fontSize: 38, fontWeight: 900, letterSpacing: -1, marginBottom: 56 }, children: "Four-Stage DSO Architecture" }), _jsx("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap" }, children: [
                                { id: "DSO1", name: "Signal Risk", desc: "XGBoost\nAUC 0.892", color: "#22d3ee" },
                                { id: "DSO2", name: "Cell Ranking", desc: "XGBoost\nCandidate Sort", color: "#3b82f6" },
                                { id: "DSO3", name: "Net Cluster", desc: "KMeans + LR\n4 Profiles", color: "#a855f7" },
                                { id: "DSO4", name: "HO Decision", desc: "Calibrated XGB\nAUC 0.979", color: "#22c55e" },
                            ].map((s, i) => (_jsxs("div", { style: { display: "flex", alignItems: "center" }, children: [_jsxs("div", { style: {
                                            padding: "20px 28px", borderRadius: 16,
                                            background: `${s.color}12`, border: `1px solid ${s.color}35`,
                                            textAlign: "center", minWidth: 140,
                                        }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 800, color: s.color, marginBottom: 4 }, children: s.id }), _jsx("div", { style: { fontSize: 15, fontWeight: 700, marginBottom: 6 }, children: s.name }), _jsx("div", { style: { fontSize: 11, color: "#475569", whiteSpace: "pre-line", lineHeight: 1.5 }, children: s.desc })] }), i < 3 && _jsx("div", { style: { color: "#1e3a5f", fontSize: 20, margin: "0 8px" }, children: "\u2192" })] }, s.id))) })] }) }), _jsx("section", { id: "about", style: { padding: "120px 48px" }, children: _jsxs("div", { style: { maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#22d3ee", letterSpacing: 3, textTransform: "uppercase", marginBottom: 20 }, children: "About the Project" }), _jsxs("h2", { style: { fontSize: 42, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.1, marginBottom: 24 }, children: ["Advancing 5G with ", _jsx("span", { style: { background: "linear-gradient(135deg,#22d3ee,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }, children: "Predictive AI" })] }), _jsx("p", { style: { color: "#64748b", lineHeight: 1.8, fontSize: 16, marginBottom: 20 }, children: "CellPilot is a research-grade MLOps platform built to solve one of the hardest problems in 5G networks: predicting and optimizing handover decisions before signal degradation occurs." }), _jsx("p", { style: { color: "#64748b", lineHeight: 1.8, fontSize: 16, marginBottom: 32 }, children: "Trained on 200,000+ real-world measurements across mobile, stationary, and high-speed rail scenarios, the platform delivers sub-30ms inference through a four-stage DSO chain deployed as production microservices." }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [
                                        { l: "React + Vite", v: "Frontend" }, { l: "FastAPI + XGBoost", v: "ML Engine" },
                                        { l: "NestJS Microservices", v: "Backend" }, { l: "Docker + PostgreSQL", v: "Infrastructure" },
                                    ].map(t => (_jsxs("div", { style: { padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }, children: [_jsx("div", { style: { fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }, children: t.v }), _jsx("div", { style: { fontSize: 14, fontWeight: 700 }, children: t.l })] }, t.v))) })] }), _jsx("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }, children: [
                                { n: "199,990", l: "Training Samples", c: "#22d3ee" },
                                { n: "0.979", l: "DSO4 ROC AUC", c: "#a855f7" },
                                { n: "0.826", l: "Matthews MCC", c: "#22c55e" },
                                { n: "4", l: "Network Scenarios", c: "#f59e0b" },
                            ].map(s => (_jsxs("div", { style: {
                                    padding: "28px 24px", borderRadius: 16, textAlign: "center",
                                    background: `${s.c}08`, border: `1px solid ${s.c}20`,
                                }, children: [_jsx("div", { style: { fontSize: 32, fontWeight: 900, color: s.c, marginBottom: 8 }, children: s.n }), _jsx("div", { style: { fontSize: 12, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }, children: s.l })] }, s.l))) })] }) }), _jsx("section", { style: { padding: "80px 48px", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.04)" }, children: _jsxs("div", { style: { maxWidth: 900, margin: "0 auto", textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#22d3ee", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }, children: "Team" }), _jsx("h2", { style: { fontSize: 38, fontWeight: 900, letterSpacing: -1, marginBottom: 48 }, children: "The Best Team Group" }), _jsx("div", { style: { display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap" }, children: [
                                { name: "Research Advisor", role: "5G Networks & AI Systems", avatar: "RA", color: "#a855f7" },
                            ].map(p => (_jsxs("div", { style: { padding: "32px", borderRadius: 20, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center", minWidth: 220 }, children: [_jsx("div", { style: {
                                            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px",
                                            background: `linear-gradient(135deg,${p.color},${p.color}88)`,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: 22, fontWeight: 800, color: "#fff",
                                        }, children: p.avatar }), _jsx("div", { style: { fontWeight: 700, fontSize: 16, marginBottom: 6 }, children: p.name }), _jsx("div", { style: { fontSize: 13, color: "#64748b" }, children: p.role })] }, p.name))) })] }) }), _jsx("section", { id: "contact", style: { padding: "120px 48px" }, children: _jsxs("div", { style: { maxWidth: 600, margin: "0 auto", textAlign: "center" }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#22d3ee", letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }, children: "Contact" }), _jsx("h2", { style: { fontSize: 42, fontWeight: 900, letterSpacing: -1.5, marginBottom: 16 }, children: "Get In Touch" }), _jsx("p", { style: { color: "#64748b", fontSize: 17, marginBottom: 48, lineHeight: 1.7 }, children: "Have questions about the platform or interested in collaboration? We'd love to hear from you." }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: 14 }, children: [
                                { l: "Email", v: "cellpilot@gmail.com", icon: "✉️" },
                                { l: "Project", v: "5G AI Handover Platform — MLOps Research", icon: "🎓" },
                                { l: "GitHub", v: "github.com/bellaaghaaziz/5G_Dashboard", icon: "💻" },
                            ].map(c => (_jsxs("div", { style: {
                                    display: "flex", alignItems: "center", gap: 16, padding: "18px 24px",
                                    borderRadius: 14, background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.06)", textAlign: "left",
                                }, children: [_jsx("span", { style: { fontSize: 22 }, children: c.icon }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }, children: c.l }), _jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "#22d3ee" }, children: c.v })] })] }, c.l))) })] }) }), _jsxs("footer", { style: { padding: "32px 48px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("div", { style: { width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#22d3ee,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 10, color: "#fff" }, children: "5G" }), _jsx("span", { style: { fontWeight: 700, fontSize: 15 }, children: "CellPilot" })] }), _jsx("div", { style: { fontSize: 13, color: "#334155" }, children: "\u00A9 2026 CellPilot 5G Platform. All rights reserved." }), _jsx("button", { onClick: () => navigate("/login"), style: {
                            padding: "9px 22px", borderRadius: 8, border: "1px solid rgba(34,211,238,0.3)",
                            background: "transparent", color: "#22d3ee", fontWeight: 700, fontSize: 13,
                            cursor: "pointer", fontFamily: "inherit",
                        }, children: "Launch App \u2192" })] }), _jsx("style", { children: `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }` })] }));
}
