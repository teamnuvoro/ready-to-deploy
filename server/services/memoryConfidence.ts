import { groq } from "../groq";
import { storage } from "../storage";
import { type AdvancedMemory } from "@shared/schema";
import { eq } from "drizzle-orm";
import { advancedMemories } from "@shared/schema";
import { db } from "../db";

interface MemoryConfidenceScore {
    memory_id: string;
    overall_confidence: number; // 1-100
    confidence_breakdown: {
        event_clarity: number;
        date_accuracy: number;
        emotional_accuracy: number;
        relationship_accuracy: number;
        significance_accuracy: number;
    };
    uncertainty_areas: string[];
    suggested_clarifications: string[];
    verification_status: "not_verified" | "user_confirmed" | "inferred" | "high_confidence";
}

export async function scoreMemoryConfidence(memory: AdvancedMemory): Promise<MemoryConfidenceScore> {
    const prompt = `
    Rate your confidence in understanding this memory on multiple dimensions (1-100 each).
    
    Memory:
    Event: ${(memory.surface as any).event}
    How he felt: ${(memory.emotional as any).emotions_involved?.join(", ")}
    Life Area: ${(memory.contextual as any).life_area}
    
    Rate confidence on:
    1. Event Clarity: Did he EXPLICITLY state this happened?
    2. Date Accuracy: How certain are you about WHEN this happened?
    3. Emotional Accuracy: How certain that you understand how he ACTUALLY felt?
    4. Relationship Accuracy: How certain about who the people involved are?
    5. Significance Accuracy: How certain this is actually important to him?
    
    Return JSON:
    {
      "event_clarity": 85,
      "date_accuracy": 70,
      "emotional_accuracy": 90,
      "relationship_accuracy": 80,
      "significance_accuracy": 85,
      "uncertainty_areas": ["exact date might be off"],
      "suggested_clarifications": ["When exactly did this happen?"]
    }
  `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a confidence scoring system. Output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const breakdown = JSON.parse(content);

        const overall = (
            (breakdown.event_clarity || 50) +
            (breakdown.date_accuracy || 50) +
            (breakdown.emotional_accuracy || 50) +
            (breakdown.relationship_accuracy || 50) +
            (breakdown.significance_accuracy || 50)
        ) / 5;

        let status: "not_verified" | "user_confirmed" | "inferred" | "high_confidence" = "not_verified";
        if (overall > 80) status = "high_confidence";
        else if (overall > 60) status = "inferred";

        return {
            memory_id: memory.id,
            overall_confidence: overall,
            confidence_breakdown: breakdown,
            uncertainty_areas: breakdown.uncertainty_areas || [],
            suggested_clarifications: breakdown.suggested_clarifications || [],
            verification_status: status,
        };
    } catch (e) {
        console.error("Error scoring confidence:", e);
        return {
            memory_id: memory.id,
            overall_confidence: 50,
            confidence_breakdown: {
                event_clarity: 50, date_accuracy: 50, emotional_accuracy: 50, relationship_accuracy: 50, significance_accuracy: 50
            },
            uncertainty_areas: [],
            suggested_clarifications: [],
            verification_status: "not_verified"
        };
    }
}

export async function confirmMemory(
    memoryId: string,
    userConfirmation: boolean,
    clarification?: string
): Promise<void> {
    await db
        .update(advancedMemories)
        .set({
            userConfirmation: userConfirmation,
            verificationStatus: userConfirmation ? "user_confirmed" : "disputed",
            clarificationNotes: clarification,
        })
        .where(eq(advancedMemories.id, memoryId));
}
