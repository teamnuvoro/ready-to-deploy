// Check if we're on localhost FIRST, before importing Amplitude
const isLocalhost = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
};

// Lazy load Amplitude only when not on localhost
let amplitude: any = null;
let amplitudeLoaded = false;

const loadAmplitude = async () => {
    if (isLocalhost() || amplitudeLoaded) return null;
    try {
        amplitude = await import('@amplitude/analytics-browser');
        amplitudeLoaded = true;
        return amplitude;
    } catch (error) {
        console.warn("[Analytics] Failed to load Amplitude:", error);
        return null;
    }
};

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "cc9d84849d1d00b665e7fa4d72fd5fe2";

let isInitialized = false;

export const analytics = {
    initialize: async () => {
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
            const amp = await loadAmplitude();
            if (!amp) return;
            
            amp.init(AMPLITUDE_API_KEY, {
                defaultTracking: {
                    sessions: false, // Disable auto session tracking
                    pageViews: false, // Disable auto page views
                    formInteractions: false,
                    fileDownloads: false,
                },
                minIdLength: 1,
            });
            amplitude = amp;
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

        if (!isInitialized || !amplitude || !AMPLITUDE_API_KEY) {
            return; // Silently skip if not initialized
        }

        try {
            amplitude.track(eventName, properties);
        } catch (error) {
            // Silently fail - don't spam console
        }
    },

    identifyUser: (userId: string, traits?: Record<string, any>) => {
        // Skip all analytics on localhost
        if (isLocalhost()) {
            return;
        }

        if (!isInitialized || !amplitude || !AMPLITUDE_API_KEY) {
            return; // Silently skip if not initialized
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
            // Silently fail - don't spam console
        }
    },

    reset: () => {
        // Skip all analytics on localhost
        if (isLocalhost() || !isInitialized || !amplitude || !AMPLITUDE_API_KEY) {
            return;
        }

        try {
            amplitude.reset();
        } catch (error) {
            // Silently fail - don't spam console
        }
    }
};

