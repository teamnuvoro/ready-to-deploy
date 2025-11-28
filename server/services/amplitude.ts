import { init, track, identify, Identify } from '@amplitude/analytics-node';

const AMPLITUDE_API_KEY = process.env.AMPLITUDE_API_KEY || "cc9d84849d1d00b665e7fa4d72fd5fe2";

export const analytics = {
    initialize: () => {
        if (!AMPLITUDE_API_KEY) {
            console.warn("[Analytics] AMPLITUDE_API_KEY not set. Analytics will be mocked.");
            return;
        }
        init(AMPLITUDE_API_KEY, {
            minIdLength: 1, // Require valid User IDs
            flushIntervalMillis: 2000, // Batch events to reduce network overhead
        });
    },

    // 1. Track specific actions
    trackEvent: (userId: string, eventName: string, properties: Record<string, any> = {}) => {
        if (!AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Event: ${eventName} | User: ${userId} | Props:`, properties);
            return;
        }
        track(eventName, properties, { user_id: userId });
    },

    // 2. Update User Profile (The "Persona" linkage)
    updateUserTraits: (userId: string, traits: Record<string, any>) => {
        if (!AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Identify User: ${userId} | Traits:`, traits);
            return;
        }
        const identifyObj = new Identify();
        Object.entries(traits).forEach(([key, value]) => {
            identifyObj.set(key, value);
        });
        identify(identifyObj, { user_id: userId });
    }
};
