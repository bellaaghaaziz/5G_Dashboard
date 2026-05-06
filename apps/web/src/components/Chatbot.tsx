import React, { useState, useEffect, useRef } from "react";
import { Box, Fab, Paper, Typography, IconButton, TextField, CircularProgress, Stack } from "@mui/material";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import { useAuth } from "../context/auth";
import { api } from "../api/client";

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Hello! I am CellPilot AI. How can I assist you with analyzing your 5G network or generating a report?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post("/chat", {
        messages: newMessages
      });
      
      const reply = response.data;
      setMessages(prev => [...prev, reply]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please ensure the Chat service is running and API keys are configured." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <Fab
          color="primary"
          aria-label="chat"
          onClick={() => setOpen(true)}
          sx={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}
        >
          <ChatRoundedIcon />
        </Fab>
      )}

      {open && (
        <Paper
          elevation={6}
          sx={{
            position: "fixed", bottom: 24, right: 24, zIndex: 1000,
            width: 360, height: 500, display: "flex", flexDirection: "column",
            borderRadius: 3, overflow: "hidden",
            bgcolor: "background.paper"
          }}
        >
          <Box sx={{ p: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SmartToyRoundedIcon />
              <Typography variant="h6" sx={{ fontSize: 16 }}>CellPilot AI</Typography>
            </Stack>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: "inherit" }}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          <Box ref={scrollRef} sx={{ flex: 1, p: 2, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {messages.map((msg, index) => (
              <Box key={index} sx={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 1 }}>
                {msg.role === "assistant" && <SmartToyRoundedIcon sx={{ fontSize: 20, mt: 0.5, color: "primary.main" }} />}
                <Box
                  sx={{
                    maxWidth: "80%",
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: msg.role === "user" ? "primary.dark" : "rgba(255,255,255,0.05)",
                    color: msg.role === "user" ? "#fff" : "text.primary",
                    fontSize: 14,
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {msg.content}
                </Box>
                {msg.role === "user" && <PersonRoundedIcon sx={{ fontSize: 20, mt: 0.5, color: "text.secondary" }} />}
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <SmartToyRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
                <CircularProgress size={16} />
              </Box>
            )}
          </Box>

          <Box sx={{ p: 1.5, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Ask me something..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              variant="outlined"
            />
            <IconButton color="primary" onClick={handleSend} disabled={loading || !input.trim()}>
              <SendRoundedIcon />
            </IconButton>
          </Box>
        </Paper>
      )}
    </>
  );
}