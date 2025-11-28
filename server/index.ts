import "dotenv/config";
import express from "express";
import session from "express-session";
import { registerRoutes } from "./routes.minimal";
import { setupVite, serveStatic, log } from "./vite";

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Global error handlers for startup robustness
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  if (process.env.NODE_ENV === 'production') {
    console.error('Critical error, but keeping process alive to report logs...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware - simple in-memory for dev
const sessionSecret = process.env.SESSION_SECRET || Math.random().toString(36).substring(2);

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Simple request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

(async () => {
  console.log("[Server] Starting minimal backend...");
  
  const server = await registerRoutes(app);

  // Setup Vite or serve static files
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  
  // Debug logging for port configuration
  console.log('[Server] Port configuration:', {
    'process.env.PORT': process.env.PORT || 'not set',
    'resolved port': port,
    'NODE_ENV': process.env.NODE_ENV,
  });
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`🚀 Server running on port ${port}`);
    console.log(`[Server] ✅ Server listening on port ${port}`);
  });
})();
