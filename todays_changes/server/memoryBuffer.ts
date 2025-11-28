import { generateGroqSummary } from "../groq";
import Groq from "groq-sdk";

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

interface ChatMemoryBuffer {
    sessionId: string;
    userId: string;
    messages: Array<{
        role: string;
        content: string;
        timestamp: Date;
    }>;
    keyPoints: string[]; // Extracted during chat
    emotionalArc: string; // How emotions evolved
    lastSummarized: Date;
}

/**
 * Memory Buffer Service
 * 
 * Maintains working memory for active chat sessions to prevent context loss
 * in long conversations. Summarizes key points every 10 messages.
 */
export class MemoryBuffer {
    private buffer = new Map<string, ChatMemoryBuffer>();

    // Initialize buffer for a session
    initializeBuffer(sessionId: string, userId: string) {
        this.buffer.set(sessionId, {
            sessionId,
            userId,
            messages: [],
            keyPoints: [],
            emotionalArc: '',
            lastSummarized: new Date(),
        });
        console.log(`[MemoryBuffer] Initialized buffer for session ${sessionId}`);
    }

    // Add message to buffer
    addMessage(sessionId: string, role: string, content: string) {
        const buf = this.buffer.get(sessionId);
        if (buf) {
            buf.messages.push({
                role,
                content,
                timestamp: new Date(),
            });
        } else {
            console.warn(`[MemoryBuffer] Buffer not found for session ${sessionId}`);
        }
    }

    // Get message count for a session
    getMessageCount(sessionId: string): number {
        const buf = this.buffer.get(sessionId);
        return buf ? buf.messages.length : 0;
    }

    // Update memory buffer - extract key points and emotion every 10 messages
    async updateMemoryBuffer(sessionId: string): Promise<void> {
        const buf = this.buffer.get(sessionId);
        if (!buf || buf.messages.length < 10) {
            return;
        }

        // Check if we should summarize (every 10 messages)
        const messagesSinceSummary = buf.messages.length - buf.keyPoints.length * 10;
        if (messagesSinceSummary < 10) {
            return;
        }

        try {
            // Get last 10-15 messages for summarization
            const recentMessages = buf.messages.slice(-15);
            const transcript = recentMessages
                .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
                .join('\n');

            const summaryPrompt = `Summarize the last part of this conversation in 2-3 sentences.

Focus on:
1. What's the user talking about? (main topic)
2. What's their emotional state? (mood, feelings)
3. Any decisions or next steps mentioned?

Conversation:
${transcript}

Provide summary in this exact format:
TOPIC: [main topic in one phrase]
EMOTION: [happy/stressed/confused/excited/anxious/sad/calm/frustrated/confident]
SUMMARY: [2-3 sentence summary of key points]`;

            const response = await generateGroqSummary(summaryPrompt);

            // Extract components
            const topicMatch = response.match(/TOPIC:\s*(.+?)(?:\n|$)/i);
            const emotionMatch = response.match(/EMOTION:\s*(.+?)(?:\n|$)/i);
            const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?:\n|$)/is);

            const topic = topicMatch ? topicMatch[1].trim() : 'general';
            const emotion = emotionMatch ? emotionMatch[1].trim() : 'neutral';
            const summary = summaryMatch ? summaryMatch[1].trim() : response.split('SUMMARY:')[1]?.trim() || '';

            if (summary) {
                buf.keyPoints.push(`${topic}: ${summary}`);
                buf.emotionalArc += (buf.emotionalArc ? ' → ' : '') + emotion;
                buf.lastSummarized = new Date();

                console.log(`[MemoryBuffer] Updated buffer for session ${sessionId}: Topic=${topic}, Emotion=${emotion}`);
            }
        } catch (error) {
            console.error(`[MemoryBuffer] Error updating buffer for session ${sessionId}:`, error);
        }
    }

    // Get working memory for current session (formatted context)
    getWorkingMemory(sessionId: string): string {
        const buf = this.buffer.get(sessionId);
        if (!buf || buf.keyPoints.length === 0) {
            return '';
        }

        const latestTopic = buf.keyPoints[buf.keyPoints.length - 1];
        const currentEmotion = buf.emotionalArc.split('→').pop()?.trim() || 'neutral';
        const topicCount = buf.keyPoints.length;

        return `
CURRENT CONVERSATION CONTEXT (Last ${topicCount * 10} messages):

Topics Discussed:
${buf.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}

Emotional Journey: ${buf.emotionalArc || 'neutral'}

Remember This Context:
- User is currently focused on: ${latestTopic.split(':')[0]}
- They seem: ${currentEmotion}
- This is a longer conversation - maintain continuity and reference earlier topics naturally
        `.trim();
    }

    // Clear buffer after session ends
    clearBuffer(sessionId: string) {
        const buf = this.buffer.get(sessionId);
        if (buf) {
            console.log(`[MemoryBuffer] Clearing buffer for session ${sessionId} (${buf.messages.length} messages)`);
            this.buffer.delete(sessionId);
        }
    }

    // Get full buffer for debugging
    getBuffer(sessionId: string): ChatMemoryBuffer | undefined {
        return this.buffer.get(sessionId);
    }
}

// Export singleton instance
export const memoryBuffer = new MemoryBuffer();

