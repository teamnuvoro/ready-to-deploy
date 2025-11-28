import { cognitiveBus, EVENTS } from "./bus";
import { analytics } from "./amplitude";

// Initialize the Analytics Listener
export function setupAnalyticsListener() {
    console.log("📊 [Analytics] Listener initialized.");
    analytics.initialize();

    // LISTENER 1: The Chat Interaction
    cognitiveBus.on(EVENTS.ANALYZE_INTERACTION, async ({ userId, message, reply, metadata }) => {
        // Default metadata if not provided
        const safeMetadata = metadata || {
            latency: 0,
            tokens: 0,
            endSentiment: 0,
            startSentiment: 0,
            totalMessageCount: 0,
            endSentimentLabel: 'Neutral'
        };

        // Calculate "Emotional Delta" (Did the user feel better?)
        // Note: Sentiment analysis might not be available immediately in this event payload
        // depending on when it's calculated. Assuming metadata has it.
        const sentimentDelta = (safeMetadata.endSentiment || 0) - (safeMetadata.startSentiment || 0);

        analytics.trackEvent(userId, 'Message Sent', {
            message_length: message?.length || 0,
            response_latency_ms: safeMetadata.latency,
            token_usage: safeMetadata.tokens,
            source: 'web_client',
            // GENIUS METRIC: Is the AI strictly answering or asking questions?
            is_proactive: reply?.includes('?') || false,
            sentiment_delta: sentimentDelta
        });

        // Update User Properties based on the chat
        analytics.updateUserTraits(userId, {
            last_active: new Date().toISOString(),
            total_messages: safeMetadata.totalMessageCount,
            current_mood: safeMetadata.endSentimentLabel, // e.g., "Anxious", "Happy"
        });
    });

    // LISTENER 2: The Memory Formation (Crucial)
    // We need to make sure this event is emitted from the memory service/analyst
    cognitiveBus.on('memory_formed', ({ userId, memoryType, confidence }) => {
        analytics.trackEvent(userId, 'Memory Consolidated', {
            memory_type: memoryType, // "Core", "Preference", "Fact"
            confidence_score: confidence,
            trigger: 'conversation_depth'
        });
    });

    // LISTENER 3: Sleep Processing
    cognitiveBus.on(EVENTS.SLEEP_PROCESSING, () => {
        // Track system event (using a system user ID or just logging)
        console.log("📊 [Analytics] Sleep processing started");
    });
}
