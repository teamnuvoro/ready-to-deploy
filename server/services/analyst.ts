import { cognitiveBus, EVENTS } from "./bus";
import { memoryService } from "./memory";
import { storage } from "../storage";
import { groq } from "../groq";
import { graphNodes, graphEdges } from "@shared/schema";
import { db } from "../db";
import { eq, and } from "drizzle-orm";

// Initialize the Analyst (Deep Brain)
export function setupAnalyst() {
    console.log("🧠 [Deep Brain] Analyst initialized and listening...");

    cognitiveBus.on(EVENTS.ANALYZE_INTERACTION, async ({ userId, sessionId, message, reply }) => {
        console.log(`🧠 [Deep Brain] Analyzing interaction for User ${userId}...`);

        try {
            // 1. Extract Advanced Memories (Tier 1)
            // This was previously called directly in routes.ts
            await memoryService.extractMemoriesFromSession(userId, sessionId);

            // 2. Update Knowledge Graph (Tier 2 - Enhanced)
            // We'll do a quick extraction of entities from the latest message
            await updateKnowledgeGraph(userId, message);

        } catch (error) {
            console.error("🧠 [Deep Brain] Error in analysis:", error);
        }
    });
}

async function updateKnowledgeGraph(userId: string, text: string) {
    try {
        const prompt = `
        Extract entities and relationships from this text for a Knowledge Graph.
        
        Text: "${text}"
        
        Return JSON:
        {
          "entities": [
            { "name": "Sarah", "type": "PERSON" },
            { "name": "Google", "type": "COMPANY" }
          ],
          "relationships": [
            { "source": "Sarah", "target": "Google", "relation": "WORKS_AT", "strength": 8 }
          ]
        }
        `;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a Knowledge Graph extractor. Output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content || "{}";
        const result = JSON.parse(content);

        // Atomic Upsert for Nodes
        const nodeMap = new Map<string, string>(); // Name -> UUID

        if (result.entities) {
            for (const entity of result.entities) {
                // Check if exists (using our new unique index logic via upsert utility or raw query)
                // Since we have a unique index on (userId, name, type), we can use onConflictDoUpdate

                const inserted = await db.insert(graphNodes)
                    .values({
                        userId,
                        name: entity.name,
                        type: entity.type,
                        lastUpdated: new Date()
                    })
                    .onConflictDoUpdate({
                        target: [graphNodes.userId, graphNodes.name, graphNodes.type],
                        set: { lastUpdated: new Date() }
                    })
                    .returning();

                if (inserted[0]) {
                    nodeMap.set(entity.name, inserted[0].id);
                }
            }
        }

        // Atomic Upsert for Edges
        if (result.relationships) {
            for (const rel of result.relationships) {
                const sourceId = nodeMap.get(rel.source);
                const targetId = nodeMap.get(rel.target);

                if (sourceId && targetId) {
                    await db.insert(graphEdges)
                        .values({
                            sourceNodeId: sourceId,
                            targetNodeId: targetId,
                            relationship: rel.relation,
                            strength: rel.strength || 1
                        })
                        .onConflictDoUpdate({
                            target: [graphEdges.sourceNodeId, graphEdges.targetNodeId, graphEdges.relationship],
                            set: { strength: rel.strength || 1 }
                        });
                }
            }
        }

    } catch (e) {
        console.error("Error updating Knowledge Graph:", e);
    }
}
