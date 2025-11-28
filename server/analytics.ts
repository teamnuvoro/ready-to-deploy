import type { Request, Response } from "express";
import { db, hasDatabaseUrl } from "./db";
import { storage, MemStorage } from "./storage";
import {
  users,
  sessions,
  messages,
  subscriptions,
  calls,
  userSummaryLatest,
} from "@shared/schema";
import { sql, eq, gt } from "drizzle-orm";

async function computeAnalyticsFromMemStorage(sevenDaysAgo: Date) {
  // Check if storage is actually MemStorage by checking for internal state
  const storageAny = storage as any;
  
  if (!storageAny.users || !storageAny.sessions || !storageAny.messages) {
    throw new Error("Storage is not MemStorage or internal state is not accessible");
  }
  
  // Access internal state via reflection
  // Better would be to add analytics methods to IStorage interface
  const usersMap = storageAny.users as Map<string, any>;
  const sessionsMap = storageAny.sessions as Map<string, any>;
  const messagesArray = storageAny.messages as any[];
  const callsMap = storageAny.calls as Map<string, any>;
  const subscriptionsMap = storageAny.subscriptions as Map<string, any>;
  const userSummariesMap = storageAny.userSummaries as Map<string, any>;

  const allUsers = Array.from(usersMap?.values() || []);
  const allSessions = Array.from(sessionsMap?.values() || []);
  const allMessages = messagesArray || [];
  const allCalls = Array.from(callsMap?.values() || []);
  const allSubscriptions = Array.from(subscriptionsMap?.values() || []);
  const allSummaries = Array.from(userSummariesMap?.values() || []);

  const totalUsers = allUsers.length;
  const premiumUsers = allUsers.filter(u => u.premiumUser).length;
  const activeUsers7d = new Set(
    allSessions
      .filter(s => s.startedAt > sevenDaysAgo)
      .map(s => s.userId)
  ).size;

  const totalMessages = allMessages.length;
  const totalSessions = allSessions.length;
  const callSessions = allSessions.filter(s => s.type === 'call').length;
  const totalCallMinutes = Math.round(
    allCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / 60
  );

  const avgMessagesPerSession = totalSessions > 0
    ? Number((totalMessages / totalSessions).toFixed(2))
    : 0;

  const freeToPaidConversion = totalUsers > 0
    ? Number(((premiumUsers / totalUsers) * 100).toFixed(2))
    : 0;

  const planBreakdown: Record<string, number> = {};
  allSubscriptions.forEach(sub => {
    const plan = sub.planType || 'unknown';
    planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
  });

  const confidenceScores = allSummaries
    .map(s => s.confidenceScore)
    .filter(c => c != null) as number[];
  const avgConfidence = confidenceScores.length > 0
    ? Number((confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length * 100).toFixed(1))
    : 0;

  return {
    engagement: {
      totalUsers,
      activeUsers7d,
      avgMessagesPerSession,
      totalMessages,
      voiceCallSessions: callSessions,
      voiceMinutes: totalCallMinutes,
    },
    conversion: {
      premiumUsers,
      freeToPaidConversion,
      planBreakdown,
    },
    quality: {
      confidenceScore: avgConfidence,
    },
  };
}

export async function getAnalyticsSummary(req: Request, res: Response) {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Use database queries if available, otherwise compute from storage
    if (hasDatabaseUrl && db) {
      // Database-backed analytics
      const [totalUsersRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(users);
      const [premiumUsersRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.premiumUser, true));
      const [activeUsersRow] = await db
        .select({
          value: sql<number>`count(distinct ${sessions.userId})`,
        })
        .from(sessions)
        .where(gt(sessions.startedAt, sevenDaysAgo));

      const [totalMessagesRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(messages);
      const [totalSessionsRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(sessions);

      const [callSessionsRow] = await db
        .select({
          value: sql<number>`count(*)`,
        })
        .from(sessions)
        .where(eq(sessions.type, "call"));

      const [callDurationRow] = await db
        .select({
          value: sql<number>`coalesce(sum(${calls.durationSeconds}), 0)`,
        })
        .from(calls);

      const planBreakdown = await db
        .select({
          plan: subscriptions.planType,
          total: sql<number>`count(*)`,
        })
        .from(subscriptions)
        .groupBy(subscriptions.planType);

      const [confidenceRow] = await db
        .select({
          value: sql<number>`coalesce(avg(${userSummaryLatest.confidenceScore}), 0)`,
        })
        .from(userSummaryLatest);

      const totalUsersValue = totalUsersRow?.value ?? 0;
      const premiumUsersValue = premiumUsersRow?.value ?? 0;
      const activeUsersValue = activeUsersRow?.value ?? 0;
      const totalMessagesValue = totalMessagesRow?.value ?? 0;
      const totalSessionsValue = totalSessionsRow?.value ?? 0;
      const callSessionsValue = callSessionsRow?.value ?? 0;
      const totalCallMinutes = Math.round((callDurationRow?.value ?? 0) / 60);
      const avgMessagesPerSession =
        totalSessionsValue > 0
          ? Number((totalMessagesValue / totalSessionsValue).toFixed(2))
          : 0;

      const freeToPaidConversion =
        totalUsersValue > 0
          ? Number(((premiumUsersValue / totalUsersValue) * 100).toFixed(2))
          : 0;

      const planCounts = planBreakdown.reduce(
        (acc, row) => {
          acc[row.plan || "unknown"] = Number(row.total);
          return acc;
        },
        {} as Record<string, number>,
      );

      res.json({
        engagement: {
          totalUsers: totalUsersValue,
          activeUsers7d: activeUsersValue,
          avgMessagesPerSession,
          totalMessages: totalMessagesValue,
          voiceCallSessions: callSessionsValue,
          voiceMinutes: totalCallMinutes,
        },
        conversion: {
          premiumUsers: premiumUsersValue,
          freeToPaidConversion,
          planBreakdown: planCounts,
        },
        quality: {
          confidenceScore:
            confidenceRow?.value !== undefined
              ? Number((confidenceRow.value * 100).toFixed(1))
              : 0,
        },
      });
    } else {
      // In-memory storage: compute analytics from internal state
      try {
        const analytics = await computeAnalyticsFromMemStorage(sevenDaysAgo);
        res.json(analytics);
      } catch (memError) {
        console.error("MemStorage analytics error:", memError);
        // Fallback to zeros if computation fails
        res.json({
          engagement: {
            totalUsers: 0,
            activeUsers7d: 0,
            avgMessagesPerSession: 0,
            totalMessages: 0,
            voiceCallSessions: 0,
            voiceMinutes: 0,
          },
          conversion: {
            premiumUsers: 0,
            freeToPaidConversion: 0,
            planBreakdown: {},
          },
          quality: {
            confidenceScore: 0,
          },
        });
      }
    }
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ 
      error: "Failed to load analytics",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

