import { groq } from "../groq";
import { storage } from "../storage";
import { type AdvancedMemory } from "@shared/schema";

interface MemoryConnection {
    memory1_id: string;
    memory2_id: string;
    connection_type: string; // "causal", "emotional", "thematic", "temporal", "people-related"
    connection_strength: number; // 1-10
    description: string;
}

interface UserKnowledgeGraph {
    user_id: string;
    people_map: Map<string, PersonProfile>;
    life_areas: Map<string, LifeAreaProfile>;
    patterns: Pattern[];
    emotional_journey: EmotionalJourney;
    goals_and_fears: GoalsAndFears;
}

interface PersonProfile {
    name: string;
    relationship: string;
    mentions_count: number;
    emotional_context: string[];
    last_mentioned: Date;
    significance: "minor" | "moderate" | "important" | "critical";
}

interface LifeAreaProfile {
    area: string;
    memory_ids: string[];
    overall_sentiment: "positive" | "neutral" | "negative" | "mixed";
    recent_trend: "improving" | "declining" | "stable";
    key_concerns: string[];
    victories: string[];
}

interface Pattern {
    pattern_name: string;
    frequency: string;
    memories_involved: string[];
    emotional_impact: number;
    actionable_insight: string;
}

interface EmotionalJourney {
    starting_emotional_state: string[];
    current_emotional_state: string[];
    overall_trend: string;
    major_shifts: string[];
}

interface GoalsAndFears {
    short_term_goals: string[];
    long_term_dreams: string[];
    fears: string[];
    blockers: string[];
    strengths_to_leverage: string[];
}

export async function buildUserKnowledgeGraph(userId: string): Promise<UserKnowledgeGraph> {
    const memories = await storage.getAdvancedMemories(userId);

    // 1. Build people map
    const peopleMap = new Map<string, PersonProfile>();
    memories.forEach((mem) => {
        const people = (mem.surface as any).people_involved || [];
        people.forEach((person: string) => {
            if (!peopleMap.has(person)) {
                peopleMap.set(person, {
                    name: person,
                    relationship: "unknown", // Could infer this
                    mentions_count: 0,
                    emotional_context: [],
                    last_mentioned: mem.createdAt,
                    significance: "minor",
                });
            }

            const profile = peopleMap.get(person)!;
            profile.mentions_count++;
            profile.emotional_context.push(...(mem.emotional as any).emotions_involved);
            if (mem.createdAt > profile.last_mentioned) {
                profile.last_mentioned = mem.createdAt;
            }
        });
    });

    // 2. Build life areas map
    const lifeAreasMap = new Map<string, LifeAreaProfile>();
    memories.forEach((mem) => {
        const area = (mem.contextual as any).life_area;
        if (!area) return;

        if (!lifeAreasMap.has(area)) {
            lifeAreasMap.set(area, {
                area,
                memory_ids: [],
                overall_sentiment: "neutral",
                recent_trend: "stable",
                key_concerns: [],
                victories: [],
            });
        }

        const profile = lifeAreasMap.get(area)!;
        profile.memory_ids.push(mem.id);

        const emotions = (mem.emotional as any).emotions_involved || [];
        const event = (mem.surface as any).event;

        if (emotions.includes("stressed") || emotions.includes("anxious")) {
            profile.key_concerns.push(event);
        } else if (emotions.includes("happy") || emotions.includes("excited") || emotions.includes("proud")) {
            profile.victories.push(event);
        }
    });

    // 3. Detect patterns (AI)
    const patterns = await detectPatterns(memories);

    // 4. Build emotional journey
    const emotionalJourney = analyzeEmotionalJourney(memories);

    // 5. Extract goals and fears (AI)
    const goalsAndFears = await extractGoalsAndFears(memories);

    return {
        user_id: userId,
        people_map: peopleMap,
        life_areas: lifeAreasMap,
        patterns,
        emotional_journey: emotionalJourney,
        goals_and_fears: goalsAndFears,
    };
}

async function detectPatterns(memories: AdvancedMemory[]): Promise<Pattern[]> {
    if (memories.length < 3) return [];

    const simplifiedMemories = memories.map((m) => ({
        date: m.createdAt,
        event: (m.surface as any).event,
        emotions: (m.emotional as any).emotions_involved,
    }));

    const prompt = `
    Analyze these memories and identify recurring patterns, themes, and cycles.
    
    Look for:
    1. Timing patterns (always stressed on Mondays?)
    2. Emotional cycles (confidence, then doubt, then confidence)
    3. Topic patterns (keeps coming back to same issue)
    
    Return JSON array:
    {
      "patterns": [
        {
          "pattern_name": "Monday Blues",
          "frequency": "weekly",
          "emotional_impact": 7,
          "actionable_insight": "Send motivational message Sunday evening"
        }
      ]
    }
    
    Memories: ${JSON.stringify(simplifiedMemories.slice(0, 20))}
  `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a pattern recognition expert. Output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const result = JSON.parse(content);
        return result.patterns || [];
    } catch (e) {
        console.error("Error detecting patterns:", e);
        return [];
    }
}

function analyzeEmotionalJourney(memories: AdvancedMemory[]): EmotionalJourney {
    const sorted = [...memories].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (sorted.length === 0) {
        return {
            starting_emotional_state: [],
            current_emotional_state: [],
            overall_trend: "stable",
            major_shifts: [],
        };
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    return {
        starting_emotional_state: (first.emotional as any).emotions_involved,
        current_emotional_state: (last.emotional as any).emotions_involved,
        overall_trend: "stable", // Simplified for now
        major_shifts: [],
    };
}

async function extractGoalsAndFears(memories: AdvancedMemory[]): Promise<GoalsAndFears> {
    if (memories.length < 3) return {
        short_term_goals: [],
        long_term_dreams: [],
        fears: [],
        blockers: [],
        strengths_to_leverage: []
    };

    const simplifiedMemories = memories.map((m) => ({
        event: (m.surface as any).event,
        emotions: (m.emotional as any).emotions_involved,
        context: (m.contextual as any).life_area,
    }));

    const prompt = `
    Based on these memories, what are this person's goals and fears?
    
    Memories: ${JSON.stringify(simplifiedMemories.slice(0, 20))}
    
    Return JSON:
    {
      "short_term_goals": [],
      "long_term_dreams": [],
      "fears": [],
      "blockers": [],
      "strengths_to_leverage": []
    }
  `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are an expert psychologist. Output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        return JSON.parse(content);
    } catch (e) {
        console.error("Error extracting goals/fears:", e);
        return {
            short_term_goals: [],
            long_term_dreams: [],
            fears: [],
            blockers: [],
            strengths_to_leverage: []
        };
    }
}

export async function buildContextWithKnowledgeGraph(userId: string): Promise<string> {
    const graph = await buildUserKnowledgeGraph(userId);

    const peopleStr = Array.from(graph.people_map.values())
        .slice(0, 5)
        .map((p) => `${p.name} (${p.relationship})`)
        .join(", ");

    const areasStr = Array.from(graph.life_areas.values())
        .map((area) => `- ${area.area}: ${area.overall_sentiment}`)
        .join("\n");

    const patternsStr = graph.patterns.map((p) => `- ${p.pattern_name}: ${p.actionable_insight}`).join("\n");

    return `
    USER KNOWLEDGE GRAPH:
    People: ${peopleStr}
    Life Areas:
    ${areasStr}
    Patterns:
    ${patternsStr}
    Goals: ${graph.goals_and_fears.short_term_goals.join(", ")}
    Fears: ${graph.goals_and_fears.fears.join(", ")}
  `;
}
