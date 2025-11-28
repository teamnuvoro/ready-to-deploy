import { generateGroqSummary } from "../groq";
import Groq from "groq-sdk";
import { storage } from "../storage";
import type { UserMemory } from "@shared/schema";

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

interface TemporalTrend {
    metric: string;
    current: number;
    previous: number;
    oldest: number;
    trend: 'improving' | 'declining' | 'stable';
    changePercentage: number;
    daysTracked: number;
    dataPoints: Array<{
        value: number;
        timestamp: Date;
        context?: string;
    }>;
}

interface TemporalInsight {
    summary: string;
    trends: TemporalTrend[];
    recommendations: string[];
}

/**
 * Temporal Analysis Service (TIER 2)
 * 
 * Tracks how user's situation changes over time and detects patterns.
 * Provides insights like "Your stress has decreased 40% this month" or
 * "You've been more confident lately compared to when we started."
 */
export class TemporalAnalysisService {
    
    /**
     * Extract temporal metrics from a memory and save to timeline
     */
    async extractTemporalMetrics(memory: UserMemory, userId: string): Promise<void> {
        try {
            // For stress-related memories
            if (memory.memoryType === 'exam' || memory.memoryType === 'interview' || memory.memoryType === 'work_deadline') {
                await this.saveMetric(userId, memory.id, 'stress_level', this.extractStressLevel(memory), memory.context || null);
            }

            // For relationship memories
            if (memory.memoryType === 'relationship' || memory.memoryType === 'date') {
                const satisfaction = await this.extractSentimentScore(memory.content);
                await this.saveMetric(userId, memory.id, 'relationship_satisfaction', satisfaction, memory.context || null);
            }

            // For work memories
            if (memory.memoryType === 'work_deadline' || memory.content.toLowerCase().includes('job') || memory.content.toLowerCase().includes('career')) {
                const satisfaction = await this.extractSentimentScore(memory.content);
                await this.saveMetric(userId, memory.id, 'work_satisfaction', satisfaction, memory.context || null);
            }

            // Extract overall mood/confidence from content
            const overallMood = await this.extractMoodScore(memory.content);
            if (overallMood) {
                await this.saveMetric(userId, memory.id, 'overall_mood', overallMood, memory.context || null);
            }

            console.log(`[TemporalAnalysis] Extracted metrics from memory ${memory.id}`);
        } catch (error) {
            console.error(`[TemporalAnalysis] Error extracting temporal metrics:`, error);
        }
    }

    /**
     * Save a metric to the timeline
     */
    private async saveMetric(
        userId: string,
        memoryId: string | null,
        metricName: string,
        value: number,
        context: string | null
    ): Promise<void> {
        try {
            // Note: This requires adding methods to storage interface
            // For now, we'll log it
            console.log(`[TemporalAnalysis] Would save metric: ${metricName}=${value} for user ${userId}`, {
                userId,
                memoryId,
                metricName,
                value,
                context,
                timestamp: new Date(),
            });

            // TODO: Add to storage interface when database is ready
            // await storage.createMemoryTimeline({
            //     userId,
            //     memoryId,
            //     metricName,
            //     value,
            //     context,
            // });
        } catch (error) {
            console.error(`[TemporalAnalysis] Error saving metric:`, error);
        }
    }

    /**
     * Get temporal trends for a user over the last N days
     */
    async getTemporalTrends(userId: string, days: number = 30): Promise<TemporalTrend[]> {
        try {
            const metrics = [
                'stress_level',
                'relationship_satisfaction',
                'work_satisfaction',
                'overall_mood',
                'confidence',
            ];

            const trends: TemporalTrend[] = [];

            for (const metric of metrics) {
                // TODO: Get data from storage when available
                // const data = await storage.getMemoryTimelineData(userId, metric, days);
                
                // For now, return empty trends
                // When implemented, this would:
                // 1. Get all timeline entries for this metric in last N days
                // 2. Calculate trend (improving/declining/stable)
                // 3. Calculate change percentage
                // 4. Return structured trend object
            }

            return trends;
        } catch (error) {
            console.error(`[TemporalAnalysis] Error getting temporal trends:`, error);
            return [];
        }
    }

