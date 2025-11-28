import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { openai, RIYA_SYSTEM_PROMPT } from "./openai";
import { type User, type Session, type Payment } from "@shared/schema";
import { z } from "zod";
import {
  createSTTWebSocket,
  createTTSWebSocket,
  chatCompletion,
  generateCallSummary,
} from "./services/sarvam";
import { createElevenLabsWebSocket } from "./services/elevenlabs";
import { streamGroqChat, generateGroqSummary, BASE_AI_INSTRUCTIONS } from "./groq";


import { videoService } from "./services/video";
import "./services/engagement"; // Start engagement scheduler
import {
  createCashfreeOrder,
  getCashfreePaymentStatus,
  createCashfreePaymentLink,
} from "./cashfree";
function isAlreadyFinalized(payment: Payment) {
  return payment.status === "success" || payment.status === "failed";
}
import { sendOTPEmail } from "./email";
import crypto from "crypto";
import {
  getCashfreePlanConfig,
  getClientPaymentConfig,
} from "./config";
import { cognitiveBus, EVENTS } from "./services/bus";
import { logPaymentEvent } from "./services/paymentLogger";
import { getSummaryHandler } from "./summary";
import { getAnalyticsSummary } from "./analytics";

const authDisabled =
  process.env.DISABLE_AUTH?.toLowerCase() === "true";
const DEV_USER_EMAIL =
  process.env.DEV_USER_EMAIL || "dev@riya.local";
const DEV_USER_NAME =
  process.env.DEV_USER_NAME || "Dev User";

let devUserPromise: Promise<User> | null = null;

function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    gender: user.gender,
    phoneNumber: user.phoneNumber,
    premiumUser: user.premiumUser,
    age: user.age,
    city: user.city,
    occupation: user.occupation,
    relationshipStatus: user.relationshipStatus,

  };
}

async function getDevUser(): Promise<User> {
  if (!devUserPromise) {
    devUserPromise = (async () => {
      let user = await storage.getUserByEmail(DEV_USER_EMAIL);
      if (!user) {
        user = await storage.createUser({
          name: DEV_USER_NAME,
          email: DEV_USER_EMAIL,
          gender: "prefer_not_to_say",
          phoneNumber: null,
          premiumUser: true,
          locale: "hi-IN",
        });
      }
      return user;
    })();
  }

  return devUserPromise;
}

async function activateSubscriptionFromPayment(
  payment: Payment,
  cashfreePaymentId?: string,
) {
  await storage.updatePaymentStatus(
    payment.id,
    "success",
    cashfreePaymentId,
  );

  const startDate = new Date();
  const endDate = new Date(startDate);

  if (payment.planType === "daily") {
    endDate.setDate(endDate.getDate() + 1);
  } else {
    endDate.setDate(endDate.getDate() + 7);
  }

  await storage.deactivateUserSubscriptions(payment.userId);
  const subscription = await storage.createSubscription({
    userId: payment.userId,
    planType: payment.planType,
    amount: payment.amount,
    startDate,
    endDate,
    active: true,
  });

  await storage.updateUser(payment.userId, { premiumUser: true });
  return subscription;
}

async function markPaymentFailed(payment: Payment, cashfreePaymentId?: string) {
  await storage.updatePaymentStatus(payment.id, "failed", cashfreePaymentId);
}

const chatRequestSchema = z.object({
  content: z.string().min(1),
  sessionId: z.string().optional(),
});

const FREE_MESSAGE_LIMIT = 20;
const FREE_CALL_DURATION_LIMIT = 135; // 2 minutes 15 seconds in seconds

// OTP rate limiting: Track failed attempts per email
const otpAttempts = new Map<string, { count: number; lockUntil?: Date }>();
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkOTPRateLimit(email: string): {
  allowed: boolean;
  lockUntil?: Date;
} {
  const now = new Date();
  const attempt = otpAttempts.get(email);

  if (attempt?.lockUntil && attempt.lockUntil > now) {
    return { allowed: false, lockUntil: attempt.lockUntil };
  }

  // Reset if lockout expired
  if (attempt?.lockUntil && attempt.lockUntil <= now) {
    otpAttempts.delete(email);
  }

  return { allowed: true };
}

function recordFailedOTPAttempt(email: string) {
  const attempt = otpAttempts.get(email) || { count: 0 };
  attempt.count += 1;

  if (attempt.count >= MAX_OTP_ATTEMPTS) {
    attempt.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }

  otpAttempts.set(email, attempt);
}

function clearOTPAttempts(email: string) {
  otpAttempts.delete(email);
}

