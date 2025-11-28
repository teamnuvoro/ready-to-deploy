import { type Message } from "@shared/schema";
import { format } from "date-fns";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAI = message.role === "ai";
  
  return (
    <div 
      className={`flex ${isAI ? 'justify-start' : 'justify-end'} mb-4`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div className={`max-w-[80%] ${isAI ? 'items-start' : 'items-end'} flex flex-col`}>
        <div 
          className={`chat-bubble rounded-2xl px-4 py-3 ${
            isAI 
              ? 'chat-bubble-ai' 
              : 'chat-bubble-user'
          }`}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap" data-testid={`text-message-content-${message.id}`}>
            {message.text}
          </p>
        </div>
        <span className="text-xs text-muted-foreground mt-1 px-1" data-testid={`text-timestamp-${message.id}`}>
          {message.createdAt ? format(new Date(message.createdAt), 'h:mm a') : ''}
        </span>
      </div>
    </div>
  );
}
