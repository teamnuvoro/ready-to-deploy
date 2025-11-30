import { type Message } from "@shared/schema";
import { format } from "date-fns";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAI = message.role === "assistant" || message.role === "ai";
  const content = (message as any).content || (message as any).text || "";
  
  return (
    <div 
      className={`flex ${isAI ? 'justify-start pl-2' : 'justify-end pr-1'} mb-4`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div className="relative group max-w-[85%]">
        <div 
          className={`rounded-2xl px-4 py-3 ${
            isAI 
              ? 'bg-card text-card-foreground shadow-md rounded-tl-sm border' 
              : 'bg-primary text-primary-foreground rounded-tr-sm shadow-md'
          }`}
        >
          <p className="text-base leading-relaxed whitespace-pre-wrap break-words" data-testid={`text-message-content-${message.id}`}>
            {content || "..."}
          </p>
          <p 
            className={`text-xs mt-2 ${
              isAI ? "text-muted-foreground" : "text-primary-foreground/80"
            }`}
            data-testid={`text-timestamp-${message.id}`}
          >
            {message.createdAt ? format(new Date(message.createdAt), 'h:mm a') : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
