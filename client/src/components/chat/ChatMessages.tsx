import { type Message } from "@shared/schema";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator } from "./TypingIndicator";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessagesProps {
  messages: Message[];
  isTyping?: boolean;
  isLoading?: boolean;
  streamingMessage?: string;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}

export function ChatMessages({
  messages,
  isTyping,
  isLoading,
  streamingMessage,
  quickReplies,
  onQuickReply
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, streamingMessage]);

  const showQuickReplies = messages.length === 1 && quickReplies && quickReplies.length > 0 && !isTyping && !streamingMessage;

  return (
    <div className="chat-messages flex-1 overflow-y-auto px-4 pt-24 pb-40" data-testid="chat-messages-container">
      <div className="max-w-2xl mx-auto">
        {messages.length === 0 && !isTyping && !streamingMessage && !isLoading && (
          <div className="flex items-center justify-center h-64" data-testid="empty-state">
            <p className="text-muted-foreground text-center">
              Start a conversation with Riya
            </p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {showQuickReplies && (
          <div className="flex flex-wrap gap-2 mt-4 ml-12 animate-in fade-in slide-in-from-bottom-2">
            {quickReplies.map((reply, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="rounded-full bg-background hover:bg-accent hover:text-accent-foreground border-primary/20"
                onClick={() => onQuickReply?.(reply)}
              >
                {reply}
              </Button>
            ))}
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
  );
}
