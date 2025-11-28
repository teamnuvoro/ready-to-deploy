import {
  type User, type InsertUser,
  type Session, type InsertSession,
  type Message, type InsertMessage,
  type Call, type InsertCall,
  type Subscription, type InsertSubscription,
  type Payment, type InsertPayment,
  type OtpLogin, type InsertOtpLogin,
  type UserSummaryLatest, type InsertUserSummaryLatest,
  type UserMemory, type InsertUserMemory,
  type EngagementTrigger, type InsertEngagementTrigger,
  type UserEmotionalState, type InsertUserEmotionalState,
  type NotificationToken, type InsertNotificationToken,
  type AvatarConfiguration, type InsertAvatarConfiguration, type AvatarStyle, type PersonalityVisual,
  type AvatarInteraction, type InsertAvatarInteraction,
  type VisualContent, type InsertVisualContent, type VisualContentType,
  type UnlockedContent, type InsertUnlockedContent,
  type ConversationTag, type InsertConversationTag,
  type MemoryTimeline, type InsertMemoryTimeline,
  type RelationshipDepth, type InsertRelationshipDepth,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(userId: string, updates: Partial<InsertUser>): Promise<void>;

  // User summary operations
  getUserSummary(userId: string): Promise<UserSummaryLatest | undefined>;
  upsertUserSummary(summary: InsertUserSummaryLatest): Promise<UserSummaryLatest>;

  // Session operations
  getSession(id: string): Promise<Session | undefined>;
  getUserSessions(userId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(sessionId: string, updates: Partial<InsertSession>): Promise<void>;
  endSession(sessionId: string, summary: Partial<Session>): Promise<void>;

  // Message operations
  getSessionMessages(sessionId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getUserMessageCount(userId: string): Promise<number>;

  // Call operations
  getSessionCall(sessionId: string): Promise<Call | undefined>;
  createCall(call: InsertCall): Promise<Call>;
  createCall(call: InsertCall): Promise<Call>;
  updateCallTranscript(callId: string, transcript: string): Promise<void>;
  getUserCallDuration(userId: string): Promise<number>;

  // Subscription operations
  getActiveSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  deactivateUserSubscriptions(userId: string): Promise<void>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentByOrderId(cashfreeOrderId: string): Promise<Payment | undefined>;
  updatePaymentStatus(id: string, status: 'success' | 'failed', cashfreePaymentId?: string): Promise<void>;

  // OTP Login operations
  createOtpLogin(otpLogin: InsertOtpLogin): Promise<OtpLogin>;
  getValidOtpLogin(email: string, otp: string): Promise<OtpLogin | undefined>;
  markOtpAsVerified(id: string): Promise<void>;
  cleanupExpiredOtps(): Promise<void>;

  // Core Memory operations
  createUserMemory(memory: InsertUserMemory): Promise<UserMemory>;
  getUserMemories(userId: string): Promise<UserMemory[]>;

  // Engagement Trigger operations
  createEngagementTrigger(trigger: InsertEngagementTrigger): Promise<EngagementTrigger>;
  getPendingTriggers(): Promise<EngagementTrigger[]>;
  markTriggerAsSent(triggerId: string): Promise<void>;

  // Emotional State operations
  createUserEmotionalState(state: InsertUserEmotionalState): Promise<UserEmotionalState>;
  getRecentEmotionalState(userId: string): Promise<UserEmotionalState | undefined>;

  // Notification operations
  saveNotificationToken(token: InsertNotificationToken): Promise<void>;
  getNotificationToken(userId: string): Promise<NotificationToken | undefined>;

  // Avatar operations
  getAvatarConfig(userId: string): Promise<AvatarConfiguration | undefined>;
  upsertAvatarConfig(config: InsertAvatarConfiguration): Promise<AvatarConfiguration>;
  logAvatarInteraction(interaction: InsertAvatarInteraction): Promise<void>;

  // Visual Content operations
  createVisualContent(content: InsertVisualContent): Promise<VisualContent>;
  getVisualContent(userId: string): Promise<VisualContent[]>;
  getUnlockableVisuals(): Promise<VisualContent[]>;
  unlockContent(unlock: InsertUnlockedContent): Promise<UnlockedContent>;
  getUnlockedContent(userId: string): Promise<UnlockedContent[]>;
  getUnlockedContent(userId: string): Promise<UnlockedContent[]>;

  // Conversation Tags
  createConversationTag(tag: InsertConversationTag): Promise<ConversationTag>;
  getConversationTags(sessionId: string): Promise<ConversationTag | undefined>;
  getConversationsByTag(userId: string, tag: string): Promise<ConversationTag[]>;

  // Memory Timeline
  createMemoryTimeline(timeline: InsertMemoryTimeline): Promise<MemoryTimeline>;
  getMemoryTimeline(userId: string, metricName: string, days: number): Promise<MemoryTimeline[]>;

  // Relationship Depth
  getRelationshipDepth(userId: string): Promise<RelationshipDepth | undefined>;
  upsertRelationshipDepth(depth: InsertRelationshipDepth): Promise<RelationshipDepth>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userSummaries: Map<string, UserSummaryLatest>;
  private sessions: Map<string, Session>;
  private messages: Message[];
  private calls: Map<string, Call>;
  private subscriptions: Map<string, Subscription>;
  private payments: Map<string, Payment>;
  private otpLogins: Map<string, OtpLogin>;
  private userMemories: Map<string, UserMemory>;
  private engagementTriggers: Map<string, EngagementTrigger>;
  private userEmotionalStates: Map<string, UserEmotionalState>;
  private notificationTokens: Map<string, NotificationToken>;
  private avatarConfigs: Map<string, AvatarConfiguration>;
  private avatarInteractions: Map<string, AvatarInteraction>;
  private visualContent: Map<string, VisualContent>;
  private unlockedContent: Map<string, UnlockedContent>;
  private conversationTags: Map<string, ConversationTag>;
  private memoryTimeline: Map<string, MemoryTimeline>;
  private relationshipDepth: Map<string, RelationshipDepth>;

  constructor() {
    this.users = new Map();
    this.userSummaries = new Map();
    this.sessions = new Map();
    this.messages = [];
    this.calls = new Map();
    this.subscriptions = new Map();
    this.payments = new Map();
    this.otpLogins = new Map();
    this.userMemories = new Map();
    this.engagementTriggers = new Map();
    this.userEmotionalStates = new Map();
    this.notificationTokens = new Map();
    this.avatarConfigs = new Map();
    this.avatarInteractions = new Map();
    this.visualContent = new Map();
    this.unlockedContent = new Map();
    this.conversationTags = new Map();
    this.memoryTimeline = new Map();
    this.relationshipDepth = new Map();
  }

  // Notification operations
  async saveNotificationToken(insertToken: InsertNotificationToken): Promise<void> {
    const id = randomUUID();
    const token: NotificationToken = {
      id,
      userId: insertToken.userId,
      token: insertToken.token,
      deviceType: insertToken.deviceType,
      createdAt: new Date(),
    };
    this.notificationTokens.set(id, token);
  }

  async getNotificationToken(userId: string): Promise<NotificationToken | undefined> {
    return Array.from(this.notificationTokens.values()).find(
      (token) => token.userId === userId
    );
  }

  // Avatar operations
  async getAvatarConfig(userId: string): Promise<AvatarConfiguration | undefined> {
    return Array.from(this.avatarConfigs.values()).find(
      (config) => config.userId === userId
    );
  }

  async upsertAvatarConfig(config: InsertAvatarConfiguration): Promise<AvatarConfiguration> {
    const existing = await this.getAvatarConfig(config.userId);
    const id = existing?.id || randomUUID();
    const now = new Date();

    const newConfig: AvatarConfiguration = {
      id,
      userId: config.userId,
      avatarStyle: (config.avatarStyle as any) || existing?.avatarStyle || "anime",
      skinTone: config.skinTone || existing?.skinTone || null,
      hairColor: config.hairColor || existing?.hairColor || null,
      hairStyle: config.hairStyle || existing?.hairStyle || null,
      eyeColor: config.eyeColor || existing?.eyeColor || null,
      outfit: config.outfit || existing?.outfit || null,
      personalityVisual: (config.personalityVisual as any) || existing?.personalityVisual || "girl_next_door",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.avatarConfigs.set(id, newConfig);
    return newConfig;
  }

  async logAvatarInteraction(interaction: InsertAvatarInteraction): Promise<void> {
    const id = randomUUID();
    const newInteraction: AvatarInteraction = {
      id,
      userId: interaction.userId,
      interactionType: interaction.interactionType,
      sessionId: interaction.sessionId || null,
      createdAt: new Date(),
    };
    this.avatarInteractions.set(id, newInteraction);
  }

  // Visual Content operations
  async createVisualContent(insertContent: InsertVisualContent): Promise<VisualContent> {
    const id = randomUUID();
    const content: VisualContent = {
      id,
      userId: insertContent.userId || null,
      contentType: insertContent.contentType as VisualContentType,
      url: insertContent.url,
      thumbnailUrl: insertContent.thumbnailUrl || null,
      caption: insertContent.caption || null,
      context: insertContent.context || null,
      emotionTag: insertContent.emotionTag || null,
      isUnlockable: insertContent.isUnlockable || false,
      unlockCondition: insertContent.unlockCondition || null,
      viewCount: 0,
      createdAt: new Date(),
    };
    this.visualContent.set(id, content);
    return content;
  }

  async getVisualContent(userId: string): Promise<VisualContent[]> {
    return Array.from(this.visualContent.values()).filter(
      (content) => content.userId === userId || content.userId === null
    );
  }

  async getUnlockableVisuals(): Promise<VisualContent[]> {
    return Array.from(this.visualContent.values()).filter(
      (content) => content.isUnlockable === true
    );
  }

  async unlockContent(insertUnlock: InsertUnlockedContent): Promise<UnlockedContent> {
    const id = randomUUID();
    const unlock: UnlockedContent = {
      id,
      userId: insertUnlock.userId,
      contentId: insertUnlock.contentId,
      unlockedAt: new Date(),
      unlockMethod: insertUnlock.unlockMethod || null,
    };
    this.unlockedContent.set(id, unlock);
    return unlock;
  }

  async getUnlockedContent(userId: string): Promise<UnlockedContent[]> {
    return Array.from(this.unlockedContent.values()).filter(
      (unlock) => unlock.userId === userId
    );
  }

  // Core Memory operations
  async createUserMemory(insertMemory: InsertUserMemory): Promise<UserMemory> {
    const id = randomUUID();
    const memory: UserMemory = {
      id,
      ...insertMemory,
      context: insertMemory.context ?? null,
      importanceScore: insertMemory.importanceScore ?? 5,
      scheduledFollowupAt: insertMemory.scheduledFollowupAt ?? null,
      lastMentionedAt: insertMemory.lastMentionedAt ?? null,
      createdAt: new Date(),
    };
    this.userMemories.set(id, memory);
    return memory;
  }

  async getUserMemories(userId: string): Promise<UserMemory[]> {
    return Array.from(this.userMemories.values()).filter(
      (memory) => memory.userId === userId
    );
  }

  // Engagement Trigger operations
  async createEngagementTrigger(insertTrigger: InsertEngagementTrigger): Promise<EngagementTrigger> {
    const id = randomUUID();
    const trigger: EngagementTrigger = {
      id,
      ...insertTrigger,
      memoryId: insertTrigger.memoryId ?? null,
      sent: insertTrigger.sent ?? false,
      sentAt: insertTrigger.sentAt ?? null,
      createdAt: new Date(),
    };
    this.engagementTriggers.set(id, trigger);
    return trigger;
  }

  async getPendingTriggers(): Promise<EngagementTrigger[]> {
    const now = new Date();
    return Array.from(this.engagementTriggers.values()).filter(
      (trigger) => !trigger.sent && trigger.scheduledFor <= now
    );
  }

  async markTriggerAsSent(triggerId: string): Promise<void> {
    const trigger = this.engagementTriggers.get(triggerId);
    if (trigger) {
      this.engagementTriggers.set(triggerId, {
        ...trigger,
        sent: true,
        sentAt: new Date()
      });
    }
  }

  // Emotional State operations
  async createUserEmotionalState(insertState: InsertUserEmotionalState): Promise<UserEmotionalState> {
    const id = randomUUID();
    const state: UserEmotionalState = {
      id,
      ...insertState,
      energyLevel: insertState.energyLevel ?? null,
      stressLevel: insertState.stressLevel ?? null,
      detectedFrom: insertState.detectedFrom ?? null,
      sessionId: insertState.sessionId ?? null,
      createdAt: new Date(),
    };
    this.userEmotionalStates.set(id, state);
    return state;
  }

  async getRecentEmotionalState(userId: string): Promise<UserEmotionalState | undefined> {
    return Array.from(this.userEmotionalStates.values())
      .filter((state) => state.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.phoneNumber === phoneNumber,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = {
      id,
      name: insertUser.name ?? null,
      phoneNumber: insertUser.phoneNumber ?? null,
      email: insertUser.email ?? null,
      gender: insertUser.gender ?? null,
      premiumUser: insertUser.premiumUser ?? false,
      proactivityLevel: insertUser.proactivityLevel ?? "medium",
      checkInEnabled: insertUser.checkInEnabled ?? true,
      voiceProvider: insertUser.voiceProvider ?? "elevenlabs",
      voiceId: insertUser.voiceId ?? "21m00Tcm4TlvDq8ikWAM",
      elevenLabsApiKey: insertUser.elevenLabsApiKey ?? null,
      age: insertUser.age ?? null,
      city: insertUser.city ?? null,
      occupation: insertUser.occupation ?? null,
      relationshipStatus: insertUser.relationshipStatus ?? null,
      personalityModel: insertUser.personalityModel ?? "riya_classic",
      locale: insertUser.locale ?? "hi-IN",
      registrationDate: now,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(userId: string, updates: Partial<InsertUser>): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updatedUser = { ...user, ...updates, updatedAt: new Date() };
      this.users.set(userId, updatedUser);
    }
  }

  async getUserSummary(userId: string): Promise<UserSummaryLatest | undefined> {
    return this.userSummaries.get(userId);
  }

  async upsertUserSummary(summary: InsertUserSummaryLatest): Promise<UserSummaryLatest> {
    const userSummary: UserSummaryLatest = {
      userId: summary.userId,
      partnerTypeOneLiner: summary.partnerTypeOneLiner ?? null,
      top3TraitsYouValue: summary.top3TraitsYouValue ?? null,
      whatYouMightWorkOn: summary.whatYouMightWorkOn ?? null,
      nextTimeFocus: summary.nextTimeFocus ?? null,
      loveLanguageGuess: summary.loveLanguageGuess ?? null,
      communicationFit: summary.communicationFit ?? null,
      confidenceScore: summary.confidenceScore ?? null,
      updatedAt: new Date(),
    };
    this.userSummaries.set(summary.userId, userSummary);
    return userSummary;
  }

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId,
    );
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const now = new Date();
    const session: Session = {
      id,
      userId: insertSession.userId,
      type: insertSession.type ?? "chat",
      startedAt: now,
      endedAt: insertSession.endedAt ?? null,
      partnerTypeOneLiner: insertSession.partnerTypeOneLiner ?? null,
      top3TraitsYouValue: insertSession.top3TraitsYouValue ?? null,
      whatYouMightWorkOn: insertSession.whatYouMightWorkOn ?? null,
      nextTimeFocus: insertSession.nextTimeFocus ?? null,
      loveLanguageGuess: insertSession.loveLanguageGuess ?? null,
      communicationFit: insertSession.communicationFit ?? null,
      confidenceScore: insertSession.confidenceScore ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSession(sessionId: string, updates: Partial<InsertSession>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const updatedSession = { ...session, ...updates, updatedAt: new Date() };
      this.sessions.set(sessionId, updatedSession);
    }
  }

  async endSession(sessionId: string, summary: Partial<Session>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const updatedSession = {
        ...session,
        ...summary,
        endedAt: new Date(),
        updatedAt: new Date()
      };
      this.sessions.set(sessionId, updatedSession);
    }
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return this.messages.filter((msg) => msg.sessionId === sessionId);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      tag: insertMessage.tag ?? "general",
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  async getUserMessageCount(userId: string): Promise<number> {
    return this.messages.filter(m => m.userId === userId && m.role === 'user').length;
  }

  async getSessionCall(sessionId: string): Promise<Call | undefined> {
    return Array.from(this.calls.values()).find(
      (call) => call.sessionId === sessionId,
    );
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const id = randomUUID();
    const durationSeconds = Math.floor(
      (insertCall.endedAt.getTime() - insertCall.startedAt.getTime()) / 1000
    );
    const call: Call = {
      id,
      sessionId: insertCall.sessionId,
      userId: insertCall.userId,
      transcript: insertCall.transcript ?? null,
      startedAt: insertCall.startedAt,
      endedAt: insertCall.endedAt,
      durationSeconds,
    };
    this.calls.set(id, call);
    return call;
  }

  async updateCallTranscript(callId: string, transcript: string): Promise<void> {
    const call = this.calls.get(callId);
    if (call) {
      call.transcript = transcript;
      this.calls.set(callId, call);
    }
  }

  async getUserCallDuration(userId: string): Promise<number> {
    return Array.from(this.calls.values())
      .filter(c => c.userId === userId)
      .reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
  }

  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    const now = new Date();
    return Array.from(this.subscriptions.values()).find(
      (sub) => sub.userId === userId && sub.active && sub.endDate > now
    );
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const id = randomUUID();
    const subscription: Subscription = {
      id,
      ...insertSubscription,
      active: insertSubscription.active ?? true,
      createdAt: new Date(),
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async deactivateUserSubscriptions(userId: string): Promise<void> {
    Array.from(this.subscriptions.entries()).forEach(([id, sub]) => {
      if (sub.userId === userId && sub.active) {
        this.subscriptions.set(id, { ...sub, active: false });
      }
    });
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const now = new Date();
    const payment: Payment = {
      id,
      ...insertPayment,
      subscriptionId: insertPayment.subscriptionId ?? null,
      cashfreePaymentId: insertPayment.cashfreePaymentId ?? null,
      status: insertPayment.status ?? 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentByOrderId(cashfreeOrderId: string): Promise<Payment | undefined> {
    return Array.from(this.payments.values()).find(
      (payment) => payment.cashfreeOrderId === cashfreeOrderId
    );
  }

  async updatePaymentStatus(id: string, status: 'success' | 'failed', cashfreePaymentId?: string): Promise<void> {
    const payment = this.payments.get(id);
    if (payment) {
      const updatedPayment = {
        ...payment,
        status,
        cashfreePaymentId: cashfreePaymentId || payment.cashfreePaymentId,
        updatedAt: new Date(),
      };
      this.payments.set(id, updatedPayment);
    }
  }

  async createOtpLogin(insertOtpLogin: InsertOtpLogin): Promise<OtpLogin> {
    const id = randomUUID();
    const otpLogin: OtpLogin = {
      id,
      ...insertOtpLogin,
      verified: insertOtpLogin.verified ?? false,
      createdAt: new Date(),
    };
    this.otpLogins.set(id, otpLogin);
    return otpLogin;
  }

  async getValidOtpLogin(email: string, otp: string): Promise<OtpLogin | undefined> {
    const now = new Date();
    return Array.from(this.otpLogins.values()).find(
      (otpLogin) =>
        otpLogin.email === email &&
        otpLogin.otp === otp &&
        !otpLogin.verified &&
        otpLogin.expiresAt > now
    );
  }

  async markOtpAsVerified(id: string): Promise<void> {
    const otpLogin = this.otpLogins.get(id);
    if (otpLogin) {
      this.otpLogins.set(id, { ...otpLogin, verified: true });
    }
  }

  async cleanupExpiredOtps(): Promise<void> {
    const now = new Date();
    Array.from(this.otpLogins.entries()).forEach(([id, otpLogin]) => {
      if (otpLogin.expiresAt < now) {
        this.otpLogins.delete(id);
      }
    });
  }

  // Conversation Tags
  async createConversationTag(insertTag: InsertConversationTag): Promise<ConversationTag> {
    const id = randomUUID();
    const tag: ConversationTag = {
      id,
      ...insertTag,
      tags: insertTag.tags ?? [],
      primaryEmotion: insertTag.primaryEmotion ?? null,
      intensity: insertTag.intensity ?? null,
      createdAt: new Date(),
    };
    this.conversationTags.set(id, tag);
    return tag;
  }

  async getConversationTags(sessionId: string): Promise<ConversationTag | undefined> {
    return Array.from(this.conversationTags.values()).find(
      (tag) => tag.sessionId === sessionId
    );
  }

  async getConversationsByTag(userId: string, tag: string): Promise<ConversationTag[]> {
    return Array.from(this.conversationTags.values()).filter(
      (ct) => ct.userId === userId && ct.tags?.includes(tag)
    );
  }

  // Memory Timeline
  async createMemoryTimeline(insertTimeline: InsertMemoryTimeline): Promise<MemoryTimeline> {
    const id = randomUUID();
    const timeline: MemoryTimeline = {
      id,
      ...insertTimeline,
      memoryId: insertTimeline.memoryId ?? null,
      context: insertTimeline.context ?? null,
      timestamp: new Date(),
    };
    this.memoryTimeline.set(id, timeline);
    return timeline;
  }

  async getMemoryTimeline(userId: string, metricName: string, days: number): Promise<MemoryTimeline[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return Array.from(this.memoryTimeline.values()).filter(
      (mt) => mt.userId === userId && mt.metricName === metricName && mt.timestamp >= cutoff
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Relationship Depth
  async getRelationshipDepth(userId: string): Promise<RelationshipDepth | undefined> {
    return Array.from(this.relationshipDepth.values()).find(
      (rd) => rd.userId === userId
    );
  }

  async upsertRelationshipDepth(insertDepth: InsertRelationshipDepth): Promise<RelationshipDepth> {
    const existing = await this.getRelationshipDepth(insertDepth.userId);
    const id = existing?.id || randomUUID();
    const now = new Date();

    const depth: RelationshipDepth = {
      id,
      userId: insertDepth.userId,
      stage: insertDepth.stage ?? "acquainted",
      intimacyScore: insertDepth.intimacyScore ?? 0,
      trustScore: insertDepth.trustScore ?? 0,
      vulnerabilityLevel: insertDepth.vulnerabilityLevel ?? 0,
      insideJokesCount: insertDepth.insideJokesCount ?? 0,
      anniversaryMilestones: insertDepth.anniversaryMilestones ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.relationshipDepth.set(id, depth);
    return depth;
  }
}

import { db, hasDatabaseUrl, forceInMemoryStorage } from "./db";
import { users, userSummaryLatest, sessions, messages, calls, subscriptions, payments, otpLogins, userMemories, engagementTriggers, userEmotionalStates, notificationTokens, avatarConfigurations, avatarInteractions, visualContent, unlockedContent, conversationTags, memoryTimeline, relationshipDepth } from "@shared/schema";
import { eq, desc, and, gt, lt, or, isNull, sql } from "drizzle-orm";

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(userId: string, updates: Partial<InsertUser>): Promise<void> {
    await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserSummary(userId: string): Promise<UserSummaryLatest | undefined> {
    const result = await db.select().from(userSummaryLatest).where(eq(userSummaryLatest.userId, userId));
    return result[0];
  }

  async upsertUserSummary(summary: InsertUserSummaryLatest): Promise<UserSummaryLatest> {
    const result = await db.insert(userSummaryLatest)
      .values({ ...summary, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSummaryLatest.userId,
        set: { ...summary, updatedAt: new Date() }
      })
      .returning();
    return result[0];
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await db.select().from(sessions).where(eq(sessions.id, id));
    return result[0];
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return await db.select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.startedAt));
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const result = await db.insert(sessions).values(insertSession).returning();
    return result[0];
  }

  async updateSession(sessionId: string, updates: Partial<InsertSession>): Promise<void> {
    await db.update(sessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async endSession(sessionId: string, summary: Partial<Session>): Promise<void> {
    await db.update(sessions)
      .set({ ...summary, endedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return await db.select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  async getUserMessageCount(userId: string): Promise<number> {
    try {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.role, 'user')));
      return Number(result[0]?.count) || 0;
    } catch (error) {
      console.error("[Storage] Error counting messages with SQL, falling back to array:", error);
      const result = await db.select().from(messages).where(and(eq(messages.userId, userId), eq(messages.role, 'user')));
      return result.length;
    }
  }

  async getSessionCall(sessionId: string): Promise<Call | undefined> {
    const result = await db.select().from(calls).where(eq(calls.sessionId, sessionId));
    return result[0];
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const result = await db.insert(calls).values(insertCall).returning();
    return result[0];
  }

  async updateCallTranscript(callId: string, transcript: string): Promise<void> {
    await db.update(calls)
      .set({ transcript })
      .where(eq(calls.id, callId));
  }

  async getUserCallDuration(userId: string): Promise<number> {
    try {
      const result = await db.select({ totalDuration: sql<number>`sum(${calls.durationSeconds})` })
        .from(calls)
        .where(eq(calls.userId, userId));
      return Number(result[0]?.totalDuration) || 0;
    } catch (error) {
      console.error("[Storage] Error calculating duration with SQL, falling back to array:", error);
      const result = await db.select().from(calls).where(eq(calls.userId, userId));
      return result.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
    }
  }



  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    const now = new Date();
    const result = await db.select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.active, true),
          gt(subscriptions.endDate, now)
        )
      )
      .limit(1);
    return result[0];
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(insertSubscription).returning();
    return result[0];
  }

  async deactivateUserSubscriptions(userId: string): Promise<void> {
    await db.update(subscriptions)
      .set({ active: false })
      .where(eq(subscriptions.userId, userId));
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const result = await db.insert(payments).values(insertPayment).returning();
    return result[0];
  }

  async getPaymentByOrderId(cashfreeOrderId: string): Promise<Payment | undefined> {
    const result = await db.select()
      .from(payments)
      .where(eq(payments.cashfreeOrderId, cashfreeOrderId));
    return result[0];
  }

  async updatePaymentStatus(id: string, status: 'success' | 'failed', cashfreePaymentId?: string): Promise<void> {
    const updates: any = { status, updatedAt: new Date() };
    if (cashfreePaymentId) {
      updates.cashfreePaymentId = cashfreePaymentId;
    }
    await db.update(payments)
      .set(updates)
      .where(eq(payments.id, id));
  }

  async createOtpLogin(insertOtpLogin: InsertOtpLogin): Promise<OtpLogin> {
    const result = await db.insert(otpLogins).values(insertOtpLogin).returning();
    return result[0];
  }

  async getValidOtpLogin(email: string, otp: string): Promise<OtpLogin | undefined> {
    const now = new Date();
    const result = await db.select()
      .from(otpLogins)
      .where(
        and(
          eq(otpLogins.email, email),
          eq(otpLogins.otp, otp),
          eq(otpLogins.verified, false),
          gt(otpLogins.expiresAt, now)
        )
      )
      .limit(1);
    return result[0];
  }

  async markOtpAsVerified(id: string): Promise<void> {
    await db.update(otpLogins)
      .set({ verified: true })
      .where(eq(otpLogins.id, id));
  }

  async cleanupExpiredOtps(): Promise<void> {
    const now = new Date();
    await db.delete(otpLogins)
      .where(lt(otpLogins.expiresAt, now));
  }

  // Core Memory operations
  async createUserMemory(insertMemory: InsertUserMemory): Promise<UserMemory> {
    const result = await db.insert(userMemories).values(insertMemory).returning();
    return result[0];
  }

  async getUserMemories(userId: string): Promise<UserMemory[]> {
    return await db.select()
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.createdAt));
  }

  // Engagement Trigger operations
  async createEngagementTrigger(insertTrigger: InsertEngagementTrigger): Promise<EngagementTrigger> {
    const result = await db.insert(engagementTriggers).values(insertTrigger).returning();
    return result[0];
  }

  async getPendingTriggers(): Promise<EngagementTrigger[]> {
    const now = new Date();
    return await db.select()
      .from(engagementTriggers)
      .where(
        and(
          eq(engagementTriggers.sent, false),
          lt(engagementTriggers.scheduledFor, now)
        )
      );
  }

  async markTriggerAsSent(triggerId: string): Promise<void> {
    await db.update(engagementTriggers)
      .set({ sent: true, sentAt: new Date() })
      .where(eq(engagementTriggers.id, triggerId));
  }

  // Emotional State operations
  async createUserEmotionalState(insertState: InsertUserEmotionalState): Promise<UserEmotionalState> {
    const result = await db.insert(userEmotionalStates).values(insertState).returning();
    return result[0];
  }

  async getRecentEmotionalState(userId: string): Promise<UserEmotionalState | undefined> {
    const result = await db.select()
      .from(userEmotionalStates)
      .where(eq(userEmotionalStates.userId, userId))
      .orderBy(desc(userEmotionalStates.createdAt))
      .limit(1);
    return result[0];
  }

  // Notification operations
  async saveNotificationToken(insertToken: InsertNotificationToken): Promise<void> {
    await db.insert(notificationTokens).values(insertToken);
  }

  async getNotificationToken(userId: string): Promise<NotificationToken | undefined> {
    const result = await db.select()
      .from(notificationTokens)
      .where(eq(notificationTokens.userId, userId));
    return result[0];
  }

  // Avatar operations
  async getAvatarConfig(userId: string): Promise<AvatarConfiguration | undefined> {
    const result = await db.select()
      .from(avatarConfigurations)
      .where(eq(avatarConfigurations.userId, userId));
    return result[0];
  }

  async upsertAvatarConfig(config: InsertAvatarConfiguration): Promise<AvatarConfiguration> {
    const values = {
      ...config,
      avatarStyle: config.avatarStyle as any, // Cast to any to avoid enum mismatch issues with drizzle-zod
      personalityVisual: config.personalityVisual as any,
      updatedAt: new Date(),
    };

    // Check if config exists for this user
    const existing = await db.select().from(avatarConfigurations).where(eq(avatarConfigurations.userId, config.userId));

    if (existing.length > 0) {
      // Update existing
      const result = await db.update(avatarConfigurations)
        .set(values)
        .where(eq(avatarConfigurations.id, existing[0].id))
        .returning();
      return result[0];
    } else {
      // Insert new
      const result = await db.insert(avatarConfigurations)
        .values(values)
        .returning();
      return result[0];
    }
  }

  async logAvatarInteraction(interaction: InsertAvatarInteraction): Promise<void> {
    await db.insert(avatarInteractions).values(interaction);
  }

  // Visual Content operations
  async createVisualContent(insertContent: InsertVisualContent): Promise<VisualContent> {
    const values = {
      ...insertContent,
      contentType: insertContent.contentType as any,
    };
    const result = await db.insert(visualContent).values(values).returning();
    return result[0];
  }

  async getVisualContent(userId: string): Promise<VisualContent[]> {
    return await db.select()
      .from(visualContent)
      .where(or(eq(visualContent.userId, userId), isNull(visualContent.userId)));
  }

  async getUnlockableVisuals(): Promise<VisualContent[]> {
    return await db.select()
      .from(visualContent)
      .where(eq(visualContent.isUnlockable, true));
  }

  async unlockContent(insertUnlock: InsertUnlockedContent): Promise<UnlockedContent> {
    const result = await db.insert(unlockedContent).values(insertUnlock).returning();
    return result[0];
  }

  async getUnlockedContent(userId: string): Promise<UnlockedContent[]> {
    return await db.select()
      .from(unlockedContent)
      .where(eq(unlockedContent.userId, userId));
  }

  // Conversation Tags
  async createConversationTag(insertTag: InsertConversationTag): Promise<ConversationTag> {
    const result = await db.insert(conversationTags).values(insertTag).returning();
    return result[0];
  }

  async getConversationTags(sessionId: string): Promise<ConversationTag | undefined> {
    const result = await db.select()
      .from(conversationTags)
      .where(eq(conversationTags.sessionId, sessionId));
    return result[0];
  }

  async getConversationsByTag(userId: string, tag: string): Promise<ConversationTag[]> {
    // Note: This is a simple array check. For more complex queries, we might need specific operators
    // But for now, we'll fetch all user tags and filter in memory if needed, or use a raw query
    // Drizzle's arrayContains might work if supported by the driver
    // For simplicity/compatibility:
    const result = await db.select()
      .from(conversationTags)
      .where(eq(conversationTags.userId, userId));

    return result.filter(ct => ct.tags && ct.tags.includes(tag));
  }

  // Memory Timeline
  async createMemoryTimeline(insertTimeline: InsertMemoryTimeline): Promise<MemoryTimeline> {
    const result = await db.insert(memoryTimeline).values(insertTimeline).returning();
    return result[0];
  }

  async getMemoryTimeline(userId: string, metricName: string, days: number): Promise<MemoryTimeline[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return await db.select()
      .from(memoryTimeline)
      .where(
        and(
          eq(memoryTimeline.userId, userId),
          eq(memoryTimeline.metricName, metricName),
          gt(memoryTimeline.timestamp, cutoff)
        )
      )
      .orderBy(memoryTimeline.timestamp);
  }

  // Relationship Depth
  async getRelationshipDepth(userId: string): Promise<RelationshipDepth | undefined> {
    const result = await db.select()
      .from(relationshipDepth)
      .where(eq(relationshipDepth.userId, userId));
    return result[0];
  }

  async upsertRelationshipDepth(insertDepth: InsertRelationshipDepth): Promise<RelationshipDepth> {
    const result = await db.insert(relationshipDepth)
      .values({ ...insertDepth, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: relationshipDepth.userId,
        set: { ...insertDepth, updatedAt: new Date() }
      })
      .returning();
    return result[0];
  }
}


const useMemoryStorage = !hasDatabaseUrl || forceInMemoryStorage;

if (useMemoryStorage) {
  console.warn(
    "[storage] Using in-memory storage. Data will reset on every server restart.",
  );
}

export const storage: IStorage = useMemoryStorage
  ? new MemStorage()
  : new DbStorage();
