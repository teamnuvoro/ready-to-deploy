import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "cc9d84849d1d00b665e7fa4d72fd5fe2";

export const analytics = {
    initialize: () => {
        // STOP THE SPAM: Only run if we are NOT in localhost
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log("🚫 Analytics disabled on Localhost to prevent AdBlock errors");
            return;
        }

        if (!AMPLITUDE_API_KEY) {
            console.warn("[Analytics] VITE_AMPLITUDE_API_KEY not set. Analytics will be mocked.");
            return;
        }
        amplitude.init(AMPLITUDE_API_KEY, {
            defaultTracking: true,
            minIdLength: 1,
        });
    },

    track: (eventName: string, properties?: Record<string, any>) => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

        if (!AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Track: ${eventName}`, properties);
            return;
        }
        amplitude.track(eventName, properties);
    },

    identifyUser: (userId: string, traits?: Record<string, any>) => {
        if (!AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Identify: ${userId}`, traits);
            return;
        }
        amplitude.setUserId(userId);
        if (traits) {
            const identify = new amplitude.Identify();
            Object.entries(traits).forEach(([key, value]) => {
                identify.set(key, value);
            });
            amplitude.identify(identify);
        }
    },

    reset: () => {
        if (!AMPLITUDE_API_KEY) return;
        amplitude.reset();
    }
};