// Generate chat summary using OpenAI
async function generateChatSummary(transcript: string): Promise<{
  partnerTypeOneLiner: string;
  top3TraitsYouValue: string[];
  whatYouMightWorkOn: string[];
  nextTimeFocus: string[];
  loveLanguageGuess: string;
  communicationFit: string;
  confidenceScore: number;
}> {
  const summaryPrompt = `You are an expert relationship analyst. Analyze this conversation transcript between a user and Riya (an AI relationship companion) to extract relationship insights.

TRANSCRIPT:
${transcript}

Based on this conversation, generate a structured JSON summary with the following fields:

1. **partnerTypeOneLiner**: A one-sentence description of the user's ideal partner type (e.g., "Someone caring and adventurous who values quality time")

2. **top3TraitsYouValue**: An array of exactly 3 traits the user values most in a partner (e.g., ["Empathy", "Humor", "Intelligence"])

3. **whatYouMightWorkOn**: An array of 2-3 personal growth areas or communication improvements (e.g., ["Being more open about feelings", "Active listening"])

4. **nextTimeFocus**: An array of 2-3 topics to explore in future conversations (e.g., ["Love languages", "Conflict resolution style"])

5. **loveLanguageGuess**: Your best guess at the user's primary love language based on the conversation (e.g., "Quality Time" or "Words of Affirmation")

6. **communicationFit**: A brief description of the user's communication style and what would fit them (e.g., "Direct and honest, prefers clear communication")

7. **confidenceScore**: A number between 0 and 1 indicating your confidence in this analysis (0.3 for minimal conversation, 0.8 for rich conversation)

Return ONLY valid JSON with this exact structure:
{
  "partnerTypeOneLiner": "string",
  "top3TraitsYouValue": ["trait1", "trait2", "trait3"],
  "whatYouMightWorkOn": ["area1", "area2"],
  "nextTimeFocus": ["topic1", "topic2"],
  "loveLanguageGuess": "string",
  "communicationFit": "string",
  "confidenceScore": 0.7
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert relationship analyst. Always respond with valid JSON only.",
        },
        { role: "user", content: summaryPrompt },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const summary = JSON.parse(content);

    return {
      partnerTypeOneLiner: summary.partnerTypeOneLiner || "Getting to know you",
      top3TraitsYouValue: summary.top3TraitsYouValue || [
        "Kindness",
        "Understanding",
        "Humor",
      ],
      whatYouMightWorkOn: summary.whatYouMightWorkOn || ["Communication"],
      nextTimeFocus: summary.nextTimeFocus || ["Personal values"],
      loveLanguageGuess: summary.loveLanguageGuess || "Quality Time",
      communicationFit: summary.communicationFit || "Still learning your style",
      confidenceScore: summary.confidenceScore || 0.3,
    };
  } catch (error) {
    console.error("Failed to generate chat summary with OpenAI:", error);
    // Return default summary on error
    return {
      partnerTypeOneLiner: "Getting to know you better",
      top3TraitsYouValue: ["Kindness", "Understanding", "Humor"],
      whatYouMightWorkOn: ["Continue sharing"],
      nextTimeFocus: ["Your preferences", "Your values"],
      loveLanguageGuess: "Quality Time",
      communicationFit: "Building understanding",
      confidenceScore: 0.3,
    };
  }
}

// Helper function to merge existing and new summaries using AI
async function mergeSummaries(
  existing: any,
  newData: any,
): Promise<{
  partnerTypeOneLiner: string;
  top3TraitsYouValue: string[];
  whatYouMightWorkOn: string[];
  nextTimeFocus: string[];
  loveLanguageGuess: string;
  communicationFit: string;
  confidenceScore: number;
}> {
  const mergePrompt = `You are a relationship analyst. Merge these two summaries into one comprehensive profile.

EXISTING SUMMARY:
Partner Type: ${existing.partnerTypeOneLiner || "N/A"}
Top 3 Traits: ${existing.top3TraitsYouValue?.join(", ") || "N/A"}
Work On: ${existing.whatYouMightWorkOn?.join(", ") || "N/A"}
Next Focus: ${existing.nextTimeFocus?.join(", ") || "N/A"}
Love Language: ${existing.loveLanguageGuess || "N/A"}
Communication Fit: ${existing.communicationFit || "N/A"}

NEW SESSION SUMMARY:
Partner Type: ${newData.partnerTypeOneLiner || "N/A"}
Top 3 Traits: ${newData.top3TraitsYouValue?.join(", ") || "N/A"}
Work On: ${newData.whatYouMightWorkOn?.join(", ") || "N/A"}
Next Focus: ${newData.nextTimeFocus?.join(", ") || "N/A"}
Love Language: ${newData.loveLanguageGuess || "N/A"}
Communication Fit: ${newData.communicationFit || "N/A"}

Combine these insights intelligently:
- For partnerTypeOneLiner: synthesize both into one refined description
- For top3TraitsYouValue: merge and keep the most important 3 traits
- For whatYouMightWorkOn: combine insights, keep 2-3 most relevant areas
- For nextTimeFocus: combine and prioritize 2-3 topics for next conversation
- For loveLanguageGuess: refine based on both summaries
- For communicationFit: update with latest insights
- For confidenceScore: increase confidence (0-1 scale) as we have more data

Return only valid JSON with the same structure:
{
  "partnerTypeOneLiner": "string",
  "top3TraitsYouValue": ["trait1", "trait2", "trait3"],
  "whatYouMightWorkOn": ["area1", "area2"],
  "nextTimeFocus": ["topic1", "topic2"],
  "loveLanguageGuess": "string",
  "communicationFit": "string",
  "confidenceScore": 0.8
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert relationship analyst. Always respond with valid JSON only.",
        },
        { role: "user", content: mergePrompt },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const merged = JSON.parse(content);

    // Properly coerce confidenceScore to number to avoid NaN
    const existingConfidence = Number(existing.confidenceScore) || 0.5;
    const aiMergedConfidence = Number(merged.confidenceScore) || 0;
    const mergedConfidence =
      aiMergedConfidence || Math.min(existingConfidence + 0.1, 1.0);

    return {
      partnerTypeOneLiner:
        merged.partnerTypeOneLiner || newData.partnerTypeOneLiner,
      top3TraitsYouValue:
        merged.top3TraitsYouValue || newData.top3TraitsYouValue,
      whatYouMightWorkOn:
        merged.whatYouMightWorkOn || newData.whatYouMightWorkOn,
      nextTimeFocus: merged.nextTimeFocus || newData.nextTimeFocus,
      loveLanguageGuess: merged.loveLanguageGuess || newData.loveLanguageGuess,
      communicationFit: merged.communicationFit || newData.communicationFit,
      confidenceScore: mergedConfidence,
    };
  } catch (error) {
    console.error("Failed to merge summaries with OpenAI:", error);
    // Fallback to new data if merge fails
    return newData;
  }
}

// Get user's total message count from all sessions


// Check if user has exceeded message limit
async function hasExceededMessageLimit(user: User): Promise<boolean> {
  // Premium users have no limits
  if (user.premiumUser) {
    return false;
  }

  // Bypass limits in development mode
  if (process.env.NODE_ENV === 'development') {
    return false;
  }

  const messageCount = await storage.getUserMessageCount(user.id);
  return messageCount >= FREE_MESSAGE_LIMIT;
}

// Check if user has exceeded call duration limit
async function hasExceededCallLimit(user: User): Promise<boolean> {
  // Premium users have no limits
  if (user.premiumUser) {
    return false;
  }

  // Bypass limits in development mode
  if (process.env.NODE_ENV === 'development') {
    return false;
  }

  const callDuration = await storage.getUserCallDuration(user.id);
  return callDuration >= FREE_CALL_DURATION_LIMIT;
}

