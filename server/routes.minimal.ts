import type { Express } from "express";
import { Server } from "http";
import Groq from "groq-sdk";
import { db } from "./db";
import { sessions, messages, users } from "@shared/schema";
import { eq, desc, count } from "drizzle-orm";
import { RIYA_SYSTEM_PROMPT } from "./prompts";

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

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
      const userId = "dev-user-001";
      res.json({
        id: userId,
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

  // ============================================
  // CHAT ENDPOINT - SIMPLE & WORKING
  // ============================================
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, userId: reqUserId, sessionId: reqSessionId } = req.body;

      const userId = reqUserId || "dev-user-001";
      const sessionId = reqSessionId || "dev-session-001";

      // Validate
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      console.log(`[Chat] User message: ${message}`);

      // Check message limit (simple in-memory check for dev mode)
      if (!db) {
        // In-memory mode - no limit checking
        console.log("[Chat] In-memory mode - skipping limit check");
      } else {
        // Check message count for user
        const messageCountResult = await db
          .select({ count: count() })
          .from(messages)
          .where(eq(messages.userId, userId));

        const messageCount = messageCountResult[0]?.count || 0;

        // Get user premium status
        const userResult = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const user = userResult[0];
        const isPremium = user?.premiumUser || false;

        if (!isPremium && messageCount >= 20) {
          return res.status(402).json({
            error: "PAYWALL_HIT",
            message: "Upgrade to continue chatting",
            messageCount,
            messageLimit: 20,
          });
        }
      }

      // Save user message to database if available
      if (db) {
        try {
          await db.insert(messages).values({
            sessionId,
            userId,
            role: "user",
            text: message,
            tag: "general",
          });
        } catch (dbError) {
          console.warn("[Chat] Failed to save user message to DB:", dbError);
        }
      }

      // Get last 5 messages for context
      let recentMessages = "";
      if (db) {
        try {
          const recentMessagesResult = await db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId))
            .orderBy(desc(messages.createdAt))
            .limit(5);

          recentMessages = recentMessagesResult
            .reverse()
            .map((m) => `${m.role}: ${m.text}`)
            .join("\n");
        } catch (dbError) {
          console.warn("[Chat] Failed to fetch recent messages:", dbError);
        }
      }

      // Create system prompt with context
      const systemPrompt = RIYA_SYSTEM_PROMPT(recentMessages);

      // Call Groq
      const groqResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0.7,
        stream: false,
      });

      const aiResponse = groqResponse.choices[0]?.message?.content || "Hmm, let me think...";

      // Save AI response to database if available
      if (db) {
        try {
          await db.insert(messages).values({
            sessionId,
            userId,
            role: "ai",
            text: aiResponse,
            tag: "general",
          });
        } catch (dbError) {
          console.warn("[Chat] Failed to save AI message to DB:", dbError);
        }
      }

      // Return response
      res.json({
        response: aiResponse,
        messageCount: 0, // Will be calculated client-side
        messageLimit: 20,
      });
    } catch (error: any) {
      console.error("[/api/chat] Error:", error);
      
      // Check if it's a Groq API error
      if (error?.status === 401 || error?.error?.code === "invalid_api_key") {
        return res.status(500).json({ 
          error: "AI service authentication failed. Please check GROQ_API_KEY." 
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to generate response" });
    }
  });

  // ============================================
  // GET MESSAGES FOR A SESSION
  // ============================================
  app.get("/api/messages/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!db) {
        return res.json({ messages: [] });
      }

      const messagesResult = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(messages.createdAt);

      res.json({ messages: messagesResult });
    } catch (error: any) {
      console.error("[/api/messages] Error:", error);
      res.json({ messages: [] });
    }
  });

  // ============================================
  // CREATE NEW SESSION
  // ============================================
  app.post("/api/sessions", async (req, res) => {
    try {
      const { userId: reqUserId } = req.body;
      const userId = reqUserId || "dev-user-001";

      if (!db) {
        // In-memory session
        const sessionId = `session-${Date.now()}`;
        const session = {
          id: sessionId,
          userId,
          type: "chat",
          startedAt: new Date(),
          endedAt: null,
        };
        inMemorySessions.set(sessionId, session);
        return res.json({ session });
      }

      const sessionResult = await db
        .insert(sessions)
        .values({
          userId,
          type: "chat",
        })
        .returning();

      res.json({ session: sessionResult[0] });
    } catch (error: any) {
      console.error("[/api/sessions] Error:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Get or create session (POST /api/session for compatibility)
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
      const fallbackUserId = "dev-user-001";
      const existingFallback = inMemorySessions.get(fallbackUserId);
      if (existingFallback && !existingFallback.endedAt) {
        return res.json(existingFallback);
      }
      
      const fallbackSession = {
        id: `fallback-${fallbackUserId}-${Date.now()}`,
        userId: fallbackUserId,
        type: "chat",
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemorySessions.set(fallbackUserId, fallbackSession);
      res.json(fallbackSession);
    }
  });

  // Get session (alias for compatibility)
  app.get("/api/auth/session", async (req, res) => {
    try {
      const userId = "dev-user-001";
      
      // Return a session object (client expects Session, not User)
      res.json({
        id: "dev-session-001",
        userId,
        type: "chat",
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error: any) {
      console.error("[/api/auth/session] Error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  // Get messages for a session (GET /api/messages?sessionId=...)
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

  // Streaming chat endpoint (for SSE compatibility)
  app.post("/api/chat/stream", async (req, res) => {
    try {
      const { content, sessionId } = req.body;
      const userId = "dev-user-001";

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Message content is required" });
      }

      console.log(`[Chat] User message: ${content}`);

      // Check if Groq API key is configured
      if (!process.env.GROQ_API_KEY) {
        console.error("[Chat] GROQ_API_KEY is not configured");
        
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        const errorMsg = "I'm sorry, but the AI service is not configured. Please set GROQ_API_KEY in your .env file.";
        res.write(`data: ${JSON.stringify({ content: errorMsg, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);
        res.end();
        return;
      }

      // Set headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Get recent messages for context
      let recentMessages = "";
      if (db) {
        try {
          const recentMessagesResult = await db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId || "dev-session-001"))
            .orderBy(desc(messages.createdAt))
            .limit(5);

          recentMessages = recentMessagesResult
            .reverse()
            .map((m) => `${m.role}: ${m.text}`)
            .join("\n");
        } catch (dbError) {
          console.warn("[Chat] Failed to fetch recent messages:", dbError);
        }
      }

      const systemPrompt = RIYA_SYSTEM_PROMPT(recentMessages);

      // Stream the response using Groq
      const { streamGroqChat } = await import("./groq");
      let fullResponse = "";

      await streamGroqChat(
        [{ role: "user", content }],
        (chunk) => {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
        },
        systemPrompt
      );

      // Save to database if possible
      if (db) {
        try {
          const finalSessionId = sessionId || "dev-session-001";
          await db.insert(messages).values({
            sessionId: finalSessionId,
            userId,
            role: "user",
            text: content,
            tag: "general",
          });
          await db.insert(messages).values({
            sessionId: finalSessionId,
            userId,
            role: "ai",
            text: fullResponse,
            tag: "general",
          });
        } catch (dbError) {
          console.warn("[Chat] Database save failed:", dbError);
        }
      }

      // Send final message
      res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("[/api/chat/stream] Error:", error);
      
      // Check if it's an authentication error
      if (error?.status === 401 || error?.error?.code === "invalid_api_key") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        const errorMsg = "I'm sorry, but there's an issue with the AI service authentication. Please check your GROQ_API_KEY.";
        res.write(`data: ${JSON.stringify({ content: errorMsg, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: "", done: true })}\n\n`);
        res.end();
        return;
      }
      
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
    try {
      if (!db) {
        return res.json({
          messageCount: 0,
          callDuration: 0,
          premiumUser: true, // Allow unlimited in dev mode
          messageLimitReached: false,
          callLimitReached: false,
        });
      }

      const userId = "dev-user-001";
      const messageCountResult = await db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.userId, userId));
      
      const messageCount = messageCountResult[0]?.count || 0;
      const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const isPremium = userResult[0]?.premiumUser || false;

      res.json({
        messageCount,
        callDuration: 0,
        premiumUser: isPremium,
        messageLimitReached: !isPremium && messageCount >= 20,
        callLimitReached: false,
      });
    } catch (error: any) {
      console.error("[/api/user/usage] Error:", error);
      res.json({
        messageCount: 0,
        callDuration: 0,
        premiumUser: true,
        messageLimitReached: false,
        callLimitReached: false,
      });
    }
  });

  // Update user personality endpoint
  app.patch("/api/user/personality", async (req, res) => {
    try {
      const { personalityId } = req.body;
      const userId = "dev-user-001";
      
      console.log(`[User Personality] User ${userId} selected personality: ${personalityId}`);
      
      res.json({
        success: true,
        personalityId,
        message: "Personality updated successfully"
      });
    } catch (error: any) {
      console.error("[/api/user/personality] Error:", error);
      res.status(500).json({ error: "Failed to update personality" });
    }
  });

  const httpServer = new Server(app);
  return httpServer;
}
