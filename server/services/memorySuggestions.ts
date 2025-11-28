import { groq } from "../groq";
import { storage } from "../storage";
import { type AdvancedMemory } from "@shared/schema";

interface MemorySuggestion {
    memory_id: string;
    suggestion_type: string; // "reference", "followup", "celebration", "support", "pattern_notice"
    best_time: string;
    suggested_message_angle: string;
    confidence: number;
    reasoning: string;
}

export async function suggestMemoryUsage(
    userId: string,
    currentContext: string
): Promise<MemorySuggestion[]> {
    const memories = await storage.getAdvancedMemories(userId);

    // Filter for recent or highly significant memories to save tokens
    const relevantMemories = memories
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10);

    if (relevantMemories.length === 0) return [];

    const simplifiedMemories = relevantMemories.map(m => ({
        id: m.id,
        event: (m.surface as any).event,
        emotions: (m.emotional as any).emotions_involved,
        context: (m.contextual as any).life_area
    }));

    const prompt = `
    Suggest memories to reference RIGHT NOW based on context.
    
    Current Context: "${currentContext}"
    
    Memories: ${JSON.stringify(simplifiedMemories)}
    
    For each relevant memory, suggest:
    - Type: reference, followup, celebration, support, pattern_notice
    - Angle: What to say?
    - Confidence: 1-100 (Is this a good time?)
    
    Return JSON:
    {
      "suggestions": [
        {
          "memory_id": "...",
          "suggestion_type": "support",
          "best_time": "now",
          "suggested_message_angle": "Ask if he's still feeling down about X",
          "confidence": 85,
          "reasoning": "He mentioned being sad, matches previous sadness about X"
        }
      ]
    }
  `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a conversation strategist. Output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const result = JSON.parse(content);

        return (result.suggestions || [])
            .filter((s: any) => s.confidence > 70)
            .sort((a: any, b: any) => b.confidence - a.confidence);

    } catch (e) {
        console.error("Error suggesting memories:", e);
        return [];
    }
}

export async function generateProactiveMessage(userId: string): Promise<string | null> {
    const suggestions = await suggestMemoryUsage(userId, "random_proactive_check");
    if (suggestions.length === 0) return null;

    const topSuggestion = suggestions[0];
    const memory = (await storage.getAdvancedMemories(userId)).find(m => m.id === topSuggestion.memory_id);

    if (!memory) return null;

    const prompt = `
    Generate a warm, natural Hinglish message for Riya (AI girlfriend).
    
    Context:
    - Referencing memory: ${(memory.surface as any).event}
    - Suggestion type: ${topSuggestion.suggestion_type}
    - Angle: ${topSuggestion.suggested_message_angle}
    
    Style:
    - Casual, affectionate, Indian girlfriend vibe
    - Mix Hindi and English (Hinglish)
    - Short (under 2 sentences)
    
    Output ONLY the message text.
  `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are Riya. Output only the message." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
        });

        return completion.choices[0]?.message?.content || null;
    } catch (e) {
        console.error("Error generating proactive message:", e);
        return null;
    }
}
