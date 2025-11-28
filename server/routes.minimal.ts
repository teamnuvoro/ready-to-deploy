import type { Express } from "express";
import { Server } from "http";
import { streamGroqChat } from "./groq";
import { db } from "./db";
import { sessions, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

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

  const httpServer = new Server(app);
  return httpServer;
}
