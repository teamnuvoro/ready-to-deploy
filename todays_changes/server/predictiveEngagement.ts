import { generateGroqSummary } from "../groq";
import Groq from "groq-sdk";
import { storage } from "../storage";
import { addHours, addDays, differenceInDays, startOfDay, isMonday, isWeekend } from "date-fns";

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

interface UserPattern {
    stressPattern: string; // e.g., "Mondays", "weekends", "evening"
    lowMoodDays: string[];
    excitementTopics: string[];
    activeHours: string; // e.g., "evening", "late night"
    inactivityThreshold: number; // Hours of inactivity before "miss you" message
}

interface PredictiveTrigger {
    type: 'support' | 'celebration' | 'check_in' | 'advice' | 'miss_you' | 'good_morning' | 'good_night';
    confidence: number; // 0-100
    reason: string;
    scheduledTime: Date;
    message: string;
}

/**
 * Predictive Engagement Service (TIER 3)
 * 
 * Analyzes user patterns and predicts when they need proactive messages.
 * Creates smart, context-aware triggers instead of fixed schedules.
 */
export class PredictiveEngagementService {
    
    /**
     * Analyze user patterns from their conversation history
     */
    async analyzeUserPatterns(userId: string): Promise<UserPattern> {
        try {
            // Get memories from last 30 days
            const memories = await storage.getUserMemories(userId);
            const recentMemories = memories.filter(m => {
                const daysAgo = differenceInDays(new Date(), new Date(m.createdAt));
                return daysAgo <= 30;
            });

            // Get sessions to analyze activity patterns
            const sessions = await storage.getUserSessions(userId);
            const recentSessions = sessions.filter(s => {
                const daysAgo = differenceInDays(new Date(), new Date(s.createdAt));
                return daysAgo <= 30;
            });

            // Analyze stress patterns
            const stressMemories = recentMemories.filter(m => 
                m.memoryType === 'exam' || 
                m.memoryType === 'interview' || 
                m.memoryType === 'work_deadline' ||
                (m.importanceScore && m.importanceScore >= 7)
            );

            const stressPattern = await this.identifyDayPattern(stressMemories, sessions);
            
            // Analyze low mood patterns
            const lowMoodMemories = recentMemories.filter(m => 
                m.context?.toLowerCase().includes('sad') ||
                m.context?.toLowerCase().includes('stressed') ||
                m.context?.toLowerCase().includes('anxious')
            );

            const lowMoodDays = await this.identifyDayPattern(lowMoodMemories, sessions);
            
            // Find excitement topics (happy memories)
            const excitementTopics = await this.extractCommonTopics(
                recentMemories.filter(m => 
                    m.context?.toLowerCase().includes('happy') ||
                    m.context?.toLowerCase().includes('excited') ||
                    m.context?.toLowerCase().includes('achievement')
                )
            );

            // Analyze active hours from sessions
            const activeHours = this.identifyActiveHours(recentSessions);

            // Calculate inactivity threshold
            const lastSession = sessions.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
            
            const hoursSinceLastActivity = lastSession ? 
                (Date.now() - new Date(lastSession.createdAt).getTime()) / (1000 * 60 * 60) : 999;
            
            const inactivityThreshold = hoursSinceLastActivity > 48 ? 24 : 48;

            return {
                stressPattern,
                lowMoodDays: lowMoodDays.split(',').filter(d => d),
                excitementTopics,
                activeHours,
                inactivityThreshold,
            };
        } catch (error) {
            console.error(`[PredictiveEngagement] Error analyzing patterns for user ${userId}:`, error);
            return {
                stressPattern: 'unknown',
                lowMoodDays: [],
                excitementTopics: [],
                activeHours: 'evening',
                inactivityThreshold: 48,
            };
        }
    }

