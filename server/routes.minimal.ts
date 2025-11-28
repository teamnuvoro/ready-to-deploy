import type { Express } from "express";
import { Server } from "http";
import { streamGroqChat } from "./groq";
import { db } from "./db";
import { sessions, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// Simple in-memory session store for when DB is not available
const inMemorySessions = new Map<string, any>();

export function registerRoutes(app: Express): Server {
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Get user info
  app.get("/api/user", async (req, res) => {
    try {
      const userId = "dev-user-001"; // Dev user when DISABLE_AUTH=true
      res.json({
        id: userId,
        name: "Dev User",
        email: "dev@example.com"
      });
    } catch (error: any) {
      console.error("[/api/user] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send message - simple chat with Groq streaming
  app.post("/api/chat/send", async (req, res) => {
    try {
      const { message } = req.body;
      const userId = "dev-user-001";

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      console.log(`[Chat] User message: ${message}`);

      // Simple system prompt for AI girlfriend
      const systemPrompt = `You are Riya, a warm, caring AI companion and girlfriend. You are:
- Supportive, empathetic, and genuinely interested in the user's life
- Fluent in both English and Hindi, mixing them naturally (Hinglish)
- Playful, affectionate, and engaging
- Here to provide companionship, emotional support, and meaningful conversation

Keep responses natural, warm, and conversational. Show genuine interest in what the user shares.`;

      // Collect AI response chunks
      let aiResponse = "";
      
      await streamGroqChat(
        [{ role: "user", content: message }],
        (chunk) => {
          aiResponse += chunk;
        },
        systemPrompt
      );

      console.log(`[Chat] AI response: ${aiResponse}`);

      // Try to save to database if available, but don't fail if it's not
      try {
        // Create or get session
        let sessionId: string;
        const existingSessions = await db.select().from(sessions)
          .where(eq(sessions.userId, userId))
          .orderBy(desc(sessions.startedAt))
          .limit(1);

        if (existingSessions.length > 0 && !existingSessions[0].endedAt) {
          sessionId = existingSessions[0].id;
        } else {
          const [newSession] = await db.insert(sessions).values({
            userId,
            type: "chat",
          }).returning();
          sessionId = newSession.id;
        }

        // Save messages
        await db.insert(messages).values([
          {
            sessionId,
            userId,
            role: "user",
            text: message,
          },
          {
            sessionId,
            userId,
            role: "ai",
            text: aiResponse,
          }
        ]);
      } catch (dbError) {
        console.warn("[Chat] Database save failed (using in-memory mode):", dbError);
      }

      res.json({
        response: aiResponse,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("[/api/chat/send] Error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  // Get chat history
  app.get("/api/chat/history", async (req, res) => {
    try {
      const userId = "dev-user-001";

      const userSessions = await db.select().from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.startedAt))
        .limit(1);

      if (userSessions.length === 0) {
        return res.json({ messages: [] });
      }

      const chatMessages = await db.select().from(messages)
        .where(eq(messages.sessionId, userSessions[0].id))
        .orderBy(messages.createdAt);

      res.json({
        messages: chatMessages.map(m => ({
          role: m.role,
          content: m.text,
          timestamp: m.createdAt
        }))
      });
    } catch (error: any) {
      console.error("[/api/chat/history] Error:", error);
      // Return empty history if database not available
      res.json({ messages: [] });
    }
  });

  // Get session (alias for compatibility)
  app.get("/api/auth/session", async (req, res) => {
    try {
      const userId = "dev-user-001";
      
      // Check if database is available
      if (!db) {
        // Use in-memory session store
        const existingSession = inMemorySessions.get(userId);
        if (existingSession && !existingSession.endedAt) {
          return res.json(existingSession);
        }
        
        // Create new in-memory session
        const newSession = {
          id: `in-memory-${userId}-${Date.now()}`,
          userId,
          type: "chat",
          startedAt: new Date(),
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inMemorySessions.set(userId, newSession);
        return res.json(newSession);
      }

      // Find active session or create new one
      const existingSessions = await db.select().from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.startedAt))
        .limit(1);

      let activeSession;
      if (existingSessions.length > 0 && !existingSessions[0].endedAt) {
        activeSession = existingSessions[0];
      } else {
        const [newSession] = await db.insert(sessions).values({
          userId,
          type: "chat",
        }).returning();
        activeSession = newSession;
      }

      res.json(activeSession);
    } catch (error: any) {
      console.error("[/api/auth/session] Error:", error);
      // Fallback to in-memory session on error
      const fallbackSession = {
        id: `fallback-${userId}-${Date.now()}`,
        userId,
        type: "chat",
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemorySessions.set(userId, fallbackSession);
      res.json(fallbackSession);
    }
  });

  // Get or create session (required by client)
  app.post("/api/session", async (req, res) => {
    try {
      const userId = "dev-user-001";
      
      // Check if database is available
      if (!db) {
        // Use in-memory session store
        const existingSession = inMemorySessions.get(userId);
        if (existingSession && !existingSession.endedAt) {
          return res.json(existingSession);
        }
        
        // Create new in-memory session
        const newSession = {
          id: `in-memory-${userId}-${Date.now()}`,
          userId,
          type: "chat",
          startedAt: new Date(),
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inMemorySessions.set(userId, newSession);
        return res.json(newSession);
      }

      // Find active session or create new one
      const existingSessions = await db.select().from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.startedAt))
        .limit(1);

      let activeSession;
      if (existingSessions.length > 0 && !existingSessions[0].endedAt) {
        activeSession = existingSessions[0];
      } else {
        const [newSession] = await db.insert(sessions).values({
          userId,
          type: "chat",
        }).returning();
        activeSession = newSession;
      }

      res.json(activeSession);
    } catch (error: any) {
      console.error("[/api/session] Error:", error);
      // Fallback to in-memory session on error
      const fallbackSession = {
        id: `fallback-${userId}-${Date.now()}`,
        userId,
        type: "chat",
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemorySessions.set(userId, fallbackSession);
      res.json(fallbackSession);
    }
  });

  // Get messages for a session
  app.get("/api/messages", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.json([]);
      }

      // If database is not available, return empty messages
      if (!db) {
        return res.json([]);
      }

      const chatMessages = await db.select().from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(messages.createdAt);

      res.json(chatMessages.map(m => ({
        id: m.id,
        sessionId: m.sessionId,
        userId: m.userId,
        role: m.role,
        tag: m.tag || "general",
        text: m.text,
        createdAt: m.createdAt,
      })));
    } catch (error: any) {
      console.error("[/api/messages] Error:", error);
      res.json([]);
    }
  });

  // Streaming chat endpoint (required by client)
  app.post("/api/chat", async (req, res) => {
    try {
      const { content, sessionId } = req.body;
      const userId = "dev-user-001";

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Message content is required" });
      }

      console.log(`[Chat] User message: ${content}`);

      // Set headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Simple system prompt
      const systemPrompt = `You are Riya, a warm, caring AI companion and girlfriend. You are:
- Supportive, empathetic, and genuinely interested in the user's life
- Fluent in both English and Hindi, mixing them naturally (Hinglish)
- Playful, affectionate, and engaging
- Here to provide companionship, emotional support, and meaningful conversation

Keep responses natural, warm, and conversational. Show genuine interest in what the user shares.`;

      let fullResponse = "";

      // Stream the response
      await streamGroqChat(
        [{ role: "user", content }],
        (chunk) => {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
        },
        systemPrompt
      );

      // Save to database if possible
      try {
        let finalSessionId = sessionId;
        if (!finalSessionId) {
          const [newSession] = await db.insert(sessions).values({
            userId,
            type: "chat",
          }).returning();
          finalSessionId = newSession.id;
        }

        await db.insert(messages).values([
          {
            sessionId: finalSessionId,
            userId,
            role: "user",
            text: content,
          },
          {
            sessionId: finalSessionId,
            userId,
            role: "ai",
            text: fullResponse,
          }
        ]);
      } catch (dbError) {
        console.warn("[Chat] Database save failed:", dbError);
      }

      // Send final message
      res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("[/api/chat] Error:", error);
      res.status(500).json({ error: error.message || "Failed to process message" });
    }
  });

  // Payment endpoints (return errors for now since Cashfree not configured)
  app.post("/api/payment/create-order", async (req, res) => {
    res.status(503).json({ error: "Payment service not configured. Please set up Cashfree credentials." });
  });

  app.get("/api/payment/config", (_req, res) => {
    res.json({
      cashfreeMode: "sandbox",
      currency: "INR",
      plans: { daily: 19, weekly: 49 }
    });
  });

  // User usage endpoint
  app.post("/api/user/usage", async (_req, res) => {
    res.json({
      messageCount: 0,
      callDuration: 0,
      premiumUser: true, // Allow unlimited in dev mode
      messageLimitReached: false,
      callLimitReached: false,
    });
  });

  const httpServer = new Server(app);
  return httpServer;
}
