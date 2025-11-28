# Design Guidelines: Riya AI Companion Chatbot

## Design Approach

**Reference-Based Design**: Drawing inspiration from WhatsApp and Telegram's conversational warmth, combined with dating app aesthetics (Bumble, Hinge) to create an intimate, approachable space for relationship guidance. The design emphasizes emotional comfort and trust-building through soft, welcoming visuals.

**Core Design Principles**:
- Warmth over sterility: Soft pastels and rounded edges create emotional safety
- Conversational intimacy: Chat bubbles feel personal and human, not robotic
- Cultural authenticity: Hinglish-first design with Indian sensibilities
- Accessible hierarchy: Clear visual distinction between Riya and user messages

## Color Palette

**Primary Colors**:
- Lavender: 280 25% 94% (AI message bubbles, subtle backgrounds)
- Pastel Pink: 350 100% 91% (User message bubbles)
- Off-White: 0 0% 99% (Main background)

**Accent Colors**:
- Coral: 0 100% 75% (Call button, active states, key CTAs)
- Teal: 174 72% 56% (Secondary accents, links, timestamps)
- Dark Grey: 0 0% 20% (Primary text)
- Medium Grey: 0 0% 60% (Secondary text, timestamps)

**Dark Mode** (if implemented):
- Background: 240 8% 12%
- AI bubbles: 280 20% 25%
- User bubbles: 350 30% 30%
- Text: 0 0% 95%

## Typography

**Font Stack**: Nunito Sans (primary) with Poppins (fallback)
- Headers: 20-22px, 700 weight
- Chat messages: 16-18px, 400 weight
- Timestamps: 12px, 400 weight, grey
- Input text: 16px, 400 weight
- Button text: 16px, 600 weight

**Line Height**: 1.5 for chat messages, 1.2 for headers

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Chat bubble padding: p-4
- Message spacing: gap-4 between messages, gap-8 between message groups
- Container margins: mx-4, my-6
- Header/Footer height: h-16

**Container Strategy**:
- Mobile-first: max-w-lg centered
- Desktop: max-w-2xl with side padding
- Chat area: Flexible height with overflow-y-auto

## Component Library

**Header**:
- Fixed top bar with "Riya 👋" title (22px bold)
- Subtle shadow or border-bottom for depth
- Height: 64px (h-16)
- Background: Off-white with slight opacity

**Chat Bubbles**:
- AI (Left): Rounded-2xl, lavender background, max-w-[80%], align-start
- User (Right): Rounded-2xl, pastel pink background, max-w-[80%], align-end
- Tail/pointer: Small rounded triangle on appropriate side
- Text color: Dark grey (#333) with excellent contrast
- Padding: px-4 py-3

**Input Bar**:
- Fixed bottom with backdrop-blur effect
- Height: 72px (h-18)
- Background: Off-white/95% opacity
- Input field: Rounded-full, border-2 grey, px-6 py-3
- Send button: Coral circular button with send icon
- Microphone icon: Teal, positioned right within input

**Voice Call Button**:
- Position: Bottom right, above input bar (bottom-24 right-4)
- Style: Coral background, rounded-full, w-14 h-14
- Icon: White phone icon, centered
- Shadow: lg shadow for prominence
- Hover: Scale-105 transform, deeper coral

**Message Timestamps**:
- 12px grey text below bubbles
- Format: "10:45 AM" or relative "Just now"
- Align with message direction

**Typing Indicator**:
- Three animated dots in lavender bubble
- Appears on left when Riya is "thinking"
- Subtle pulse animation

## Animations

**Sparingly Applied**:
- Message entry: Fade-in with slight slide-up (200ms ease)
- Typing indicator: Dot pulse animation
- Call button: Gentle scale on hover (150ms)
- Scroll behavior: Smooth auto-scroll to new messages

**NO excessive animations**: Keep interface calm and focused on conversation

## Images

**No hero images required** - This is a utility-focused chat interface

**Avatar/Profile**:
- Small circular avatar for Riya in header (32px)
- Warm, friendly illustration or icon (not photo)
- Positioned left of "Riya 👋" text

**Visual Enhancements**:
- Subtle gradient overlay on header (lavender to transparent)
- Optional: Soft abstract pattern in empty chat state (before conversation starts)

## Responsive Behavior

**Mobile (< 768px)**:
- Single column, full width
- Input bar spans full width
- Call button scales to w-12 h-12
- Chat bubbles max-w-[85%]

**Desktop (≥ 768px)**:
- Centered container (max-w-2xl)
- Chat bubbles max-w-[75%]
- Larger input area with better spacing
- Call button w-16 h-16

**Accessibility**:
- Focus states: 2px coral outline on interactive elements
- Tab navigation: Logical flow from header to messages to input
- ARIA labels: Proper labeling for screen readers
- Color contrast: WCAG AA compliant (4.5:1 minimum)

## Interaction States

**Buttons**:
- Default: Coral background, white text
- Hover: Deeper coral (0 100% 65%), subtle lift
- Active: Pressed state with scale-95
- Disabled: 50% opacity, cursor-not-allowed

**Input Field**:
- Default: Grey border, white background
- Focus: Coral border-2, subtle glow
- Filled: Maintains focus state styling

**Chat Bubbles**:
- No hover states (static content)
- Long-press on mobile: Context menu (copy, etc.)

This design creates an emotionally intelligent space where men feel comfortable exploring relationship guidance through warm, approachable aesthetics that balance professionalism with intimacy.