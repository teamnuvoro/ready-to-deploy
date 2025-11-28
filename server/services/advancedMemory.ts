import { groq } from "../groq";
import { storage } from "../storage";
import { type InsertAdvancedMemory } from "@shared/schema";

interface AdvancedMemoryExtraction {
    surface: {
        event: string;
        date: string;
        people_involved: string[];
        location: string;
    };
    emotional: {
        emotional_weight: number;
        emotions_involved: string[];
        emotional_trajectory: string;
        vulnerability_level: number;
        confidence_score: number;
    };
    contextual: {
        life_area: string;
        recurring_theme: boolean;
        related_memories: string[];
        pattern_type: string;
        significance: "minor" | "moderate" | "major" | "life_changing";
    };
    predictive: {
        likely_followup_need: string;
        best_followup_timing: string;
        suggested_followup_angle: string;
        trigger_keywords: string[];
        prediction_confidence: number;
    };
}

export async function extractAdvancedMemories(
    userId: string,
    sessionId: string,
    transcript: string
): Promise<void> {
    try {
        const prompt = `
    Analyze this conversation and extract DEEP, meaningful memories.
    
    For EACH memory, identify:
    
    1. SURFACE LEVEL (What happened):
       - What specific event/information was shared?
       - Who was involved?
       - When and where?
    
    2. EMOTIONAL LAYER (Why it matters to him):
       - How emotionally significant is this? (1-10)
       - What emotions did he express?
       - Did his emotional tone change?
       - How vulnerable was he in sharing? (1-10)
       - How confident should we be about this? (1-100)
    
    3. CONTEXTUAL LAYER (Why this matters in his life):
       - Which life area? (relationships, career, family, health, personal_growth, finance, hobbies)
       - Is this a REPEAT theme?
       - Is this: minor / moderate / major / life_changing?
       - What pattern is this part of?
    
    4. PREDICTIVE LAYER (What should Riya do with this):
       - What does he likely need from Riya? (encouragement, celebration, advice, listening)
       - When should Riya bring this up? (ISO timestamp string)
       - How should Riya reference this?
       - What keywords should trigger remembering this?
       - How confident are we in this prediction? (1-100)
    
    Return a JSON object with a "memories" array containing objects with this structure:
    {
      "memories": [
        {
          "surface": { ... },
          "emotional": { ... },
          "contextual": { ... },
          "predictive": { ... }
        }
      ]
    }
    
    Conversation:
    ${transcript}
    `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are an expert memory extraction system. You output only valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const result = JSON.parse(content);

        if (result.memories && Array.isArray(result.memories)) {
            for (const mem of result.memories) {
                const memory: InsertAdvancedMemory = {
                    userId,
                    sessionId,
                    surface: mem.surface,
                    emotional: mem.emotional,
                    contextual: mem.contextual,
                    predictive: mem.predictive,
                    rawTranscript: transcript,
                };
                await storage.createAdvancedMemory(memory);
                console.log(`[AdvancedMemory] Created memory for user ${userId}`);
            }
        }

    } catch (error) {
        console.error("[AdvancedMemory] Error extracting memories:", error);
    }
}
