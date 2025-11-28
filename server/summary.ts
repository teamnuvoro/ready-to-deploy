import { Request, Response } from "express";
import { storage } from "./storage";

export async function getSummaryHandler(req: Request, res: Response) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const summary = await storage.getUserSummary(userId);
    if (!summary) {
      res.json({ hasSummary: false });
      return;
    }

    res.json({
      hasSummary: true,
      summary: {
        partnerTypeOneLiner: summary.partnerTypeOneLiner,
        top3TraitsYouValue: summary.top3TraitsYouValue,
        whatYouMightWorkOn: summary.whatYouMightWorkOn,
        nextTimeFocus: summary.nextTimeFocus,
        loveLanguageGuess: summary.loveLanguageGuess,
        communicationFit: summary.communicationFit,
        confidenceScore: summary.confidenceScore,
        updatedAt: summary.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
}


