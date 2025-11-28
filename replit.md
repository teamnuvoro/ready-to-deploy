# Riya AI Companion Chatbot

## Overview

Riya is an AI-powered relationship companion chatbot for men aged 24-28, offering guidance and companionship through conversational AI. It features a warm, intimate chat interface inspired by messaging and dating apps, with Hinglish (Hindi-English mix) support. The application is a full-stack web application with a React frontend and Express backend, utilizing OpenAI's GPT models and Sarvam AI for voice capabilities, providing streaming responses. Its business vision is to provide personalized relationship support, leveraging AI to create engaging and empathetic interactions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

-   **Frameworks:** React with TypeScript, Vite, Wouter for routing.
-   **UI/UX:** Mobile-first responsive design, Radix UI primitives, shadcn/ui (new-york style), Tailwind CSS for styling, custom warm color palette (lavender, pastel pink, coral, teal), Nunito Sans and Poppins fonts, rounded UI elements.
-   **State Management:** TanStack Query for server state, local component state for UI.
-   **Real-time:** Event-source for message streaming.

### Backend

-   **Framework:** Express.js with TypeScript (ES modules).
-   **API:** RESTful endpoints, Server-Sent Events (SSE) for real-time chat, JSON format with Zod validation.
-   **Data Storage:** In-memory for development, Drizzle ORM configured for PostgreSQL for production (users, messages, subscriptions, payments tables).
-   **AI Integration:**
    -   OpenAI API (via Replit AI Integrations) for GPT-5 conversational AI.
    -   Sarvam AI for voice features:
        -   Speech-to-Text (STT) (Saarika v2.5 model) via WebSocket for real-time transcription, supporting Hindi, English, and Hinglish.
        -   Text-to-Speech (TTS) (Bulbul v2 model, Meera voice) via WebSocket for real-time synthesis.
        -   Sarvam Chat API (sarvam-2b model) for real-time conversation loop during voice calls.
-   **Key Decisions:** Separation of storage interface, environment-based configuration, middleware for logging and error handling.

### Features

-   **Authentication:** Secure email-based OTP authentication system with:
    -   User registration with name, email, gender, and phone number (optional)
    -   Email-based OTP login (6-digit code, 24-hour validity)
    -   Session-based authentication using express-session
    -   Protected routes requiring authentication
    -   Gmail integration for sending OTP emails
    -   Security features:
        -   Session regeneration on login (prevents session fixation)
        -   httpOnly, sameSite cookies (prevents CSRF)
        -   OTP rate limiting (5 attempts, 15-minute lockout)
        -   Session ownership validation on all routes
        -   Automatic 401 redirect to login on frontend
-   **Voice Calling:** Real-time voice conversations with Riya using Sarvam AI's STT, Chat, and TTS APIs. Includes call session management, automatic conversation summarization, and secure WebSocket proxying.
-   **Summary Tracker:** Displays relationship insights (ideal partner traits, growth areas, communication style, love language) derived from voice call analysis, accessible via a dedicated page.
-   **Usage Limits:** Free users have limits (500 messages, 1200 seconds call duration); Premium users have unlimited access.
-   **Payment Gateway:** Cashfree integration for premium subscriptions (Daily Pass, Weekly Pass) with server-side payment verification, subscription activation, and secure API key management.

## External Dependencies

-   **AI Services:**
    -   OpenAI API (via Replit AI Integrations): GPT-5 for core conversational AI.
    -   Sarvam AI: Speech-to-Text, Text-to-Speech, and Chat APIs for voice features.
-   **Database:**
    -   PostgreSQL via Neon serverless driver.
    -   Drizzle ORM for schema management and queries.
-   **UI Libraries:**
    -   Radix UI: Accessible React components.
    -   Tailwind CSS: Utility-first styling.
    -   Lucide React: Icons.
    -   shadcn/ui: Pre-built UI components.
-   **Development Tools:** TypeScript, Vite, React Hook Form, Zod, date-fns.
-   **Payment Gateway:** Cashfree Payment Gateway v3.