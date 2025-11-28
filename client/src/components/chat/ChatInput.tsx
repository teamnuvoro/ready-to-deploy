import { Send, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, type FormEvent } from "react";

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 z-10">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={disabled}
              className="h-12 text-base rounded-full border-2 focus-visible:ring-primary"
              data-testid="input-message"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-12 w-12 rounded-full text-accent hover:text-accent"
            data-testid="button-mic"
          >
            <Mic className="w-5 h-5" />
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || disabled}
            className="h-12 w-12 rounded-full"
            data-testid="button-send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </form>
    </div>
  );
}
