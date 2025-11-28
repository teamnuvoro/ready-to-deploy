import { storage } from "../storage";
import { differenceInDays } from "date-fns";

interface RelationshipStage {
    name: string;
    intimacyRange: [number, number];
    characteristics: string[];
    allowedTopics: string[];
    suggestedTone: string;
    callFrequency: string;
}

/**
 * Relationship stages and their characteristics
 */
const RELATIONSHIP_STAGES: RelationshipStage[] = [
    {
        name: 'acquainted',
        intimacyRange: [0, 30],
        characteristics: ['Learning about each other', 'Light topics', 'Testing compatibility'],
        allowedTopics: ['hobbies', 'job', 'interests', 'dreams', 'general'],
        suggestedTone: 'warm but respectful',
        callFrequency: 'occasional',
    },
    {
        name: 'friendly',
        intimacyRange: [30, 60],
        characteristics: ['Regular conversations', 'Some personal sharing', 'Inside jokes emerging'],
        allowedTopics: ['work stress', 'family', 'dating advice', 'life goals', 'personal'],
        suggestedTone: 'friendly with occasional flirting',
        callFrequency: 'regular',
    },
    {
        name: 'intimate',
        intimacyRange: [60, 85],
        characteristics: ['Deep conversations', 'Sharing insecurities', 'Real jokes', 'Emotional support'],
        allowedTopics: ['fears', 'insecurities', 'romantic feelings', 'personal failures', 'future dreams', 'vulnerable'],
        suggestedTone: 'caring, flirty, vulnerable',
        callFrequency: 'frequent',
    },
    {
        name: 'deep_trust',
        intimacyRange: [85, 100],
        characteristics: ['Complete openness', 'Shared inside jokes', 'Can discuss anything', 'Genuine emotional bond'],
        allowedTopics: ['everything'],
        suggestedTone: 'intimate, playful, deeply caring',
        callFrequency: 'very frequent',
    },
];

interface RelationshipMetrics {
    totalChats: number;
    avgMessagesPerChat: number;
    daysSinceStart: number;
    consecutiveDays: number;
    topicIntimacy: number;
    vulnerabilityCount: number;
    insideJokesCount: number;
}

/**
 * Relationship Depth Service (TIER 4)
 * 
 * Tracks relationship progression and adapts conversation intimacy accordingly.
 * Builds from "acquainted" → "friendly" → "intimate" → "deep_trust"
 */
export class RelationshipDepthService {
    
