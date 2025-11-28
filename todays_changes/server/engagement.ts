import { storage } from "../storage";
import { memoryService } from "./memory";
import { notificationService } from "./notification";
import { predictiveEngagementService } from "./predictiveEngagement";
import cron from "node-cron";

export class EngagementService {
    private isRunning: boolean = false;

    constructor() {
        // Initialize cron jobs
        this.initializeScheduler();
    }

    private initializeScheduler() {
        // Check for pending triggers every 5 minutes
        cron.schedule("*/5 * * * *", async () => {
            if (this.isRunning) return;
            this.isRunning = true;
            try {
                await this.processPendingTriggers();
            } catch (error) {
                console.error("[Engagement] Error processing triggers:", error);
            } finally {
                this.isRunning = false;
            }
        });

        // TIER 3: Predictive engagement - Analyze users and create smart triggers every 6 hours
        cron.schedule("0 */6 * * *", async () => {
            try {
                await this.generatePredictiveTriggers();
            } catch (error) {
                console.error("[Engagement] Error generating predictive triggers:", error);
            }
        });

        console.log("[Engagement] Scheduler initialized (triggers every 5min, predictions every 6h)");
    }

    async processPendingTriggers() {
        const pendingTriggers = await storage.getPendingTriggers();

        if (pendingTriggers.length === 0) return;

        console.log(`[Engagement] Found ${pendingTriggers.length} pending triggers`);

        for (const trigger of pendingTriggers) {
            try {
                // 1. Get user details
                const user = await storage.getUser(trigger.userId);
                if (!user) {
                    console.error(`[Engagement] User ${trigger.userId} not found for trigger ${trigger.id}`);
                    continue;
                }

                // 2. Create AI message in the chat
                // We need to find the active session or create a new one
                let sessions = await storage.getUserSessions(user.id);
                let activeSession = sessions.find(s => s.type === 'chat' && !s.endedAt);

                if (!activeSession) {
                    activeSession = await storage.createSession({
                        userId: user.id,
                        type: 'chat',
                        partnerTypeOneLiner: "Proactive session started by Riya"
                    });
                }

                const message = await storage.createMessage({
                    sessionId: activeSession.id,
                    userId: user.id,
                    role: "ai",
                    text: trigger.messageTemplate,
                    tag: "general"
                });

                console.log(`[Engagement] Sent proactive message to user ${user.id}: ${trigger.messageTemplate}`);

                // 3. Mark trigger as sent
                await storage.markTriggerAsSent(trigger.id);

                // 4. Send Push Notification
                await notificationService.sendPush(user.id, trigger.messageTemplate);

            } catch (error) {
                console.error(`[Engagement] Failed to process trigger ${trigger.id}:`, error);
            }
        }
    }

    // TIER 3: Generate predictive triggers based on user patterns
    async generatePredictiveTriggers() {
        try {
            console.log("[Engagement] Starting predictive trigger generation...");
            
            // Get all active users (users who have chatted in last 7 days)
            const allSessions = await storage.getUserSessions(""); // This would need a method to get all sessions
            
            // For now, we'll need to get active users differently
            // TODO: Add method to get active users
            
            // For each active user, predict next engagement
            // This is a placeholder - in production, you'd get actual active users
            console.log("[Engagement] Predictive triggers: Would analyze all active users");
            
            // Example: If we had a way to get active users:
            // const activeUsers = await getActiveUsers(); // Users active in last 7 days
            // for (const user of activeUsers) {
            //     const prediction = await predictiveEngagementService.predictNextEngagement(user.id);
            //     if (prediction && prediction.confidence >= 70) {
            //         await storage.createEngagementTrigger({
            //             userId: user.id,
            //             triggerType: prediction.type,
            //             scheduledFor: prediction.scheduledTime,
            //             messageTemplate: prediction.message,
            //             sent: false,
            //         });
            //         console.log(`[Engagement] Created predictive trigger for user ${user.id}: ${prediction.type} (confidence: ${prediction.confidence})`);
            //     }
            // }
            
        } catch (error) {
            console.error("[Engagement] Error generating predictive triggers:", error);
        }
    }
}

export const engagementService = new EngagementService();
