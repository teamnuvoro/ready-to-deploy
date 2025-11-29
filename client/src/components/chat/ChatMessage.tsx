import { type Message } from "@shared/schema";
import { format } from "date-fns";
import { useState } from "react";

interface ChatMessageProps {
  message: Message;
  onReaction?: (messageId: string, reaction: string) => void;
}

export function ChatMessage({ message, onReaction }: ChatMessageProps) {
  const isAI = message.role === "ai";
  const [reaction, setReaction] = useState<string | null>(null);

  const handleReactionClick = (emoji: string) => {
    const newReaction = reaction === emoji ? null : emoji;
    setReaction(newReaction);
    if (onReaction) {
      onReaction(message.id, newReaction || "");
    }
  };
  
  return (
    <div 
      className={`flex ${isAI ? 'justify-start pl-2' : 'justify-end pr-1'} mb-4`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div className="relative group">
        <div 
          className={`max-w-[75%] rounded-2xl px-4 py-3 ${
            isAI 
              ? 'bg-white text-gray-800 shadow-md rounded-tl-sm' 
              : 'bg-purple-600 text-white rounded-tr-sm'
          }`}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap" data-testid={`text-message-content-${message.id}`}>
            {message.text}
          </p>
          <p 
            className={`text-xs mt-1 ${
              isAI ? "text-gray-500" : "text-white/70"
            }`}
            data-testid={`text-timestamp-${message.id}`}
          >
            {message.createdAt ? format(new Date(message.createdAt), 'h:mm a') : ''}
          </p>
        </div>

        {/* Reaction on message */}
        {reaction && (
          <div className="absolute -bottom-2 -right-2 bg-white rounded-full px-2 py-1 shadow-md text-sm border border-gray-200">
            {reaction}
          </div>
        )}

        {/* Quick reaction buttons for AI messages */}
        {isAI && !reaction && (
          <div className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white rounded-full shadow-lg px-2 py-1 border border-gray-200 z-10">
            <button
              onClick={() => handleReactionClick("❤️")}
              className="hover:scale-125 transition-transform p-1"
              title="Love"
              aria-label="React with heart"
            >
              ❤️
            </button>
            <button
              onClick={() => handleReactionClick("👍")}
              className="hover:scale-125 transition-transform p-1"
              title="Like"
              aria-label="React with thumbs up"
            >
              👍
            </button>
            <button
              onClick={() => handleReactionClick("🙏")}
              className="hover:scale-125 transition-transform p-1"
              title="Thankful"
              aria-label="React with folded hands"
            >
              🙏
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