    /**
     * Calculate relationship depth score (0-100) based on multiple factors
     */
    async calculateRelationshipDepth(userId: string): Promise<{
        intimacyScore: number;
        trustScore: number;
        vulnerabilityLevel: number;
        stage: RelationshipStage;
        metrics: RelationshipMetrics;
    }> {
        try {
            // Get all sessions
            const sessions = await storage.getUserSessions(userId);
            const totalChats = sessions.length;

            if (totalChats === 0) {
                return {
                    intimacyScore: 0,
                    trustScore: 0,
                    vulnerabilityLevel: 0,
                    stage: RELATIONSHIP_STAGES[0],
                    metrics: {
                        totalChats: 0,
                        avgMessagesPerChat: 0,
                        daysSinceStart: 0,
                        consecutiveDays: 0,
                        topicIntimacy: 0,
                        vulnerabilityCount: 0,
                        insideJokesCount: 0,
                    },
                };
            }

            // Calculate metrics - get actual message counts
            const avgMessagesPerChat = await this.getActualMessageCounts(sessions);

            const oldestSession = sessions.sort((a, b) => 
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )[0];
            const daysSinceStart = differenceInDays(new Date(), new Date(oldestSession.createdAt));

            // Calculate consecutive chat days
            const consecutiveDays = await this.calculateConsecutiveChatDays(userId, sessions);

            // Get memories for topic intimacy analysis
            const memories = await storage.getUserMemories(userId);
            
            // Topic intimacy scoring
            const topicScores: Record<string, number> = {
                insecurity: 20,
                fear: 15,
                relationship: 10,
                stress_point: 10,
                personal_goal: 8,
                work_stress: 5,
                hobby: 2,
                exam: 3,
                interview: 3,
            };

            let topicIntimacy = 0;
            let vulnerabilityCount = 0;
            
            memories.forEach(memory => {
                const score = topicScores[memory.memoryType] || 0;
                topicIntimacy += score;
                
                // Count vulnerable topics
                if (['insecurity', 'fear', 'stress_point'].includes(memory.memoryType)) {
                    vulnerabilityCount++;
                }
                
                // Check content for vulnerability keywords
                const content = memory.content.toLowerCase();
                if (content.includes('afraid') || content.includes('scared') || 
                    content.includes('worried') || content.includes('anxious') ||
                    content.includes('insecure')) {
                    vulnerabilityCount++;
                }
            });

            // Count inside jokes (approximation based on conversation patterns)
            const insideJokesCount = await this.countInsideJokes(userId, memories);

            // Calculate intimacy score (0-100)
            // Factors:
            // - Conversation count (max 40 points)
            // - Engagement depth (avg messages) (max 30 points)
            // - Consistency (consecutive days) (max 20 points)
            // - Topic intimacy (max 10 points)

            const conversationScore = Math.min(totalChats * 2, 40); // Max 40
            const engagementScore = avgMessagesPerChat > 10 ? 30 : (avgMessagesPerChat / 10) * 30; // Max 30
            const consistencyScore = Math.min((consecutiveDays / 30) * 20, 20); // Max 20
            const topicScore = Math.min(topicIntimacy / 5, 10); // Max 10

            const intimacyScore = Math.min(100, Math.round(
                conversationScore + engagementScore + consistencyScore + topicScore
            ));

            // Calculate trust score (based on vulnerability and consistency)
            const trustScore = Math.min(100, Math.round(
                (vulnerabilityCount / 5) * 50 + // Sharing vulnerabilities = trust (max 50)
                Math.min(consecutiveDays / 30, 1) * 30 + // Consistency = trust (max 30)
                Math.min(totalChats / 20, 1) * 20 // Volume = trust (max 20)
            ));

            // Vulnerability level (0-100)
            const vulnerabilityLevel = Math.min(100, Math.round(
                (vulnerabilityCount / 10) * 50 + // Direct vulnerability sharing (max 50)
                (topicIntimacy / 20) * 30 + // Intimate topics discussed (max 30)
                Math.min(intimacyScore / 100, 1) * 20 // Overall intimacy contributes (max 20)
            ));

            // Determine stage based on intimacy score
            const stage = this.getRelationshipStage(intimacyScore);

            const metrics: RelationshipMetrics = {
                totalChats,
                avgMessagesPerChat,
                daysSinceStart,
                consecutiveDays,
                topicIntimacy,
                vulnerabilityCount,
                insideJokesCount,
            };

            return {
                intimacyScore,
                trustScore,
                vulnerabilityLevel,
                stage,
                metrics,
            };
        } catch (error) {
            console.error(`[RelationshipDepth] Error calculating depth for user ${userId}:`, error);
            return {
                intimacyScore: 0,
                trustScore: 0,
                vulnerabilityLevel: 0,
                stage: RELATIONSHIP_STAGES[0],
                metrics: {
                    totalChats: 0,
                    avgMessagesPerChat: 0,
                    daysSinceStart: 0,
                    consecutiveDays: 0,
                    topicIntimacy: 0,
                    vulnerabilityCount: 0,
                    insideJokesCount: 0,
                },
            };
        }
    }

    /**
     * Get relationship stage based on intimacy score
     */
    private getRelationshipStage(intimacyScore: number): RelationshipStage {
        for (const stage of RELATIONSHIP_STAGES) {
            if (intimacyScore >= stage.intimacyRange[0] && intimacyScore < stage.intimacyRange[1]) {
                return stage;
            }
        }
        // If score is 100+, return highest stage
        return RELATIONSHIP_STAGES[RELATIONSHIP_STAGES.length - 1];
    }

