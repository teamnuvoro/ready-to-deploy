import "dotenv/config";
import express from "express";
import { setupVite, serveStatic, log } from "./vite";
import { Server } from "http";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// User info endpoint (dev mode)
app.get("/api/user", async (req, res) => {
  try {
    res.json({
      id: "dev-user-001",
      name: "Dev User",
      email: "dev@example.com",
      premiumUser: true,
      gender: "male",
      age: 25
    });
  } catch (error: any) {
    console.error("[/api/user] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// User usage endpoint
app.post("/api/user/usage", async (_req, res) => {
  res.json({
    messageCount: 0,
    callDuration: 0,
    premiumUser: true,
    messageLimitReached: false,
    callLimitReached: false,
  });
});

// Auth session endpoint (for compatibility)
app.get("/api/auth/session", async (req, res) => {
  try {
    res.json({
      user: {
        id: "dev-user-001",
        name: "Dev User",
        email: "dev@example.com",
        premiumUser: true,
        gender: "male",
        age: 25
      }
    });
  } catch (error: any) {
    console.error("[/api/auth/session] Error:", error);
    res.status(500).json({ error: "Failed to get session" });
  }
});

(async () => {
  console.log("[Server] Starting minimal server for frontend hosting...");
  
  const server = new Server(app);

  // Setup Vite or serve static files
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`🚀 Server running on port ${port}`);
    console.log(`[Server] ✅ Frontend server listening on port ${port}`);
    console.log(`[Server] 📡 API calls routed to Supabase Edge Functions`);
  });
})();
