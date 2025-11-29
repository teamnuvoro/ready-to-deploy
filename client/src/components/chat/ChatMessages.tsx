import { type Message } from "@shared/schema";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator } from "./TypingIndicator";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessagesProps {
  messages: Message[];
  isTyping?: boolean;
  isLoading?: boolean;
  streamingMessage?: string;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}

const defaultQuickReplies = [
  "Mera current relationship confusing hai 💭",
  "Kaise pata chalega koi mujhe pasand karta hai?",
  "Main samajhna chahta hoon main kya dhundh raha hoon",
  "Mujhe dating advice chahiye"
];

const conversationStarters = [
  "Kaise pata chalega koi mujhme interested hai?",
  "Main apni communication skills kaise improve kar sakta hoon?",
  "Long-term partner mein mujhe kya dekhna chahiye?",
  "Mujhe trust issues ho rahe hain",
  "Kaise pata chalega main relationship ke liye ready hoon?",
  "Healthy relationship kya hoti hai?"
];

const dailyTip = {
  title: "💡 Today's Relationship Tip",
  text: "Active listening is crucial - don't just focus on replying, try to truly understand. Show empathy and validate feelings."
};

export function ChatMessages({
  messages,
  isTyping,
  isLoading,
  streamingMessage,
  quickReplies = defaultQuickReplies,
  onQuickReply
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showTip, setShowTip] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousMessagesLengthRef = useRef(messages.length);

  // ============================================
  // AUTO-SCROLL TO BOTTOM (FIXED - No Infinite Loop)
  // ============================================
  useEffect(() => {
    // Only scroll if new message was added (not on every refetch)
    const newMessageAdded = messages.length > previousMessagesLengthRef.current;
    
    if (!newMessageAdded && !isTyping && !streamingMessage) {
      previousMessagesLengthRef.current = messages.length;
      return;
    }

    // Check if user is at bottom of chat
    const container = messagesContainerRef.current;
    if (!container) {
      previousMessagesLengthRef.current = messages.length;
      return;
    }

    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 100; // 100px tolerance

    // Only scroll if at bottom OR new message was just added OR typing/streaming
    if (isAtBottom || newMessageAdded || isTyping || streamingMessage) {
      scrollToBottom();
    }

    previousMessagesLengthRef.current = messages.length;
  }, [messages.length, isTyping, streamingMessage]); // Only trigger when length changes, not entire array

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    setTimeout(() => {
      const lastMessage = container.querySelector('[data-message]:last-child');
      if (lastMessage) {
        lastMessage.scrollIntoView({ 
          behavior: 'smooth',
          block: 'nearest'
        });
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }, 50);
  };

  const showQuickRepliesCondition = messages.length <= 3 && !isTyping && !streamingMessage;
  const displayQuickReplies = messages.length === 1 ? quickReplies : conversationStarters.slice(0, 2);

  return (
    <div 
      ref={messagesContainerRef}
      className="chat-messages flex-1 overflow-y-auto relative bg-gradient-to-b from-purple-50/30 to-pink-50/30" 
      data-testid="chat-messages-container"
      data-messages-container
    >
      {/* WhatsApp-style background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20c0-5.523 4.477-10 10-10s10 4.477 10 10c0 1.567-.362 3.047-1.006 4.365l8.485 8.485C49.047 32.362 50.527 32 52.092 32c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.565 0-3.045-.362-4.363-1.006l-8.485 8.485C39.638 60.953 40 62.433 40 64c0 5.523-4.477 10-10 10s-10-4.477-10-10c0-1.567.362-3.047 1.006-4.365l-8.485-8.485C11.047 51.638 9.567 52 8.002 52c-5.523 0-10-4.477-10-10s4.477-10 10-10c1.565 0 3.045.362 4.363 1.006l8.485-8.485C20.362 23.047 20 21.567 20 20z' fill='%23a855f7' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundSize: '80px 80px',
          transform: 'rotate(-15deg) scale(1.5)',
          transformOrigin: 'center'
        }} />
      </div>

      <div className="relative z-10 px-4 pt-4 pb-40">
        <div className="max-w-2xl mx-auto">
          {/* Daily Tip Card */}
          {showTip && messages.length === 0 && (
            <div className="mb-4 bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-4 shadow-sm border border-purple-200">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-purple-800 font-semibold">{dailyTip.title}</h3>
                <button
                  onClick={() => setShowTip(false)}
                  className="text-purple-400 hover:text-purple-600 text-sm"
                >
                  ✕
                </button>
              </div>
              <p className="text-purple-700 text-sm leading-relaxed">{dailyTip.text}</p>
            </div>
          )}

          {messages.length === 0 && !isTyping && !streamingMessage && !isLoading && (
            <div className="flex items-center justify-center h-64" data-testid="empty-state">
              <p className="text-muted-foreground text-center">
                Start a conversation with Riya
              </p>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} data-message>
              <ChatMessage 
                message={message}
                onReaction={(messageId, reaction) => {
                  // Handle reaction - could save to backend in future
                  console.log(`Reaction ${reaction} on message ${messageId}`);
                }}
              />
            </div>
          ))}

          {showQuickRepliesCondition && displayQuickReplies.length > 0 && (
            <div className="mb-3 animate-in fade-in slide-in-from-bottom-2">
              {messages.length > 3 && (
                <p className="text-xs text-gray-500 mb-2">Need some ideas? Try these:</p>
              )}
              <div className="flex flex-wrap gap-2">
                {displayQuickReplies.map((reply, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className={`rounded-full text-sm ${
                      messages.length === 1
                        ? "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200"
                    }`}
                    onClick={() => onQuickReply?.(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {streamingMessage && (
            <ChatMessage
              message={{
                id: "streaming",
                role: "ai",
                text: streamingMessage,
                sessionId: messages[0]?.sessionId || "",
                userId: messages[0]?.userId || "",
                tag: "general",
                createdAt: new Date(),
              }}
            />
          )}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