    /**
     * Calculate consecutive days of chatting
     */
    private async calculateConsecutiveChatDays(userId: string, sessions: any[]): Promise<number> {
        if (sessions.length === 0) return 0;

        // Sort sessions by date (newest first)
        const sortedSessions = sessions.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Get unique days
        const chatDays = new Set<string>();
        sortedSessions.forEach(session => {
            const date = new Date(session.createdAt);
            const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            chatDays.add(dayKey);
        });

        // Calculate consecutive days from today backwards
        const daysArray = Array.from(chatDays).sort().reverse();
        let consecutiveDays = 0;
        const today = new Date();
        
        for (let i = 0; i < daysArray.length; i++) {
            const dayKey = daysArray[i];
            const [year, month, day] = dayKey.split('-').map(Number);
            const checkDate = new Date(year, month, day);
            const daysDiff = differenceInDays(today, checkDate);
            
            if (daysDiff === consecutiveDays) {
                consecutiveDays++;
            } else {
                break;
            }
        }

        return consecutiveDays;
    }

    /**
     * Count inside jokes (approximation based on conversation patterns)
     */
    private async countInsideJokes(userId: string, memories: any[]): Promise<number> {
        // Simple heuristic: inside jokes might be mentioned multiple times
        // or have playful/teasing context
        
        // For now, approximate based on relationship-related memories
        // In production, you'd analyze message content for repeated phrases,
        // playful language, etc.
        
        const relationshipMemories = memories.filter(m => 
            m.memoryType === 'relationship' || 
            m.context?.toLowerCase().includes('joke') ||
            m.context?.toLowerCase().includes('tease')
        );
        
        return Math.min(relationshipMemories.length, 10); // Cap at 10
    }

    /**
     * Update relationship depth for a user
     */
    async updateRelationshipDepth(userId: string): Promise<{
        intimacyScore: number;
        trustScore: number;
        vulnerabilityLevel: number;
        stage: RelationshipStage;
    }> {
        try {
            const depth = await this.calculateRelationshipDepth(userId);

            // Save to database (would need storage method)
            console.log(`[RelationshipDepth] Updated depth for user ${userId}:`, {
                stage: depth.stage.name,
                intimacyScore: depth.intimacyScore,
                trustScore: depth.trustScore,
                vulnerabilityLevel: depth.vulnerabilityLevel,
            });

            // TODO: Add storage method
            // await storage.upsertRelationshipDepth({
            //     userId,
            //     stage: depth.stage.name,
            //     intimacyScore: depth.intimacyScore,
            //     trustScore: depth.trustScore,
            //     vulnerabilityLevel: depth.vulnerabilityLevel,
            //     insideJokesCount: depth.metrics.insideJokesCount,
            // });

            return {
                intimacyScore: depth.intimacyScore,
                trustScore: depth.trustScore,
                vulnerabilityLevel: depth.vulnerabilityLevel,
                stage: depth.stage,
            };
        } catch (error) {
            console.error(`[RelationshipDepth] Error updating depth:`, error);
            throw error;
        }
    }

    /**
     * Get communication guidelines based on relationship stage
     */
    getCommunicationGuidelines(stage: RelationshipStage): string {
        return `
RELATIONSHIP STAGE: ${stage.name.toUpperCase()}
INTIMACY LEVEL: ${stage.intimacyRange[0]}-${stage.intimacyRange[1]}/100

Communication Guidelines:
- Tone: ${stage.suggestedTone}
- Safe topics: ${stage.allowedTopics.join(', ')}
- Call frequency: ${stage.callFrequency}
- Characteristics: ${stage.characteristics.join(', ')}

${stage.name === 'acquainted' ? '- Avoid: too personal/intimate topics (too early)' : ''}
${stage.name === 'deep_trust' ? '- You can: make inside jokes, be more playful and intimate' : ''}
${stage.name === 'intimate' || stage.name === 'deep_trust' ? '- Encourage: vulnerability and deeper sharing' : ''}
        `.trim();
    }
}

export const relationshipDepthService = new RelationshipDepthService();

