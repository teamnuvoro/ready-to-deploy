import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Mic } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  isMobile?: boolean;
  quickReplies?: string[];
  onQuickReply?: (reply: string) => void;
}

export function ChatInput({ 
  onSendMessage, 
  isLoading, 
  disabled, 
  isMobile,
  quickReplies = [],
  onQuickReply
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const handleSend = () => {
    if (message.trim() && !isLoading && !disabled) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const handleQuickReply = (reply: string) => {
    if (onQuickReply) {
      onQuickReply(reply);
    } else {
      onSendMessage(reply);
    }
  };

  return (
    <div className={`bg-card border-t ${isMobile ? 'p-2' : 'p-4'}`}>
      {quickReplies.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 overflow-x-auto pb-2">
          {quickReplies.map((reply, index) => (
            <button
              key={index}
              onClick={() => handleQuickReply(reply)}
              disabled={isLoading || disabled}
              className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-full text-xs whitespace-nowrap hover-elevate transition-colors disabled:opacity-50"
              data-testid={`button-quickreply-${index}`}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsRecording(!isRecording)}
          disabled={isLoading || disabled}
          className={`p-3 rounded-full transition ${
            isRecording
              ? "bg-destructive text-destructive-foreground animate-pulse"
              : "bg-muted text-muted-foreground hover-elevate"
          }`}
          data-testid="button-voice-record"
        >
          <Mic className="w-5 h-5" />
        </button>
        
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your message..."
          disabled={isLoading || disabled}
          className="flex-1 rounded-full"
          data-testid="input-chat-message"
        />
        
        <Button
          onClick={handleSend}
          disabled={isLoading || disabled || !message.trim()}
          size="icon"
          className="rounded-full"
          data-testid="button-send-message"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
