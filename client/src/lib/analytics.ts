import * as amplitude from '@amplitude/analytics-browser';

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "cc9d84849d1d00b665e7fa4d72fd5fe2";

// Check if we're on localhost
const isLocalhost = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
};

let isInitialized = false;

export const analytics = {
    initialize: () => {
        // STOP THE SPAM: Only run if we are NOT in localhost
        if (isLocalhost()) {
            console.log("🚫 Analytics disabled on Localhost to prevent AdBlock errors");
            return;
        }

        if (!AMPLITUDE_API_KEY) {
            console.warn("[Analytics] VITE_AMPLITUDE_API_KEY not set. Analytics will be mocked.");
            return;
        }

        try {
            amplitude.init(AMPLITUDE_API_KEY, {
                defaultTracking: {
                    sessions: true,
                    pageViews: true,
                    formInteractions: false,
                    fileDownloads: false,
                },
                minIdLength: 1,
            });
            isInitialized = true;
        } catch (error) {
            console.warn("[Analytics] Failed to initialize:", error);
        }
    },

    track: (eventName: string, properties?: Record<string, any>) => {
        // Skip all analytics on localhost
        if (isLocalhost()) {
            return;
        }

        if (!isInitialized || !AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Track: ${eventName}`, properties);
            return;
        }

        try {
            amplitude.track(eventName, properties);
        } catch (error) {
            console.warn("[Analytics] Track failed:", error);
        }
    },

    identifyUser: (userId: string, traits?: Record<string, any>) => {
        // Skip all analytics on localhost
        if (isLocalhost()) {
            return;
        }

        if (!isInitialized || !AMPLITUDE_API_KEY) {
            console.log(`[Analytics Mock] Identify: ${userId}`, traits);
            return;
        }

        try {
            amplitude.setUserId(userId);
            if (traits) {
                const identify = new amplitude.Identify();
                Object.entries(traits).forEach(([key, value]) => {
                    identify.set(key, value);
                });
                amplitude.identify(identify);
            }
        } catch (error) {
            console.warn("[Analytics] Identify failed:", error);
        }
    },

    reset: () => {
        // Skip all analytics on localhost
        if (isLocalhost() || !isInitialized || !AMPLITUDE_API_KEY) {
            return;
        }

        try {
            amplitude.reset();
        } catch (error) {
            console.warn("[Analytics] Reset failed:", error);
        }
    }
};
