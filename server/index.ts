import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";
import { requestTracer } from './middleware/requestTracer';
import { globalErrorHandler } from './middleware/errorHandler';

// Global error handlers for startup robustness
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  // Don't exit immediately in dev to allow debugging, but in prod we might want to restart
  if (process.env.NODE_ENV === 'production') {
    console.error('Critical error, but keeping process alive to report logs...');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

const app = express();

// 1. Initialize Sentry (Top of file)
// 1. Initialize Sentry (Top of file)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js tracing
      new Sentry.Integrations.Express({ app }),
      // enable Profiling
      new ProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0,
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  });
} else {
  console.log("Skipping Sentry initialization: SENTRY_DSN not set");
}

// 2. Sentry Request Handler (Must be first middleware)
app.use(Sentry.Handlers.requestHandler() as express.RequestHandler);

// TracingHandler creates a trace for every incoming request
app.use(Sentry.Handlers.tracingHandler() as express.RequestHandler);

// 3. Our Tracer (Must be early)
app.use(requestTracer);

app.use("/api/cashfree/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session middleware - secure configuration
const PgSessionStore = connectPgSimple(session);
const usePgSessionStore =
  process.env.USE_IN_MEMORY_STORAGE?.toLowerCase() !== "true" &&
  Boolean(process.env.DATABASE_URL);

const sessionStore = usePgSessionStore
  ? new PgSessionStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  })
  : new session.MemoryStore();

if (sessionStore instanceof PgSessionStore) {
  (sessionStore as any).on('error', (err: any) => {
    console.error('Session Store Error:', err);
  });
}

if (!usePgSessionStore) {
  console.warn(
    "[session] Using in-memory session store. Sessions reset on server restart.",
  );
}

let sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️  WARNING: SESSION_SECRET environment variable is missing in production. Using auto-generated secret.");
    sessionSecret = Math.random().toString(36).substring(2) + Date.now().toString(36);
  } else {
    // Development only: generate random secret
    sessionSecret = Math.random().toString(36).substring(2) + Date.now().toString(36);
    console.warn("⚠️  DEV MODE: Using auto-generated session secret (sessions will reset on restart)");
  }
}

if (process.env.NODE_ENV === "production") {
  console.warn("⚠️  WARNING: Using in-memory session store in production. Sessions will be lost on restart.");
  console.warn("   For production, configure a persistent session store (Redis, database, etc.)");
}

// Cookie configuration for production
const isProduction = process.env.NODE_ENV === "production";
const cookieSettings = {
  secure: false, // Disable secure flag to troubleshoot production issue
  httpOnly: true,
  sameSite: "lax" as const, // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

console.log(`🍪 Cookie settings: secure=${cookieSettings.secure}, sameSite=${cookieSettings.sameSite}, environment=${process.env.NODE_ENV}`);

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: cookieSettings,
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

import { setupAnalyst } from "./services/analyst";
import { setupSleepProcessor } from "./services/sleepProcessor";
import { setupAnalyticsListener } from "./services/analyticsWorker";

(async () => {
  // Initialize Background Services (The Dual Brain)
  try {
    setupAnalyst();
    console.log("Analyst service initialized");
  } catch (err) {
    console.error("Failed to initialize Analyst service:", err);
  }

  try {
    setupSleepProcessor();
    console.log("Sleep Processor initialized");
  } catch (err) {
    console.error("Failed to initialize Sleep Processor:", err);
  }

  try {
    setupAnalyticsListener();
    console.log("Analytics Listener initialized");
  } catch (err) {
    console.error("Failed to initialize Analytics Listener:", err);
  }

  const server = await registerRoutes(app);

  // 4. Sentry Error Handler (Must be before our error handler)
  app.use(Sentry.Handlers.errorHandler() as express.ErrorRequestHandler);

  // 5. Our Safety Net (Must be LAST)
  app.use(globalErrorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
