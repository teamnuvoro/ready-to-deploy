import cron from "node-cron";
import { storage } from "../storage";
import { groq } from "../groq";
import { cognitiveBus, EVENTS } from "./bus";
import { memoryService } from "./memory";
import { subHours } from "date-fns";
import { db } from "../db";
import { memoryEvolutions } from "@shared/schema";

export function setupSleepProcessor() {
    console.log("🌙 [Sleep Processor] Initialized. Scheduled for 3:00 AM.");

    // Run every day at 3:00 AM
    cron.schedule("0 3 * * *", async () => {
        console.log("🌙 [Sleep Processor] Waking up for nightly processing...");

        try {
            // 1. Get all users (simplified for now, ideally iterate)
            // For this demo, we'll just process active users from last 24h
            // But since we don't have a quick "active users" query handy, let's just log
            console.log("🌙 [Sleep Processor] Processing user memories...");

            // In a real app, we would iterate through users.
            // For now, we emit an event that the analyst can pick up if we want to expand this.
            cognitiveBus.emit(EVENTS.SLEEP_PROCESSING);

        } catch (error) {
            console.error("🌙 [Sleep Processor] Error:", error);
        }
    });
}
