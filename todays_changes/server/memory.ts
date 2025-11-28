import { storage } from "../storage";
import { extractMemoriesWithGroq, generateGroqSummary } from "../groq";
import { addHours, addDays, differenceInDays } from "date-fns";
import Groq from "groq-sdk";
import type { User } from "@shared/schema";
import { temporalAnalysisService } from "./temporalAnalysis";
import { relationshipDepthService } from "./relationshipDepth";
import { buildPersonalitySystemPrompt, getPersonalityById, getDefaultPersonality } from "./personality";

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

interface SemanticMemory {
    id: string;
    type: string;
    content: string;
    context: string | null;
    relevanceScore?: number;
    lastMentioned?: Date;
    importanceScore: number | null;
    recency: number; // Days since last mentioned
    finalScore?: number;
}

export class MemoryService {

    // TIER 1: SEMANTIC MEMORY RETRIEVAL
    // Get relevant memories based on semantic meaning, not just keywords
    async getRelevantMemories(
        userId: string,
        currentMessage: string,
        limit: number = 5
    ): Promise<SemanticMemory[]> {
        try {
            // Step 1: Get all user memories
            const allMemories = await storage.getUserMemories(userId);
            
            if (allMemories.length === 0) {
                return [];
            }

            // Step 2: Score memories for relevance to current message
            const scoredMemories = await Promise.all(
                allMemories.map(async (memory) => {
                    // Calculate relevance using AI
                    const relevanceScore = await this.calculateRelevance(
                        currentMessage,
                        memory.content,
                        memory.memoryType
                    );

                    // Calculate recency (days since last mentioned)
                    const lastMentioned = memory.lastMentionedAt || memory.createdAt;
                    const recency = differenceInDays(new Date(), new Date(lastMentioned));

                    return {
                        id: memory.id,
                        type: memory.memoryType,
                        content: memory.content,
                        context: memory.context,
                        relevanceScore,
                        lastMentioned: lastMentioned,
                        importanceScore: memory.importanceScore,
                        recency,
                    };
                })
            );

            // Step 3: Rank by composite score:
            // - Relevance (40%)
            // - Importance (30%) 
            // - Recency (20% - more recent = higher)
            // - Emotional weight (10% - from importance)
            const ranked = scoredMemories
                .map((m) => {
                    const relevanceWeight = (m.relevanceScore || 0) * 0.4;
                    const importanceWeight = ((m.importanceScore || 5) / 10) * 100 * 0.3;
                    const recencyWeight = Math.max(0, (30 - Math.min(m.recency, 30)) / 30) * 100 * 0.2;
                    const emotionalWeight = ((m.importanceScore || 5) / 10) * 100 * 0.1;

                    return {
                        ...m,
                        finalScore: relevanceWeight + importanceWeight + recencyWeight + emotionalWeight,
                    };
                })
                .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
                .slice(0, limit)
                .filter((m) => (m.finalScore || 0) > 20); // Only include if score > 20

            console.log(`[Memory] Retrieved ${ranked.length} relevant memories for user ${userId}`);
            return ranked;
        } catch (error) {
            console.error("[Memory] Error retrieving relevant memories:", error);
            return [];
        }
    }