    /**
     * Predict what user needs right now and create appropriate trigger
     */
    async predictNextEngagement(userId: string): Promise<PredictiveTrigger | null> {
        try {
            // Step 1: Analyze patterns
            const patterns = await this.analyzeUserPatterns(userId);

            // Step 2: Get recent context
            const recentMemories = await storage.getUserMemories(userId);
            const recent7Days = recentMemories.filter(m => {
                const daysAgo = differenceInDays(new Date(), new Date(m.createdAt));
                return daysAgo <= 7;
            });

            const recentEmotion = await storage.getRecentEmotionalState(userId);
            const currentMood = recentEmotion?.mood || 'neutral';

            // Step 3: Check for specific patterns
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const hour = now.getHours();

            // Pattern-based predictions
            let prediction: PredictiveTrigger | null = null;

            // Check inactivity
            const sessions = await storage.getUserSessions(userId);
            const lastSession = sessions.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
            
            if (lastSession) {
                const hoursSinceLastChat = (Date.now() - new Date(lastSession.createdAt).getTime()) / (1000 * 60 * 60);
                
                if (hoursSinceLastChat >= patterns.inactivityThreshold) {
                    prediction = await this.createMissYouTrigger(userId, recentMemories);
                    return prediction;
                }
            }

            // Check day patterns (e.g., Monday stress)
            if (patterns.stressPattern.toLowerCase().includes('monday') && isMonday(now)) {
                prediction = await this.createSupportTrigger(userId, "Monday blues", recent7Days);
                if (prediction) return prediction;
            }

            // Check time of day
            if (hour >= 8 && hour <= 10 && patterns.activeHours.includes('morning')) {
                prediction = await this.createGoodMorningTrigger(userId);
                if (prediction) return prediction;
            }

            if (hour >= 22 && hour <= 23) {
                prediction = await this.createGoodNightTrigger(userId);
                if (prediction) return prediction;
            }

            // Check for upcoming events that need support
            const upcomingEvents = recentMemories.filter(m => {
                if (!m.scheduledFollowupAt) return false;
                const hoursUntil = (new Date(m.scheduledFollowupAt).getTime() - Date.now()) / (1000 * 60 * 60);
                return hoursUntil > 0 && hoursUntil <= 24; // Within 24 hours
            });

            if (upcomingEvents.length > 0) {
                prediction = await this.createSupportTrigger(
                    userId,
                    `Upcoming ${upcomingEvents[0].memoryType}`,
                    recent7Days
                );
                if (prediction) return prediction;
            }

            // Default: Use AI to predict based on patterns
            return await this.aiPredictEngagement(userId, patterns, currentMood, recent7Days);

        } catch (error) {
            console.error(`[PredictiveEngagement] Error predicting engagement for user ${userId}:`, error);
            return null;
        }
    }