    /**
     * Generate temporal insight text based on trends
     */
    async generateTemporalInsight(userId: string): Promise<string> {
        try {
            const trends = await this.getTemporalTrends(userId, 30);

            if (trends.length === 0) {
                return '';
            }

            const trendsText = trends
                .filter(t => t.dataPoints.length >= 2)
                .map(t => `${t.metric.replace(/_/g, ' ')}: was ${t.previous}/10, now ${t.current}/10 (${t.trend})`)
                .join('\n');

            if (!trendsText) {
                return '';
            }

            const prompt = `Generate a warm, encouraging 2-3 sentence insight about this user's progress over the last 30 days.
Use natural Hinglish (mix of Hindi-English). Be personal and caring.

If trends are improving:
- Celebrate their growth
- Acknowledge the positive change
- Be enthusiastic but genuine

If trends are declining:
- Be supportive and understanding
- Offer gentle encouragement
- Don't be preachy

If trends are stable:
- Acknowledge consistency
- Highlight any positive aspects

Trends:
${trendsText}

Example good output:
"Arre yaar, dekho! Your stress levels have dropped so much compared to last month. You've been handling things much better. Proud of you! 💪"

Example for declining:
"I've noticed you've been feeling more stressed lately. It's okay to feel this way. Want to talk about what's going on?"

Write a 2-3 sentence insight in warm Hinglish:`;

            const insight = await generateGroqSummary(prompt);
            return insight.trim();
        } catch (error) {
            console.error(`[TemporalAnalysis] Error generating temporal insight:`, error);
            return '';
        }
    }

    /**
     * Extract stress level from memory content (1-10)
     */
    private extractStressLevel(memory: UserMemory): number {
        // Use importance score as proxy for stress (if available)
        if (memory.importanceScore && memory.importanceScore >= 7) {
            return 7 + Math.floor(Math.random() * 3); // 7-9
        }
        
        // Analyze content keywords
        const content = memory.content.toLowerCase();
        if (content.includes('stressed') || content.includes('anxious') || content.includes('worried')) {
            return 7 + Math.floor(Math.random() * 3); // 7-9
        }
        if (content.includes('nervous') || content.includes('tension')) {
            return 5 + Math.floor(Math.random() * 2); // 5-6
        }
        
        // Default for exam/interview/work deadlines
        return 6 + Math.floor(Math.random() * 2); // 6-7
    }

    /**
     * Extract sentiment score from content using AI (1-10)
     */
    private async extractSentimentScore(content: string): Promise<number> {
        try {
            const prompt = `Rate the sentiment of this text on a scale of 1-10:
- 1-3: Very negative (sad, frustrated, angry)
- 4-5: Somewhat negative (concerned, worried)
- 6-7: Neutral to slightly positive
- 8-10: Very positive (happy, excited, satisfied)

Text: "${content.substring(0, 200)}"

Return ONLY a number 1-10.`;

            const response = await generateGroqSummary(prompt);
            const numberMatch = response.match(/\d+/);
            const score = numberMatch ? parseInt(numberMatch[0]) : 5;
            return Math.min(10, Math.max(1, score));
        } catch (error) {
            console.error(`[TemporalAnalysis] Error extracting sentiment:`, error);
            return 5; // Default neutral
        }
    }

    /**
     * Extract overall mood/confidence score from content
     */
    private async extractMoodScore(content: string): Promise<number | null> {
        try {
            const prompt = `Rate the overall mood/confidence in this text on a scale of 1-10:
- 1-3: Very low (sad, defeated, hopeless)
- 4-5: Low (down, uncertain)
- 6-7: Neutral to okay
- 8-10: High (happy, confident, optimistic)

Text: "${content.substring(0, 200)}"

Return ONLY a number 1-10, or "null" if cannot determine.`;

            const response = await generateGroqSummary(prompt);
            if (response.toLowerCase().includes('null')) {
                return null;
            }
            const numberMatch = response.match(/\d+/);
            if (numberMatch) {
                const score = parseInt(numberMatch[0]);
                return Math.min(10, Math.max(1, score));
            }
            return null;
        } catch (error) {
            console.error(`[TemporalAnalysis] Error extracting mood:`, error);
            return null;
        }
    }
}

export const temporalAnalysisService = new TemporalAnalysisService();

