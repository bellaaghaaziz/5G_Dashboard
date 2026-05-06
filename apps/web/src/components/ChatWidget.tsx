import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Fab,
  Paper,
  Typography,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Avatar,
  Fade,
  CircularProgress,
} from "@mui/material";
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
  SmartToy as RobotIcon,
  Person as UserIcon,
  Assessment as ReportIcon,
  HealthAndSafety as HealthIcon,
  DeleteSweep as ClearIcon,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../context/auth";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Hello! I'm CellPilot AI. How can I help you with your 5G network today?" },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const { token } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!customInput) setInput("");
    setIsLoading(true);

    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/chat`,
        { messages: [...messages, userMsg].slice(-10) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ role: "assistant", content: "Hello! I'm CellPilot AI. Chat cleared. How can I help you?" }]);
  };

  return (
    <>
      <Box sx={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
        <Fade in={!isOpen}>
          <Fab
            color="primary"
            onClick={() => setIsOpen(true)}
            sx={{
              boxShadow: "0 8px 32px rgba(34,211,238,0.4)",
              background: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)",
            }}
          >
            <ChatIcon />
          </Fab>
        </Fade>

        <Fade in={isOpen}>
          <Paper
            sx={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 380,
              height: 520,
              display: "flex",
              flexDirection: "column",
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(13,27,46,0.95)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                p: 2,
                background: "linear-gradient(90deg, #1e293b 0%, #0f172a 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Avatar sx={{ bgcolor: "#22d3ee", width: 32, height: 32 }}>
                  <RobotIcon fontSize="small" />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    CellPilot AI
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#22c55e", display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Box sx={{ width: 6, height: 6, bgcolor: "#22c55e", borderRadius: "50%" }} />
                    Always Online
                  </Typography>
                </Box>
              </Box>
              <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: "rgba(255,255,255,0.5)" }}>
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Messages */}
            <Box ref={scrollRef} sx={{ flexGrow: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              {messages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: msg.role === "user" ? "18px 18px 2px 18px" : "18px 18px 18px 2px",
                      bgcolor: msg.role === "user" ? "#22d3ee" : "rgba(255,255,255,0.05)",
                      color: msg.role === "user" ? "#000" : "#f1f5f9",
                      boxShadow: msg.role === "user" ? "0 4px 12px rgba(34,211,238,0.2)" : "none",
                      "& p": { m: 0, fontSize: "0.875rem" },
                      "& table": { borderCollapse: "collapse", width: "100%", my: 1, fontSize: "0.75rem" },
                      "& th, & td": { border: "1px solid rgba(255,255,255,0.1)", p: 0.5, textAlign: "left" },
                      "& th": { bgcolor: "rgba(255,255,255,0.1)", fontWeight: 700 },
                      "& ul, & ol": { pl: 2, m: 0 },
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      <Typography variant="body2">{msg.content}</Typography>
                    )}
                  </Box>
                </Box>
              ))}
              {isLoading && (
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", pl: 1 }}>
                  <CircularProgress size={16} thickness={6} sx={{ color: "#22d3ee" }} />
                  <Typography variant="caption" sx={{ color: "#64748b" }}>Thinking...</Typography>
                </Box>
              )}
            </Box>

            {/* Quick Actions */}
            <Box sx={{ px: 2, py: 1, display: "flex", gap: 1, overflowX: "auto", borderTop: "1px solid rgba(255,255,255,0.05)", bgcolor: "rgba(255,255,255,0.02)" }}>
              {[
                { label: "Report", icon: <ReportIcon fontSize="inherit" />, text: "Generate a network performance report." },
                { label: "Health", icon: <HealthIcon fontSize="inherit" />, text: "What is the system health status?" },
                { label: "Clear", icon: <ClearIcon fontSize="inherit" />, action: clearChat },
              ].map((btn) => (
                <Box
                  key={btn.label}
                  onClick={() => btn.action ? btn.action() : handleSend(btn.text)}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 10,
                    bgcolor: "rgba(34,211,238,0.1)",
                    color: "#22d3ee",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "rgba(34,211,238,0.2)", transform: "translateY(-1px)" },
                  }}
                >
                  {btn.icon} {btn.label}
                </Box>
              ))}
            </Box>

            {/* Input */}
            <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Ask about 5G handovers..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: "rgba(255,255,255,0.03)",
                      borderRadius: 2,
                    },
                  }}
                />
                <IconButton
                  color="primary"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  sx={{
                    bgcolor: "rgba(34,211,238,0.1)",
                    "&:hover": { bgcolor: "rgba(34,211,238,0.2)" },
                  }}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          </Paper>
        </Fade>
      </Box>
    </>
  );
};
