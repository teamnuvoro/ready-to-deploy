import { useState, useRef, useEffect } from "react";
import { type Message } from "@shared/schema";
import { ChatMessage } from "./ChatMessage";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
  isMobile?: boolean;
}

export function ChatMessages({ messages, isLoading, isMobile }: ChatMessagesProps) {
  const [showTip, setShowTip] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const dailyTip = {
    title: "Today's Relationship Tip",
    text: "Active listening is crucial - don't just focus on replying, try to truly understand. Show empathy and validate feelings."
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-16 pb-4 px-3' : 'pt-16 pb-4 px-6'} bg-gradient-to-b from-secondary/20 to-background relative`}>
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20c0-5.523 4.477-10 10-10s10 4.477 10 10c0 1.567-.362 3.047-1.006 4.365l8.485 8.485C49.047 32.362 50.527 32 52.092 32c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.565 0-3.045-.362-4.363-1.006l-8.485 8.485C39.638 60.953 40 62.433 40 64c0 5.523-4.477 10-10 10s-10-4.477-10-10c0-1.567.362-3.047 1.006-4.365l-8.485-8.485C11.047 51.638 9.567 52 8.002 52c-5.523 0-10-4.477-10-10s4.477-10 10-10c1.565 0 3.045.362 4.363 1.006l8.485-8.485C20.362 23.047 20 21.567 20 20z' fill='%23a855f7' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundSize: '80px 80px',
          transform: 'rotate(-15deg) scale(1.5)',
          transformOrigin: 'center'
        }} />
      </div>
      
      <div className="max-w-4xl mx-auto space-y-3 relative z-10">
        {showTip && messages.length === 0 && (
          <div className="mb-4 bg-gradient-to-r from-secondary/50 to-primary/10 rounded-xl p-4 border border-primary/20">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="text-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-primary">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                </span>
                {dailyTip.title}
              </h3>
              <button
                onClick={() => setShowTip(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
                data-testid="button-close-tip"
              >
                x
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{dailyTip.text}</p>
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-12 w-3/4 rounded-lg" />
            <Skeleton className="h-12 w-2/3 rounded-lg ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center mb-4">
              <span className="text-2xl text-white">Hi</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Start a conversation with Riya</h3>
            <p className="text-muted-foreground text-sm">Ask me anything about relationships, dating, or just chat!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