    // Calculate semantic relevance between user message and memory
    private async calculateRelevance(
        userMessage: string,
        memoryContent: string,
        memoryType: string
    ): Promise<number> {
        try {
            const prompt = `On a scale of 0-100, how relevant is this memory to the current conversation?

Current User Message: "${userMessage}"
Memory Type: ${memoryType}
Memory Content: "${memoryContent}"

Consider:
- If memory is directly related to what user is asking about → 90-100
- If memory is about same topic/theme → 70-89
- If memory might be contextually relevant → 50-69
- If memory is somewhat related → 30-49
- If memory is not relevant → 0-29

Examples:
- Memory: "Exam on Nov 25", User: "I have test tomorrow" → 95
- Memory: "Career goal: become engineer", User: "tired today" → 20
- Memory: "Relationship stress", User: "how was your day" → 40
- Memory: "Work deadline Friday", User: "stressed about work" → 85

Return ONLY a number between 0-100.`;

            const completion = await groqClient.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are an expert at understanding semantic relevance. Return only a number 0-100.",
                    },
                    { role: "user", content: prompt },
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.1,
                max_tokens: 10,
            });

            const response = completion.choices[0]?.message?.content?.trim() || "0";
            // Extract number from response (in case it has extra text)
            const numberMatch = response.match(/\d+/);
            const score = numberMatch ? parseInt(numberMatch[0]) : 0;
            return Math.min(100, Math.max(0, score)); // Clamp between 0-100
        } catch (error) {
            console.error("[Memory] Error calculating relevance:", error);
            return 0; // Return 0 if calculation fails
        }
    }

    // Update last mentioned timestamp when memory is used
    async updateMemoryLastMentioned(memoryId: string): Promise<void> {
        try {
            // This will require adding an update method to storage
            // For now, we'll handle it in the semantic retrieval
            console.log(`[Memory] Memory ${memoryId} was mentioned - would update lastMentionedAt`);
        } catch (error) {
            console.error("[Memory] Error updating memory last mentioned:", error);
        }
    }

    // Build context-aware system prompt with relevant memories and temporal insights
    async buildContextAwareSystemPrompt(
        userMemories: SemanticMemory[],
        user: User,
        basePrompt: string
    ): Promise<string> {
        if (userMemories.length === 0) {
            return basePrompt;
        }

        const memoryContext = userMemories
            .map((m, index) => {
                const daysAgo = m.recency === 0 ? "today" : 
                               m.recency === 1 ? "yesterday" :
                               `${m.recency} days ago`;
                return `[${m.type}] ${m.content}${m.context ? ` (${m.context})` : ''} (mentioned ${daysAgo})`;
            })
            .join('\n');

        const userName = user.name || "there";
        const userAge = ""; // Could extract from user data if available
        const userCity = ""; // Could extract from user data if available

        // Get temporal insight (progress over time)
        const temporalInsight = await temporalAnalysisService.generateTemporalInsight(user.id);
        
        let temporalContext = '';
        if (temporalInsight) {
            temporalContext = `\n\nUSER'S PROGRESS OVER TIME:\n${temporalInsight}\n\nUse this to:\n- Celebrate improvements\n- Provide encouragement if declining\n- Reference past vs. present states naturally`;
        }

        // TIER 4: Get relationship depth and adapt communication
        const relationshipDepth = await relationshipDepthService.calculateRelationshipDepth(user.id);
        const communicationGuidelines = relationshipDepthService.getCommunicationGuidelines(relationshipDepth.stage);

        // PERSONALITY SYSTEM: Get user's chosen personality and build personality-aware prompt
        const personalityId = user.personalityModel || "riya_classic";
        const personality = getPersonalityById(personalityId) || getDefaultPersonality();
        
        // Build base prompt with personality (this replaces basePrompt with personality-specific version)
        const personalityBasePrompt = buildPersonalitySystemPrompt(personality, basePrompt);

        return `${personalityBasePrompt}

IMPORTANT CONTEXT ABOUT THIS USER:
Name: ${userName}${userAge ? `, Age: ${userAge}` : ''}${userCity ? `, City: ${userCity}` : ''}

RELEVANT PAST CONVERSATIONS (Use these naturally in your responses):
${memoryContext}${temporalContext}

${communicationGuidelines}

MEMORY USAGE RULES:
1. Reference relevant past conversations naturally - don't say "You told me before..."
2. Show you remember details they shared - use their name when appropriate
3. Check progress on things they mentioned before (e.g., "How did that exam go?")
4. Connect past context to current conversation when relevant
5. Match their emotional energy based on what you know about them

GOOD EXAMPLES:
- If user mentions exam and you have memory of exam stress: "Arre, remember last month you mentioned exam ka tension? This time kaisa lag raha hai? Ready haan na? 💪"
- If user seems down and you remember relationship issues: "I know things have been tough lately with [context]. Want to talk about it?"

DON'T:
- Say "You told me before..." (awkward)
- Repeat same advice twice without acknowledging you mentioned it before
- Ask about things already discussed recently
- Pretend you don't remember if you have relevant context

Use the memories naturally - like a real girlfriend who genuinely remembers and cares.`;
    }

    // Analyze conversation for memory extraction
    async extractMemoriesFromSession(userId: string, sessionId: string) {
        try {
            // 1. Get session messages
            const messages = await storage.getSessionMessages(sessionId);
            if (messages.length < 2) return; // Not enough context

            // 2. Build transcript
            const transcript = messages
                .map(m => `${m.role.toUpperCase()}: ${m.text}`)
                .join("\n");

            // 3. Call Groq for extraction
            const extraction = await extractMemoriesWithGroq(transcript);

            console.log("[Memory] Extraction result:", JSON.stringify(extraction, null, 2));

            // 4. Save memories
            if (extraction.memories && Array.isArray(extraction.memories)) {
                for (const memory of extraction.memories) {
                    const savedMemory = await storage.createUserMemory({
                        userId,
                        memoryType: memory.type,
                        content: memory.content,
                        context: memory.context,
                        importanceScore: memory.importance,
                        scheduledFollowupAt: memory.followup_date ? new Date(memory.followup_date) : null,
                        lastMentionedAt: new Date()
                    });

                    // TIER 2: Extract temporal metrics from memory
                    await temporalAnalysisService.extractTemporalMetrics(savedMemory, userId);

                    // 5. Schedule followup trigger if date is present
                    if (savedMemory.scheduledFollowupAt) {
                        await storage.createEngagementTrigger({
                            userId,
                            triggerType: 'followup',
                            scheduledFor: savedMemory.scheduledFollowupAt,
                            memoryId: savedMemory.id,
                            messageTemplate: memory.followup_message || `Hey! I was thinking about your ${memory.content}. How did it go?`,
                            sent: false
                        });
                        console.log(`[Memory] Scheduled followup for memory ${savedMemory.id} at ${savedMemory.scheduledFollowupAt}`);
                    }
                }
            }

            // 6. Track emotional state
            if (extraction.emotional_state) {
                await storage.createUserEmotionalState({
                    userId,
                    mood: extraction.emotional_state.mood,
                    energyLevel: extraction.emotional_state.energy_level,
                    stressLevel: extraction.emotional_state.stress_level,
                    detectedFrom: extraction.emotional_state.detected_from,
                    sessionId
                });

                // If stressed/sad/anxious, schedule check-in for tomorrow
                const negativeMoods = ['stressed', 'anxious', 'sad', 'frustrated'];
                if (negativeMoods.includes(extraction.emotional_state.mood)) {
                    const tomorrow = addHours(new Date(), 24);
                    await storage.createEngagementTrigger({
                        userId,
                        triggerType: 'check_in',
                        scheduledFor: tomorrow,
                        messageTemplate: "Hey, I was thinking about you. How are you feeling today? 💕",
                        sent: false
                    });
                    console.log(`[Memory] Scheduled check-in for negative mood at ${tomorrow}`);
                }
            }

        } catch (error) {
            console.error("[Memory] Error extracting memories:", error);
        }
    }
}

export const memoryService = new MemoryService();
