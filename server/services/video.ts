import { storage } from "../storage";

export class VideoService {
    // Mock video generation for now
    async generateVideoMessage(userId: string, context: string, mood: string) {
        console.log(`[Video] Generating video for user ${userId} with context: ${context} and mood: ${mood}`);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Return a mock video object
        const mockVideo = await storage.createVisualContent({
            userId,
            contentType: "video_message",
            url: "https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-video-call-on-smartphone-40749-large.mp4", // Placeholder video
            thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
            caption: "Just wanted to say hi! 💕",
            context: context,
            emotionTag: mood,
            isUnlockable: false
        });

        return mockVideo;
    }

    async generateSelfie(userId: string, context: string, mood: string) {
        console.log(`[Video] Generating selfie for user ${userId} with context: ${context} and mood: ${mood}`);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1500));

        const mockSelfie = await storage.createVisualContent({
            userId,
            contentType: "selfie",
            url: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3", // Placeholder selfie
            thumbnailUrl: null,
            caption: `Thinking of you... (${context})`,
            context: context,
            emotionTag: mood,
            isUnlockable: false
        });

        return mockSelfie;
    }
}

export const videoService = new VideoService();