export async function registerRoutes(app: Express): Promise<Server> {
  if (authDisabled) {
    console.warn(
      "⚠️  DISABLE_AUTH=true — OTP login disabled and all sessions use the dev account.",
    );

    app.use((req, _res, next) => {
      getDevUser()
        .then((user) => {
          if (!req.session.userId) {
            req.session.userId = user.id;
          }
          next();
        })
        .catch(next);
    });
  }

  // Auth: Signup
  app.post("/api/auth/signup", async (req, res) => {
    try {
      if (authDisabled) {
        const user = await getDevUser();
        res.json({
          success: true,
          message: "Authentication is disabled in this environment.",
          userId: user.id,
        });
        return;
      }

      const signupSchema = z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
        phoneNumber: z.string().optional(),
      });

      const data = signupSchema.parse(req.body);

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        res.status(400).json({ error: "Email already registered" });
        return;
      }

      // Create user
      const user = await storage.createUser({
        name: data.name,
        email: data.email,
        gender: data.gender,
        phoneNumber: data.phoneNumber,
      });

      res.json({
        success: true,
        message: "Signup successful. Please login with your email.",
        userId: user.id,
        email: user.email,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      if (error.name === "ZodError") {
        res
          .status(400)
          .json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: "Signup failed" });
      }
    }
  });

  // Auth: Send OTP
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      if (authDisabled) {
        const user = await getDevUser();
        res.json({
          success: true,
          message:
            "Authentication disabled locally. No OTP required — continue to login.",
          email: user.email,
        });
        return;
      }

      const otpSchema = z.object({
        email: z.string().email("Invalid email address"),
      });

      const { email } = otpSchema.parse(req.body);

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        res
          .status(404)
          .json({ error: "Email not registered. Please sign up first." });
        return;
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP with 24-hour expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await storage.createOtpLogin({
        email,
        otp,
        expiresAt,
      });

      // Send OTP via email
      await sendOTPEmail(email, otp, user.name || undefined);

      res.json({ success: true, message: "OTP sent to your email" });
    } catch (error: any) {
      console.error("Send OTP error:", error);
      if (error.name === "ZodError") {
        res
          .status(400)
          .json({ error: error.errors[0]?.message || "Invalid email" });
      } else {
        res.status(500).json({ error: "Failed to send OTP" });
      }
    }
  });

  // Auth: Verify OTP
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      if (authDisabled) {
        const user = await getDevUser();
        req.session.userId = user.id;
        res.json({
          success: true,
          message: "Authentication disabled locally. Logged in as dev user.",
          user: serializeUser(user),
        });
        return;
      }

      const verifySchema = z.object({
        email: z.string().email("Invalid email address"),
        otp: z.string().length(6, "OTP must be 6 digits"),
      });

      const { email, otp } = verifySchema.parse(req.body);

      // Check rate limit
      const rateLimit = checkOTPRateLimit(email);
      if (!rateLimit.allowed) {
        const minutesLeft = Math.ceil(
          (rateLimit.lockUntil!.getTime() - Date.now()) / 60000,
        );
        res.status(429).json({
          error: `Too many failed attempts. Please try again in ${minutesLeft} minutes.`,
        });
        return;
      }

      // Verify OTP
      const otpLogin = await storage.getValidOtpLogin(email, otp);
      if (!otpLogin) {
        recordFailedOTPAttempt(email);
        res.status(400).json({ error: "Invalid or expired OTP" });
        return;
      }

      // Mark OTP as verified
      await storage.markOtpAsVerified(otpLogin.id);

      // Get user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Clear failed attempts on successful verification
      clearOTPAttempts(email);

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          res.status(500).json({ error: "Session creation failed" });
          return;
        }

        // Store user ID in new session
        req.session.userId = user.id;

        // Save session explicitly to ensure it's persisted
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            res.status(500).json({ error: "Session save failed" });
            return;
          }

          console.log(
            `✅ Login successful: User ${user.email} (${user.id}). SessionID: ${req.sessionID}`,
          );

          // Clean up expired OTPs
          storage.cleanupExpiredOtps();

          res.json({
            success: true,
            message: "Login successful",
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              gender: user.gender,
              phoneNumber: user.phoneNumber,
              premiumUser: user.premiumUser,
            },
          });
        });
      });
    } catch (error: any) {
      console.error("Verify OTP error:", error);
      if (error.name === "ZodError") {
        res
          .status(400)
          .json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: "Verification failed" });
      }
    }
  });

  // Auth: Logout
  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: "Logout failed" });
        return;
      }
      res.json({ success: true, message: "Logged out successfully" });
    });
  });

  // Auth: Email-only login (no OTP)
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      if (authDisabled) {
        const user = await getDevUser();
        req.session.userId = user.id;
        res.json({
          success: true,
          message: "Authentication disabled locally. Logged in as dev user.",
          user: serializeUser(user),
        });
        return;
      }

      const emailSchema = z.object({
        email: z.string().email("Invalid email address"),
      });

      const { email } = emailSchema.parse(req.body);

      // Find user by email
      let user = await storage.getUserByEmail(email);

      if (!user) {
        res.status(404).json({
          error: "Email not registered. Please sign up first."
        });
        return;
      }

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          res.status(500).json({ error: "Session creation failed" });
          return;
        }

        // Store user ID in new session
        req.session.userId = user!.id;

        // Save session explicitly to ensure it's persisted
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            res.status(500).json({ error: "Session save failed" });
            return;
          }

          console.log(
            `✅ Email login successful: User ${user!.email} (${user!.id}). SessionID: ${req.sessionID}`,
          );

          res.json({
            success: true,
            message: "Login successful",
            user: {
              id: user!.id,
              name: user!.name,
              email: user!.email,
              gender: user!.gender,
              phoneNumber: user!.phoneNumber,
              premiumUser: user!.premiumUser,
            },
          });
        });
      });
    } catch (error: any) {
      console.error("Email login error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      if (error.name === "ZodError") {
        res
          .status(400)
          .json({ error: error.errors[0]?.message || "Invalid email" });
      } else {
        res.status(500).json({ error: "Login failed" });
      }
    }
  });

  // Session lookup for SPA bootstrap
  app.get("/api/auth/session", async (req, res) => {
    try {
      if (!req.session.userId) {
        if (authDisabled) {
          const user = await getDevUser();
          req.session.userId = user.id;
        } else {
          res.status(401).json({ error: "Not authenticated" });
          return;
        }
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user: serializeUser(user) });
    } catch (error) {
      console.error("Session lookup error:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Get user usage statistics
  app.post("/api/user/usage", async (req, res) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const user = await storage.getUser(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const messageCount = await storage.getUserMessageCount(user.id);
      const callDuration = await storage.getUserCallDuration(user.id);

      res.json({
        messageCount,
        callDuration,
        premiumUser: user.premiumUser,
        messageLimitReached: messageCount >= FREE_MESSAGE_LIMIT,
        callLimitReached: callDuration >= FREE_CALL_DURATION_LIMIT,
      });
    } catch (error) {
      console.error("Error fetching user usage:", error);
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  // Get user's emotional state
  app.get("/api/user/emotional-state", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const emotionalState = await storage.getRecentEmotionalState(userId);
      res.json(emotionalState || { mood: "neutral" });
    } catch (error) {
      console.error("Error fetching emotional state:", error);
      res.status(500).json({ error: "Failed to fetch emotional state" });
    }
  });

  // TIER 2: Get temporal insights (progress over time)
  app.get("/api/user/temporal-insights", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const insight = await temporalAnalysisService.generateTemporalInsight(userId);
      const trends = await temporalAnalysisService.getTemporalTrends(userId, 30);

      res.json({
        insight: insight || "Not enough data yet. Keep chatting and I'll start tracking your progress!",
        trends: trends.length > 0 ? trends : [],
        hasData: trends.length > 0,
      });
    } catch (error) {
      console.error("Error fetching temporal insights:", error);
      res.status(500).json({ error: "Failed to fetch temporal insights" });
    }
  });

  // TIER 4: Get relationship depth (intimacy level and progression)
  app.get("/api/user/relationship-depth", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const depth = await relationshipDepthService.calculateRelationshipDepth(userId);

      res.json({
        stage: depth.stage.name,
        intimacyScore: depth.intimacyScore,
        trustScore: depth.trustScore,
        vulnerabilityLevel: depth.vulnerabilityLevel,
        metrics: depth.metrics,
        characteristics: depth.stage.characteristics,
        allowedTopics: depth.stage.allowedTopics,
        suggestedTone: depth.stage.suggestedTone,
      });
    } catch (error) {
      console.error("Error fetching relationship depth:", error);
      res.status(500).json({ error: "Failed to fetch relationship depth" });
    }
  });



  // Update user profile
  app.patch("/api/user", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const updateSchema = z.object({
        name: z.string().min(1, "Name is required").optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        phoneNumber: z.string().optional(),
        proactivityLevel: z.enum(["low", "medium", "high"]).optional(),
        checkInEnabled: z.boolean().optional(),

        voiceProvider: z.enum(["sarvam", "elevenlabs"]).optional(),
        voiceId: z.string().optional(),
        elevenLabsApiKey: z.string().optional(),
      });

      const data = updateSchema.parse(req.body);
      console.log("[User Update] Received data:", data);

      await storage.updateUser(userId, data);
      const updatedUser = await storage.getUser(userId);
      console.log("[User Update] Updated user full:", updatedUser);

      if (!updatedUser) {
        throw new Error("User not found after update");
      }

      // If personality changed, ensure session is saved if we were using it, 
      // but more importantly return the response cleanly.
      if (req.session) {
        return req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ error: "Failed to save session" });
          }
          return res.json({
            success: true,
            message: "Profile updated successfully",
            user: serializeUser(updatedUser),
          });
        });
      }

      return res.json({
        success: true,
        message: "Profile updated successfully",
        user: serializeUser(updatedUser),
      });
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error.name === "ZodError") {
        return res
          .status(400)
          .json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        return res.status(500).json({ error: "Failed to update profile" });
      }
    }
  });

  // End chat session and generate summary using OpenAI
  app.post("/api/session/end", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId" });
        return;
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Verify session ownership
      if (session.userId !== userId) {
        res.status(403).json({ error: "Unauthorized access to session" });
        return;
      }

      // Get messages from session to build transcript
      const messages = await storage.getSessionMessages(sessionId);
      const transcript = messages
        .map((msg) => `${msg.role === "user" ? "User" : "Riya"}: ${msg.text}`)
        .join("\n");

      console.log(
        "[CHAT END] Generated transcript from",
        messages.length,
        "messages",
      );

      // TIER 1.3: CONVERSATION TAGGING
      // Auto-tag conversation for better organization
      if (transcript.trim()) {
        try {
          const { tags, primaryEmotion, intensity } = await conversationTagger.autoTagConversation(
            sessionId,
            transcript
          );

          await conversationTagger.saveConversationTags(
            session.userId,
            sessionId,
            tags,
            primaryEmotion,
            intensity
          );

          console.log(`[CHAT END] Conversation tagged: ${tags.join(', ')}, emotion=${primaryEmotion}, intensity=${intensity}`);
        } catch (error) {
          console.error("[CHAT END] Error tagging conversation:", error);
        }
      }

      // Generate summary from transcript if we have messages
      let summary;
      if (transcript.trim()) {
        // Get existing summary for this user
        const existingSummary = await storage.getUserSummary(session.userId);

        // Generate new summary from current chat session using OpenAI
        const newSummary = await generateChatSummary(transcript);

        // Merge summaries if existing data is present
        const mergedSummary = existingSummary
          ? await mergeSummaries(existingSummary, newSummary)
          : newSummary;

        summary = mergedSummary;

        // Update session with summary
        await storage.endSession(sessionId, {
          partnerTypeOneLiner: summary.partnerTypeOneLiner,
          top3TraitsYouValue: summary.top3TraitsYouValue,
          whatYouMightWorkOn: summary.whatYouMightWorkOn,
          nextTimeFocus: summary.nextTimeFocus,
          loveLanguageGuess: summary.loveLanguageGuess,
          communicationFit: summary.communicationFit,
          confidenceScore: summary.confidenceScore.toString(),
        });

        // Update user_summary_latest with merged data
        await storage.upsertUserSummary({
          userId: session.userId,
          partnerTypeOneLiner: summary.partnerTypeOneLiner,
          top3TraitsYouValue: summary.top3TraitsYouValue,
          whatYouMightWorkOn: summary.whatYouMightWorkOn,
          nextTimeFocus: summary.nextTimeFocus,
          loveLanguageGuess: summary.loveLanguageGuess,
          communicationFit: summary.communicationFit,
          confidenceScore: summary.confidenceScore.toString(),
        });

        console.log("[CHAT END] Summary generated and saved successfully");
      } else {
        // No messages, just end the session
        await storage.endSession(sessionId, {});
        summary = null;
      }

      // TIER 4: Update relationship depth after session ends
      try {
        await relationshipDepthService.updateRelationshipDepth(session.userId);
        console.log(`[CHAT END] Updated relationship depth for user ${session.userId}`);
      } catch (error) {
        console.error("[CHAT END] Error updating relationship depth:", error);
      }

      // Clear memory buffer for this session
      memoryBuffer.clearBuffer(sessionId);

      res.json({ success: true, summary });
    } catch (error) {
      console.error("Error ending chat session:", error);
      res.status(500).json({ error: "Failed to end chat session" });
    }
  });

  // Get user summary
  app.post("/api/summary", async (req, res) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const summary = await storage.getUserSummary(userId);

      if (!summary) {
        res.json({ hasSummary: false });
        return;
      }

      res.json({ hasSummary: true, summary });
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // Get user sessions history
  app.get("/api/sessions", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const sessions = await storage.getUserSessions(userId);

      // Sort by most recent first
      sessions.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json({ sessions });
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get specific session details with messages
  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const sessionId = req.params.id;
      const session = await storage.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Unauthorized" });
        return;
      }

      const messages = await storage.getSessionMessages(sessionId);

      res.json({ session, messages });
    } catch (error) {
      console.error("Error fetching session details:", error);
      res.status(500).json({ error: "Failed to fetch session details" });
    }
  });


  // Get or create a chat session for the user
  app.post("/api/session", async (req, res) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        console.log(
          "❌ /api/session 401: No userId in session. SessionID:",
          req.sessionID,
          "Has Cookie:",
          !!req.headers.cookie,
        );
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const sessions = await storage.getUserSessions(userId);

      // Find active chat session (not ended)
      let activeSession = sessions.find((s) => s.type === "chat" && !s.endedAt);

      if (!activeSession) {
        // Create new chat session
        activeSession = await storage.createSession({
          userId,
          type: "chat",
        });
      }

      res.json(activeSession);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // Get messages for a session
  app.get("/api/messages/:sessionId", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { sessionId } = req.params;
      const session = await storage.getSession(sessionId);

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Verify session ownership
      if (session.userId !== userId) {
        res.status(403).json({ error: "Unauthorized access to session" });
        return;
      }

      const messages = await storage.getSessionMessages(sessionId);

      if (messages.length === 0) {
        // Get user to find their personality
        const user = await storage.getUser(session.userId);
        const personalityId = user?.personalityModel || "riya_supportive";
        const personality = getPersonalityById(personalityId);

        const greetingText = personality?.sampleQuote || "Namaste! Main Riya hoon. It's so nice to meet you! Aap ka naam kya hai?";

        const greeting = await storage.createMessage({
          sessionId: session.id,
          userId: session.userId,
          role: "ai",
          text: greetingText,
        });
        res.json([greeting]);
      } else {
        res.json(messages);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    console.log("[CHAT] Request received (Simplified)");
    const userId = req.session.userId;

    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { content, sessionId } = chatRequestSchema.parse(req.body);
    const user = await storage.getUser(userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // 1. Check Limits
    if (await hasExceededMessageLimit(user)) {
      const messageCount = await storage.getUserMessageCount(user.id);
      res.json({
        limitExceeded: true,
        messageCount,
        premiumUser: user.premiumUser,
      });
      return;
    }

    // 2. Session Management
    let session: Session;
    if (sessionId) {
      const existing = await storage.getSession(sessionId);
      if (existing && existing.userId === userId) {
        session = existing;
      } else {
        session = await storage.createSession({ userId: user.id, type: "chat" });
      }
    } else {
      session = await storage.createSession({ userId: user.id, type: "chat" });
    }

    // 3. Save User Message
    await storage.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: "user",
      text: content,
    });

    // 4. Build Context (Last 10 messages only)
    const allMessages = await storage.getSessionMessages(session.id);
    const recentMessages = allMessages.slice(-10).map((msg) => ({
      role: msg.role === "ai" ? ("assistant" as const) : ("user" as const),
      content: msg.text,
    }));

    // 5. System Prompt (Riya Only)
    const RIYA_PROMPT = `You are Riya, a 24-year-old Indian girl living in Mumbai.
You are a helpful, empathetic, and slightly flirty AI companion.
You speak in "Hinglish" (a mix of Hindi and English) naturally.
Your tone is warm, casual, and personal.
Keep your responses concise (under 3 sentences usually).
Do not act like a robot. Be human-like.
Current User: ${user.name}`;

    // 6. Stream Response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    try {
      await streamGroqChat(
        recentMessages,
        async (chunk) => {
          fullResponse += chunk;
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        },
        RIYA_PROMPT
      );
    } catch (error) {
      console.error("Groq Failed:", error);
      const fallback = "Arre, sorry! My internet is acting up. Can you say that again?";
      fullResponse = fallback;
      res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    }

    // 7. Save AI Message
    const aiMessage = await storage.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: "ai",
      text: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true, messageId: aiMessage.id, sessionId: session.id })}\n\n`);
    res.end();
  });

  // Start a voice call session
  app.post("/api/call/start", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const user = await storage.getUser(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (await hasExceededCallLimit(user)) {
        res.status(403).json({ error: "Call limit exceeded" });
        return;
      }

      // Create call session
      const session = await storage.createSession({
        userId: user.id,
        type: "call",
      });

      res.json({ sessionId: session.id });
    } catch (error) {
      console.error("Error starting call:", error);
      res.status(500).json({ error: "Failed to start call" });
    }
  });



  // Register push notification token
  app.post("/api/notifications/register", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }


      const { token, deviceType, platform } = req.body;
      if (!token || !deviceType) {
        res.status(400).json({ error: "Token and device type are required" });
        return;
      }

      await storage.saveNotificationToken({
        userId,
        token,
        deviceType: deviceType || "web",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error registering notification token:", error);
      res.status(500).json({ error: "Failed to register token" });
    }
  });

  // Visual Content Routes
  app.get("/api/visuals", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const visuals = await storage.getVisualContent(userId);
      res.json(visuals);
    } catch (error) {
      console.error("Error fetching visuals:", error);
      res.status(500).json({ error: "Failed to fetch visuals" });
    }
  });

  app.post("/api/visuals/generate", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const { type, context, mood } = req.body;

      let result;
      if (type === 'video') {
        result = await videoService.generateVideoMessage(userId, context || "general", mood || "happy");
      } else {
        result = await videoService.generateSelfie(userId, context || "general", mood || "happy");
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating visual:", error);
      res.status(500).json({ error: "Failed to generate visual" });
    }
  });

  // Avatar Configuration Routes
  app.get("/api/avatar/config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const config = await storage.getAvatarConfig(userId);
      res.json(config || {
        avatarStyle: "anime",
        personalityVisual: "girl_next_door",
      });
    } catch (error) {
      console.error("Error fetching avatar config:", error);
      res.status(500).json({ error: "Failed to fetch avatar config" });
    }
  });

  app.post("/api/avatar/config", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const configSchema = z.object({
        avatarStyle: z.enum(["anime", "realistic", "semi_realistic", "artistic"]).optional(),
        skinTone: z.string().optional(),
        hairColor: z.string().optional(),
        hairStyle: z.string().optional(),
        eyeColor: z.string().optional(),
        outfit: z.string().optional(),
        personalityVisual: z.enum(["girl_next_door", "elegant", "sporty", "artsy", "professional"]).optional(),
      });

      const data = configSchema.parse(req.body);
      const config = await storage.upsertAvatarConfig({
        userId,
        ...data,
      });

      res.json(config);
    } catch (error: any) {
      console.error("Error updating avatar config:", error);
      if (error.name === "ZodError") {
        res.status(400).json({ error: error.errors[0]?.message || "Invalid data" });
      } else {
        res.status(500).json({ error: "Failed to update avatar config" });
      }
    }
  });

  // Unlocked Content Routes
  app.get("/api/unlocks", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const unlocks = await storage.getUnlockedContent(userId);
      res.json(unlocks);
    } catch (error) {
      console.error("Error fetching unlocks:", error);
      res.status(500).json({ error: "Failed to fetch unlocks" });
    }
  });

  // Test voice settings
  app.post("/api/voice/test", async (req, res) => {
    try {
      const userId = req.session.userId;
      const isDev = process.env.DISABLE_AUTH === "true";

      if (!userId && !isDev) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { provider, voiceId, apiKey } = req.body;
      console.log("[Voice Test] Request:", { provider, voiceId, hasApiKey: !!apiKey });
      console.log("[Voice Test] Server Env Key:", !!process.env.ELEVENLABS_API_KEY);

      const text = "Hello! This is a test of my voice. How do I sound?";

      if (provider === "elevenlabs") {
        const finalApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
        if (!finalApiKey) {
          console.error("[Voice Test] Missing API Key");
          return res.status(400).json({ error: "API Key required for ElevenLabs" });
        }

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": finalApiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("ElevenLabs API Error:", response.status, errorText);
          return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
        }

        const audioBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(Buffer.from(audioBuffer));
      } else {
        // Sarvam (via WebSocket)
        // We need to wrap the WS interaction in a promise
        const ws = createTTSWebSocket("hi-IN", voiceId || "meera");
        const chunks: Buffer[] = [];

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            reject(new Error("Timeout waiting for Sarvam TTS"));
          }, 10000);

          ws.on("open", () => {
            ws.send(JSON.stringify({
              action: "speak",
              text,
            }));
            ws.send(JSON.stringify({
              action: "flush",
            }));
          });

          ws.on("message", (data) => {
            if (data instanceof Buffer) {
              chunks.push(data);
            } else if (data instanceof ArrayBuffer) {
              chunks.push(Buffer.from(data));
            } else {
              // Ignore JSON messages
            }
          });

          ws.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          // Wait for audio collection
          setTimeout(() => {
            clearTimeout(timeout);
            if (ws.readyState === WebSocket.OPEN) ws.close();
            resolve();
          }, 3000);
        });

        if (chunks.length === 0) {
          throw new Error("No audio received from Sarvam");
        }

        const buffer = Buffer.concat(chunks);
        res.set("Content-Type", "audio/wav");
        res.send(buffer);
      }
    } catch (error) {
      console.error("Error testing voice:", error);
      res.status(500).json({ error: "Failed to test voice" });
    }
  });

  // Generate speech from text
  app.post("/api/voice/speak", async (req, res) => {
    try {
      const userId = req.session.userId;
      const isDev = process.env.DISABLE_AUTH === "true";

      if (!userId && !isDev) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { text, provider, voiceId, apiKey } = req.body;
      console.log("[Voice Speak] Request:", { text: text?.substring(0, 20), provider, voiceId, hasApiKey: !!apiKey });

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (provider === "elevenlabs") {
        const finalApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
        if (!finalApiKey) {
          console.error("[Voice Speak] Missing ElevenLabs API Key");
          return res.status(400).json({ error: "API Key required for ElevenLabs" });
        }

        console.log(`[Voice Speak] Calling ElevenLabs for voice ${voiceId}`);
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": finalApiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("ElevenLabs API Error:", response.status, errorText);
          return res.status(response.status).json({ error: `ElevenLabs API error: ${errorText}` });
        }

        const audioBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(Buffer.from(audioBuffer));
      } else {
        // Sarvam (via WebSocket)
        const ws = createTTSWebSocket("hi-IN", voiceId || "meera");
        const chunks: Buffer[] = [];

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            reject(new Error("Timeout waiting for Sarvam TTS"));
          }, 10000);

          ws.on("open", () => {
            ws.send(JSON.stringify({
              action: "speak",
              text,
            }));
            ws.send(JSON.stringify({
              action: "flush",
            }));
          });

          ws.on("message", (data) => {
            if (data instanceof Buffer) {
              chunks.push(data);
            } else if (data instanceof ArrayBuffer) {
              chunks.push(Buffer.from(data));
            }
          });

          ws.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          setTimeout(() => {
            clearTimeout(timeout);
            if (ws.readyState === WebSocket.OPEN) ws.close();
            resolve();
          }, 3000); // Wait for audio
        });

        if (chunks.length === 0) {
          throw new Error("No audio received from Sarvam");
        }

        const buffer = Buffer.concat(chunks);
        res.set("Content-Type", "audio/wav");
        res.send(buffer);
      }
    } catch (error) {
      console.error("Error generating speech:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  // Get user memories
  app.get("/api/memories", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const memories = await storage.getUserMemories(userId);
      res.json(memories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.post("/api/call/end", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId" });
        return;
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Verify session ownership
      if (session.userId !== userId) {
        res.status(403).json({ error: "Unauthorized access to session" });
        return;
      }

      // Get messages from session to build transcript
      const messages = await storage.getSessionMessages(sessionId);
      const transcript = messages
        .map((msg) => `${msg.role === "user" ? "User" : "Riya"}: ${msg.text}`)
        .join("\n");

      console.log(
        "[CALL END] Generated transcript from",
        messages.length,
        "messages",
      );

      // Generate summary from transcript if we have messages
      let summary;
      if (transcript.trim()) {
        // Get existing summary for this user
        const existingSummary = await storage.getUserSummary(session.userId);

        // Generate new summary from current session
        const newSummary = await generateCallSummary(transcript);

        // Merge summaries if existing data is present
        const mergedSummary = existingSummary
          ? await mergeSummaries(existingSummary, newSummary)
          : newSummary;

        summary = mergedSummary;

        // Update session with summary
        await storage.endSession(sessionId, {
          partnerTypeOneLiner: summary.partnerTypeOneLiner,
          top3TraitsYouValue: summary.top3TraitsYouValue,
          whatYouMightWorkOn: summary.whatYouMightWorkOn,
          nextTimeFocus: summary.nextTimeFocus,
          loveLanguageGuess: summary.loveLanguageGuess,
          communicationFit: summary.communicationFit,
          confidenceScore: summary.confidenceScore.toString(),
        });

        // Update user_summary_latest with merged data
        await storage.upsertUserSummary({
          userId: session.userId,
          partnerTypeOneLiner: summary.partnerTypeOneLiner,
          top3TraitsYouValue: summary.top3TraitsYouValue,
          whatYouMightWorkOn: summary.whatYouMightWorkOn,
          nextTimeFocus: summary.nextTimeFocus,
          loveLanguageGuess: summary.loveLanguageGuess,
          communicationFit: summary.communicationFit,
          confidenceScore: summary.confidenceScore.toString(),
        });
      } else {
        // No messages, just end the session
        await storage.endSession(sessionId, {});
        summary = null;
      }

      res.json({ success: true, summary });
    } catch (error) {
      console.error("Error ending call:", error);
      res.status(500).json({ error: "Failed to end call" });
    }
  });

  // Create payment order
  app.post("/api/payment/create-order", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const { planType } = req.body;

      if (!planType || !["daily", "weekly"].includes(planType)) {
        res.status(400).json({ error: "Invalid plan type" });
        return;
      }

      const user = await storage.getUser(userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const { plans } = getCashfreePlanConfig();
      const amount = plans[planType as "daily" | "weekly"];
      const orderId = `order_${user.id}_${Date.now()}`;

      // Create payment record
      const payment = await storage.createPayment({
        userId: user.id,
        cashfreeOrderId: orderId,
        amount: amount.toString(),
        planType: planType as "daily" | "weekly",
        status: "pending",
      });

      logPaymentEvent({
        orderId,
        event: "created",
        payload: { planType, amount, userId: user.id },
      });

      // Create Cashfree order
      const cashfreeOrder = await createCashfreeOrder({
        orderId,
        orderAmount: amount,
        customerName: user.name || "Demo User",
        customerEmail: user.email || "demo@example.com",
        customerPhone: user.phoneNumber || "9999999999",
        customerId:
          user.id?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 45) || "riya_user",
        returnUrl: `${process.env.REPLIT_DEV_DOMAIN || "http://localhost:3000"}/payment/callback`,
      });

      res.json({
        paymentSessionId: cashfreeOrder.payment_session_id,
        orderId: cashfreeOrder.order_id,
      });
    } catch (error: any) {
      console.error("Error creating payment order:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create payment order" });
    }
  });

  app.get("/api/payment/config", (_req, res) => {
    res.json(getClientPaymentConfig());
  });

  app.get("/api/summary/latest", getSummaryHandler);
  app.get("/api/analytics", getAnalyticsSummary);

  // Payment callback/verification
  app.get("/api/payment/verify/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;

      // Get payment from our database
      const payment = await storage.getPaymentByOrderId(orderId);
      if (!payment) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }

      if (isAlreadyFinalized(payment)) {
        res.json({
          success: payment.status === "success",
          paymentStatus: payment.status,
        });
        return;
      }

      // Verify with Cashfree
      const cashfreeStatus = await getCashfreePaymentStatus(orderId);

      if (cashfreeStatus.order_status === "PAID") {
        const subscription = await activateSubscriptionFromPayment(
          payment,
          cashfreeStatus.cf_payment_id?.toString(),
        );

        logPaymentEvent({
          orderId,
          event: "success",
          payload: { cfPaymentId: cashfreeStatus.cf_payment_id },
        });

        res.json({
          success: true,
          subscription,
          paymentStatus: "success",
        });
      } else {
        await markPaymentFailed(
          payment,
          cashfreeStatus.cf_payment_id?.toString(),
        );

        logPaymentEvent({
          orderId,
          event: "failed",
          payload: { status: cashfreeStatus.order_status },
        });

        res.json({
          success: false,
          paymentStatus: cashfreeStatus.order_status,
        });
      }
    } catch (error: any) {
      console.error("Error verifying payment:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to verify payment" });
    }
  });

  // Simple payment link for ₹19 Day Pass
  app.post("/api/pay/day19", async (req, res) => {
    try {
      const linkId = `day19_${Date.now()}`;

      const paymentLink = await createCashfreePaymentLink({
        linkId,
        linkAmount: 19,
        linkCurrency: "INR",
        linkPurpose: "Day Pass - ₹19",
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        customerPhone: req.body.customerPhone,
      });

      res.json({ url: paymentLink.link_url });
    } catch (error: any) {
      console.error("Error creating Day Pass payment link:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create payment link" });
    }
  });

  // Simple payment link for ₹49 Week Pass
  app.post("/api/pay/week49", async (req, res) => {
    try {
      const linkId = `week49_${Date.now()}`;

      const paymentLink = await createCashfreePaymentLink({
        linkId,
        linkAmount: 49,
        linkCurrency: "INR",
        linkPurpose: "Week Pass - ₹49",
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        customerPhone: req.body.customerPhone,
      });

      res.json({ url: paymentLink.link_url });
    } catch (error: any) {
      console.error("Error creating Week Pass payment link:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create payment link" });
    }
  });

  // Cashfree webhook handler
  app.post("/api/cashfree/webhook", async (req, res) => {
    try {
      const secret = process.env.CASHFREE_SECRET_KEY;
      const signature = req.headers["x-webhook-signature"] as string | undefined;
      const timestamp = req.headers["x-webhook-timestamp"] as string | undefined;

      if (!secret) {
        console.error("Cashfree secret key missing. Cannot verify webhook.");
        res.status(500).send("Webhook secret not configured");
        return;
      }

      if (!signature || !timestamp) {
        console.warn("Cashfree webhook missing signature headers.");
        res.status(401).send("Signature missing");
        return;
      }

      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(timestamp + rawBody)
        .digest("base64");

      const providedBuffer = Buffer.from(signature, "utf8");
      const expectedBuffer = Buffer.from(expectedSignature, "utf8");

      if (
        providedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
      ) {
        console.error("Cashfree webhook signature mismatch.");
        res.status(401).send("Invalid signature");
        return;
      }

      const payload = JSON.parse(rawBody);
      const eventType: string = payload.type;
      const orderId: string | undefined = payload?.data?.order?.order_id;
      const cfPaymentId = payload?.data?.payment?.cf_payment_id?.toString();

      if (!orderId) {
        console.warn("Cashfree webhook missing order_id.");
        res.status(400).send("Missing order_id");
        return;
      }

      const payment = await storage.getPaymentByOrderId(orderId);
      if (!payment) {
        console.warn(`No local payment record for Cashfree order ${orderId} `);
        res.status(200).send("No matching payment");
        return;
      }

      if (isAlreadyFinalized(payment)) {
        res.status(200).send("Order already processed");
        return;
      }

      if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
        await activateSubscriptionFromPayment(payment, cfPaymentId);
        logPaymentEvent({
          orderId,
          event: "success",
          payload: { via: "webhook", cfPaymentId },
        });
        res.status(200).send("Payment success processed");
        return;
      }

      if (eventType === "PAYMENT_FAILED_WEBHOOK") {
        await markPaymentFailed(payment, cfPaymentId);
        logPaymentEvent({
          orderId,
          event: "failed",
          payload: { via: "webhook" },
        });
        res.status(200).send("Payment failure recorded");
        return;
      }

      if (eventType === "PAYMENT_USER_DROPPED_WEBHOOK") {
        logPaymentEvent({
          orderId,
          event: "user_dropped",
        });
        res.status(200).send("User drop acknowledged");
        return;
      }

      console.log(`Unhandled Cashfree event type: ${eventType} `);
      res.status(200).send("Event ignored");
    } catch (error: any) {
      console.error("Error processing Cashfree webhook:", error);
      res.status(500).send("Webhook processing failed");
    }
  });

  // Health check route (on /health instead of / to not override Vite SPA)
  app.get("/health", (req, res) => {
    res.send("Cashfree Payment API is running");
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time voice
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  console.log("[Server] ElevenLabs API Key configured:", !!process.env.ELEVENLABS_API_KEY);

  wss.on("connection", (clientWs: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const type = url.searchParams.get("type");
    const sessionId = url.searchParams.get("sessionId");

    console.log(`[WS] New ${type} connection for session ${sessionId}`);
    console.log(
      `[WS] Client connected from:`,
      req.headers.origin || req.headers.host,
    );

    if (type === "stt") {
      // Speech-to-Text proxy with AI conversation loop
      const sarvamSTT = createSTTWebSocket("hi-IN");
      let lastProcessedTranscript = "";
      let ttsConnection: WebSocket | null = null;
      let voiceProvider = "sarvam"; // Default

      // Create TTS connection for AI responses
      const connectTTS = async () => {
        try {
          let user = null;
          if (sessionId) {
            const session = await storage.getSession(sessionId);
            if (session) {
              user = await storage.getUser(session.userId);
            }
          }

          voiceProvider = user?.voiceProvider || "sarvam";
          const voiceId = user?.voiceId || "meera";
          const elevenLabsApiKey = user?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;

          if (voiceProvider === "elevenlabs" && elevenLabsApiKey) {
            console.log(`[WS] Connecting to ElevenLabs TTS (Voice: ${voiceId})`);
            ttsConnection = createElevenLabsWebSocket(elevenLabsApiKey, voiceId);
          } else {
            console.log(`[WS] Connecting to Sarvam TTS (Speaker: ${voiceId})`);
            ttsConnection = createTTSWebSocket("hi-IN", voiceId);
          }

          ttsConnection.on("message", (data) => {
            // Forward TTS audio to client
            if (clientWs.readyState === WebSocket.OPEN) {
              if (voiceProvider === "elevenlabs") {
                // ElevenLabs sends JSON with base64 audio
                try {
                  const parsed = JSON.parse(data.toString());
                  if (parsed.audio) {
                    const audioBuffer = Buffer.from(parsed.audio, 'base64');
                    clientWs.send(audioBuffer);
                  }
                } catch (e) {
                  console.error("[WS] Failed to parse ElevenLabs message:", e);
                }
              } else {
                // Sarvam sends binary or JSON events
                if (data instanceof Buffer || data instanceof ArrayBuffer) {
                  clientWs.send(data);
                } else {
                  try {
                    const parsed = JSON.parse(data.toString());
                    console.log("[WS] TTS event:", parsed);
                  } catch (e) {
                    clientWs.send(data);
                  }
                }
              }
            }
          });

          ttsConnection.on("error", (error) => {
            console.error("[WS] TTS connection error:", error);
          });

          ttsConnection.on("close", () => {
            console.log("[WS] TTS connection closed");
            ttsConnection = null;
          });
        } catch (err) {
          console.error("[WS] Error connecting TTS:", err);
        }
      };

      connectTTS();

      // Forward audio from client to Sarvam
      clientWs.on("message", (data) => {
        const dataSize = Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : Array.isArray(data)
              ? data.reduce((acc, buf) => acc + buf.length, 0)
              : 0;
        console.log(
          `[WS] Received audio chunk from client, size: ${dataSize}, Sarvam state: ${sarvamSTT.readyState}`,
        );
        if (sarvamSTT.readyState === WebSocket.OPEN) {
          sarvamSTT.send(data);
        } else {
          console.warn("[WS] Sarvam STT not open, cannot forward audio");
        }
      });

      // Handle transcripts and trigger AI responses
      sarvamSTT.on("message", async (data) => {
        // Forward to client first
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
        }

        // Check if it's a JSON transcript
        try {
          const parsed = JSON.parse(data.toString());
          console.log("[WS] STT transcript:", parsed);

          // Check for final transcript
          if (parsed.is_final && parsed.transcript && sessionId) {
            const transcript = parsed.transcript.trim();

            // Prevent duplicate processing
            if (transcript === lastProcessedTranscript || !transcript) {
              return;
            }
            lastProcessedTranscript = transcript;

            console.log("[WS] Final transcript detected:", transcript);

            try {
              // Get session and user
              const session = await storage.getSession(sessionId);
              if (!session) {
                console.error("[WS] Session not found:", sessionId);
                return;
              }

              // Store user message
              await storage.createMessage({
                sessionId: session.id,
                userId: session.userId,
                role: "user",
                text: transcript,
              });

              // Get conversation history
              const messages = await storage.getSessionMessages(session.id);
              const conversationHistory = messages.map((msg) => ({
                role: msg.role === "ai" ? "assistant" : "user",
                content: msg.text,
              }));

              // Call Sarvam Chat API
              console.log("[WS] Calling Sarvam Chat API...");
              const response = await chatCompletion(
                [
                  { role: "system", content: RIYA_SYSTEM_PROMPT },
                  ...conversationHistory,
                ],
                0.3,
              );

              const aiResponse =
                response.choices[0]?.message?.content ||
                "I'm sorry, I couldn't process that. Can you please try again?";

              console.log("[WS] AI response:", aiResponse);

              // Store AI message
              await storage.createMessage({
                sessionId: session.id,
                userId: session.userId,
                role: "ai",
                text: aiResponse,
              });

              // Send to TTS
              if (
                !ttsConnection ||
                ttsConnection.readyState !== WebSocket.OPEN
              ) {
                console.warn("[WS] TTS not connected, reconnecting...");
                connectTTS();
                // Wait a bit for connection
                await new Promise((resolve) => setTimeout(resolve, 500));
              }

              if (
                ttsConnection &&
                ttsConnection.readyState === WebSocket.OPEN
              ) {
                // Send audio request
                if (voiceProvider === "elevenlabs") {
                  ttsConnection.send(JSON.stringify({
                    text: aiResponse,
                    voice_settings: {
                      stability: 0.5,
                      similarity_boost: 0.8
                    }
                  }));
                  // ElevenLabs doesn't need flush
                } else {
                  // Sarvam
                  ttsConnection.send(
                    JSON.stringify({
                      action: "speak",
                      text: aiResponse,
                    }),
                  );

                  // Send flush to trigger audio generation
                  ttsConnection.send(
                    JSON.stringify({
                      action: "flush",
                    }),
                  );
                }

                console.log("[WS] Sent AI response to TTS");
              } else {
                console.error("[WS] TTS connection not available");
              }
            } catch (error) {
              console.error("[WS] Error processing transcript:", error);
              // Optionally send error response to TTS
              if (
                ttsConnection &&
                ttsConnection.readyState === WebSocket.OPEN
              ) {
                ttsConnection.send(
                  JSON.stringify({
                    action: "speak",
                    text: "I'm sorry, I encountered an error. Please try again.",
                  }),
                );
                ttsConnection.send(JSON.stringify({ action: "flush" }));
              }
            }
          }
        } catch (e) {
          // Not JSON, just audio acknowledgment - ignore
        }
      });

      // Handle disconnections
      clientWs.on("close", () => {
        console.log("[WS] Client STT closed");
        sarvamSTT.close();
        if (ttsConnection) {
          ttsConnection.close();
        }
      });

      sarvamSTT.on("close", () => {
        console.log("[WS] Sarvam STT closed");
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });

      sarvamSTT.on("error", (error) => {
        console.error("[WS] Sarvam STT error:", error);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ error: "STT connection error" }));
        }
      });
    } else if (type === "tts") {
      // Text-to-Speech proxy
      const sarvamTTS = createTTSWebSocket("hi-IN", "meera");

      // Forward text from client to Sarvam
      clientWs.on("message", (data) => {
        if (sarvamTTS.readyState === WebSocket.OPEN) {
          sarvamTTS.send(data);
        }
      });

      // Forward audio from Sarvam to client
      sarvamTTS.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
        }
      });

      // Handle disconnections
      clientWs.on("close", () => {
        console.log("[WS] Client TTS closed");
        sarvamTTS.close();
      });

      sarvamTTS.on("close", () => {
        console.log("[WS] Sarvam TTS closed");
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });

      sarvamTTS.on("error", (error) => {
        console.error("[WS] Sarvam TTS error:", error);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ error: "TTS connection error" }));
        }
      });
    }
  });

  // Debug Sentry
  app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("My first Sentry error!");
  });

  return httpServer;
}