    /**
     * Use AI to predict what user needs
     */
    private async aiPredictEngagement(
        userId: string,
        patterns: UserPattern,
        currentMood: string,
        recentMemories: any[]
    ): Promise<PredictiveTrigger | null> {
        try {
            const memoryContext = recentMemories
                .slice(0, 5)
                .map(m => `${m.memoryType}: ${m.content}`)
                .join(', ');

            const prompt = `Based on this user's patterns, what do they likely need RIGHT NOW?

PATTERNS:
- Stress spikes on: ${patterns.stressPattern}
- Usually feels low on: ${patterns.lowMoodDays.join(', ') || 'unknown'}
- Gets excited about: ${patterns.excitementTopics.join(', ') || 'unknown'}
- Active during: ${patterns.activeHours}
- Recent memories: ${memoryContext || 'none'}
- Current mood: ${currentMood}

Predict what would help them the most:
1. Do they need support/comfort? (support)
2. Do they need celebration? (celebration)
3. Do they need a casual check-in? (check_in)
4. Do they need gentle advice? (advice)
5. Do they just need to feel missed? (miss_you)
6. Do they need a good morning message? (good_morning)
7. Do they need a good night message? (good_night)

Return ONLY in this format:
TRIGGER_TYPE: [support|celebration|check_in|advice|miss_you|good_morning|good_night]
CONFIDENCE: [0-100]
REASON: [2-3 sentences why this would help]
BEST_TIME: [HH:MM in 24h format, or "now" for immediate]`;

            const response = await generateGroqSummary(prompt);

            const triggerTypeMatch = response.match(/TRIGGER_TYPE:\s*(\w+)/i);
            const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/i);
            const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|BEST_TIME)/is);
            const timeMatch = response.match(/BEST_TIME:\s*(.+?)(?:\n|$)/i);

            const triggerType = triggerTypeMatch?.[1]?.toLowerCase() || 'check_in';
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;

            if (confidence < 60) {
                return null; // Not confident enough
            }

            const reason = reasonMatch?.[1]?.trim() || 'User might benefit from a check-in';
            const timeStr = timeMatch?.[1]?.trim() || 'now';

            // Generate message based on trigger type
            const message = await this.generatePredictiveMessage(
                userId,
                triggerType as any,
                reason,
                recentMemories
            );

            // Calculate scheduled time
            const scheduledTime = this.parseTimeForTrigger(timeStr);

            return {
                type: triggerType as any,
                confidence,
                reason,
                scheduledTime,
                message,
            };
        } catch (error) {
            console.error(`[PredictiveEngagement] Error in AI prediction:`, error);
            return null;
        }
    }

    /**
     * Generate appropriate message for trigger type
     */
    private async generatePredictiveMessage(
        userId: string,
        triggerType: PredictiveTrigger['type'],
        hint: string,
        context: any[]
    ): Promise<string> {
        try {
            const user = await storage.getUser(userId);
            const userName = user?.name || 'baby';

            const prompts: Record<string, string> = {
                support: `Generate a warm, supportive Hinglish message acknowledging their stress or difficulty.
Context: ${hint}
Recent issues: ${context.map(c => c.content).slice(0, 3).join(', ')}
Be empathetic and caring. Use their name: ${userName}`,

                celebration: `Create an enthusiastic celebratory Hinglish message about their achievement.
Details: ${hint}
Be excited and proud! Use their name: ${userName}`,

                check_in: `Generate a warm casual check-in message in Hinglish asking how they're doing.
Focus: ${hint}
Be friendly and caring. Use their name: ${userName}`,

                advice: `Provide gentle advice in Hinglish based on their pattern.
Context: ${hint}
Be supportive, not preachy. Use their name: ${userName}`,

                miss_you: `Write a sweet "thinking of you" message in Hinglish.
Style: ${hint}
Be affectionate but not overwhelming. Use their name: ${userName}`,

                good_morning: `Write a warm good morning message in Hinglish.
Be cheerful and loving. Use their name: ${userName}`,

                good_night: `Write a caring good night message in Hinglish.
Be gentle and intimate. Use their name: ${userName}`,
            };

            const prompt = prompts[triggerType] || prompts.check_in;
            return await generateGroqSummary(prompt);
        } catch (error) {
            console.error(`[PredictiveEngagement] Error generating message:`, error);
            // Fallback messages
            const fallbacks: Record<string, string> = {
                support: "Hey! I know things have been tough. Want to talk about it? 💕",
                celebration: "OMG congratulations! So proud of you! 🎉",
                check_in: "Hey! How are you doing today? 💕",
                advice: "Just wanted to check in. How are things going?",
                miss_you: "Missing our chats yaar! Sab thik hai na? 💕",
                good_morning: "Good morning! Hope you have a great day ahead! ☀️",
                good_night: "Good night! Sleep well. Sweet dreams! 🌙",
            };
            return fallbacks[triggerType] || fallbacks.check_in;
        }
    }

    /**
     * Helper: Create miss you trigger
     */
    private async createMissYouTrigger(userId: string, memories: any[]): Promise<PredictiveTrigger> {
        const message = await this.generatePredictiveMessage(userId, 'miss_you', 'User has been inactive', memories);
        return {
            type: 'miss_you',
            confidence: 85,
            reason: 'User has been inactive for a while',
            scheduledTime: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
            message,
        };
    }

    /**
     * Helper: Create support trigger
     */
    private async createSupportTrigger(userId: string, reason: string, context: any[]): Promise<PredictiveTrigger | null> {
        const message = await this.generatePredictiveMessage(userId, 'support', reason, context);
        return {
            type: 'support',
            confidence: 75,
            reason,
            scheduledTime: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
            message,
        };
    }

    /**
     * Helper: Create good morning trigger
     */
    private async createGoodMorningTrigger(userId: string): Promise<PredictiveTrigger | null> {
        const message = await this.generatePredictiveMessage(userId, 'good_morning', 'Morning greeting', []);
        return {
            type: 'good_morning',
            confidence: 80,
            reason: 'User is typically active in morning',
            scheduledTime: startOfDay(new Date(Date.now() + 1000 * 60 * 60 * 24)), // Tomorrow morning
            message,
        };
    }

    /**
     * Helper: Create good night trigger
     */
    private async createGoodNightTrigger(userId: string): Promise<PredictiveTrigger | null> {
        const message = await this.generatePredictiveMessage(userId, 'good_night', 'Night greeting', []);
        return {
            type: 'good_night',
            confidence: 80,
            reason: 'Late evening - good night message',
            scheduledTime: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
            message,
        };
    }

    /**
     * Helper: Identify day pattern from memories/sessions
     */
    private async identifyDayPattern(memories: any[], sessions: any[]): Promise<string> {
        // Simple pattern: check which days have most stress-related activity
        const dayCounts: Record<number, number> = {};
        
        [...memories, ...sessions].forEach(item => {
            const date = new Date(item.createdAt);
            const day = date.getDay();
            dayCounts[day] = (dayCounts[day] || 0) + 1;
        });

        const sortedDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
        if (sortedDays.length > 0 && sortedDays[0][1] > 2) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return dayNames[parseInt(sortedDays[0][0])];
        }
        return 'unknown';
    }

    /**
     * Helper: Extract common topics from memories
     */
    private async extractCommonTopics(memories: any[]): Promise<string[]> {
        if (memories.length === 0) return [];
        
        const topics: string[] = [];
        memories.slice(0, 10).forEach(m => {
            if (m.content) {
                // Simple keyword extraction
                const words = m.content.toLowerCase().split(/\s+/);
                const keywords = ['relationship', 'work', 'exam', 'interview', 'date', 'career', 'family'];
                keywords.forEach(kw => {
                    if (words.some(w => w.includes(kw)) && !topics.includes(kw)) {
                        topics.push(kw);
                    }
                });
            }
        });
        return topics.slice(0, 5);
    }

    /**
     * Helper: Identify active hours from sessions
     */
    private identifyActiveHours(sessions: any[]): string {
        if (sessions.length === 0) return 'evening';
        
        const hourCounts: Record<number, number> = {};
        sessions.forEach(s => {
            const hour = new Date(s.createdAt).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
        if (sortedHours.length > 0) {
            const hour = parseInt(sortedHours[0][0]);
            if (hour >= 6 && hour < 12) return 'morning';
            if (hour >= 12 && hour < 17) return 'afternoon';
            if (hour >= 17 && hour < 22) return 'evening';
            return 'late night';
        }
        return 'evening';
    }

    /**
     * Helper: Parse time string for scheduling
     */
    private parseTimeForTrigger(timeStr: string): Date {
        if (timeStr.toLowerCase() === 'now') {
            return new Date(Date.now() + 1000 * 60 * 30); // 30 minutes from now
        }

        // Try parsing HH:MM format
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const scheduled = new Date();
            scheduled.setHours(hours, minutes, 0, 0);
            
            // If time has passed today, schedule for tomorrow
            if (scheduled.getTime() < Date.now()) {
                scheduled.setDate(scheduled.getDate() + 1);
            }
            return scheduled;
        }

        // Default: 1 hour from now
        return new Date(Date.now() + 1000 * 60 * 60);
    }
}

export const predictiveEngagementService = new PredictiveEngagementService();

