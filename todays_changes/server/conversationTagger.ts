import { generateGroqSummary } from "../groq";
import Groq from "groq-sdk";
import { storage } from "../storage";

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

const TAG_CATEGORIES = {
    RELATIONSHIP: ['relationship', 'dating', 'crush', 'heartbreak', 'marriage', 'commitment'],
    WORK: ['job', 'career', 'interview', 'promotion', 'boss', 'colleagues', 'deadline'],
    HEALTH: ['stress', 'anxiety', 'depression', 'sleep', 'exercise', 'diet'],
    FAMILY: ['parents', 'siblings', 'family', 'home', 'relatives'],
    PERSONAL_GROWTH: ['confidence', 'goals', 'learning', 'hobby', 'achievement'],
    LIFE_ADVICE: ['confused', 'decision', 'advice', 'thoughts', 'future'],
};

interface ConversationTagResult {
    tags: string[];
    primaryEmotion: string;
    intensity: number;
}

/**
 * Conversation Tagger Service
 * 
 * Automatically tags and categorizes conversations for better memory organization
 * and pattern recognition.
 */
export class ConversationTagger {
    
    /**
     * Analyze conversation and automatically tag it
     */
    async autoTagConversation(
        sessionId: string,
        transcript: string
    ): Promise<ConversationTagResult> {
        try {
            const prompt = `Analyze this conversation and identify:

1. What topics are discussed? (Choose from: relationship, work, health, family, personal_growth, life_advice)
   - You can select multiple topics if relevant
   - Be specific: e.g., "relationship" not "love", "work" not "job stress"

2. What's the primary emotion? (happy, sad, stressed, confused, excited, angry, anxious, hopeful, calm, frustrated, confident)

3. How intense/important is this conversation? (1-10 scale)
   - 1-3: Casual chat, small talk
   - 4-6: Regular conversation, some depth
   - 7-8: Important topic, emotional depth
   - 9-10: Critical issue, very emotional, urgent

Return in this EXACT format:
TAGS: [tag1, tag2, tag3]
EMOTION: [emotion]
INTENSITY: [1-10]

Conversation:
${transcript.substring(0, 3000)}${transcript.length > 3000 ? '...' : ''}`;

            const response = await generateGroqSummary(prompt);

            // Extract tags
            const tagsMatch = response.match(/TAGS:\s*(.+?)(?:\n|$)/i);
            const emotionMatch = response.match(/EMOTION:\s*(.+?)(?:\n|$)/i);
            const intensityMatch = response.match(/INTENSITY:\s*(\d+)/i);

            let tags: string[] = [];
            if (tagsMatch) {
                const tagString = tagsMatch[1].trim();
                // Remove brackets and split by comma
                tags = tagString
                    .replace(/[\[\]]/g, '')
                    .split(',')
                    .map(t => t.trim().toLowerCase())
                    .filter(t => t.length > 0);
            }

            const primaryEmotion = emotionMatch ? emotionMatch[1].trim().toLowerCase() : 'neutral';
            const intensityStr = intensityMatch ? intensityMatch[1].trim() : '5';
            const intensity = Math.min(10, Math.max(1, parseInt(intensityStr) || 5));

            console.log(`[ConversationTagger] Tagged session ${sessionId}: tags=${tags.join(',')}, emotion=${primaryEmotion}, intensity=${intensity}`);

            return {
                tags,
                primaryEmotion,
                intensity,
            };
        } catch (error) {
            console.error(`[ConversationTagger] Error tagging conversation for session ${sessionId}:`, error);
            // Return default values on error
            return {
                tags: ['general'],
                primaryEmotion: 'neutral',
                intensity: 5,
            };
        }
    }

    /**
     * Save conversation tags to database
     */
    async saveConversationTags(
        userId: string,
        sessionId: string,
        tags: string[],
        emotion: string,
        intensity: number
    ): Promise<void> {
        try {
            // Note: This requires adding the conversationTags table to storage interface
            // For now, we'll log it and implement the storage method separately
            console.log(`[ConversationTagger] Saving tags for session ${sessionId}:`, {
                userId,
                sessionId,
                tags,
                primaryEmotion: emotion,
                intensity,
            });

            // TODO: Add to storage interface
            // await storage.createConversationTag({
            //     userId,
            //     sessionId,
            //     tags,
            //     primaryEmotion: emotion,
            //     intensity,
            // });
        } catch (error) {
            console.error(`[ConversationTagger] Error saving tags:`, error);
        }
    }

    /**
     * Get conversations by tag
     */
    async getConversationsByTag(userId: string, tag: string): Promise<any[]> {
        try {
            // TODO: Implement once storage method is available
            console.log(`[ConversationTagger] Getting conversations with tag "${tag}" for user ${userId}`);
            return [];
        } catch (error) {
            console.error(`[ConversationTagger] Error getting tagged conversations:`, error);
            return [];
        }
    }
}

export const conversationTagger = new ConversationTagger();

