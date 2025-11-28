import { storage } from "../storage";
import { twilioService } from "./twilio";

export class NotificationService {

    async sendPush(userId: string, message: string) {
        try {
            const token = await storage.getNotificationToken(userId);

            if (!token) {
                console.log(`[Notification] No token found for user ${userId}. Skipping push.`);
                return;
            }

            console.log(`[Notification] Sending push to device for user ${userId}: "${message}"`);

            // Send via Twilio (WhatsApp preferred)
            try {
                const user = await storage.getUser(userId);
                if (user && user.phoneNumber) {
                    // Send WhatsApp
                    await twilioService.sendWhatsApp(user.phoneNumber, message);
                    console.log(`[Notification] Sent WhatsApp to ${user.phoneNumber}`);
                } else {
                    console.log(`[Notification] No phone number for user ${userId}, skipping Twilio.`);
                }
            } catch (err) {
                console.error(`[Notification] Failed to send to device ${token.deviceType}:`, err);
            }

        } catch (error) {
            console.error("[Notification] Error sending push:", error);
        }
    }
}

export const notificationService = new NotificationService();
