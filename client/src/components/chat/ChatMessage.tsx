import { type Message } from "@shared/schema";
import { format } from "date-fns";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAI = message.role === "ai";
  
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
      </div>
    </div>
  );
}
