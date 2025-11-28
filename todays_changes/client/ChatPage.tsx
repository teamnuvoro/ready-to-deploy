import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Message, type Session } from "@shared/schema";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { VoiceCallButton } from "@/components/chat/VoiceCallButton";
import { PaywallSheet } from "@/components/paywall/PaywallSheet";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CreditCard, ShieldCheck } from "lucide-react";

export default function ChatPage() {
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);

  // Fetch user usage stats
  const { data: userUsage } = useQuery<{
    messageCount: number;
    callDuration: number;
    premiumUser: boolean;
    messageLimitReached: boolean;
    callLimitReached: boolean;
  }>({
    queryKey: ["/api/user/usage"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/user/usage", {});
      return response.json();
    },
    enabled: !!user,
  });

  // Get or create chat session
  const { data: session } = useQuery<Session>({
    queryKey: ["/api/session"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/session", {});
      return response.json();
    },
    enabled: !!user,
  });


  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", session?.id],
    enabled: !!session,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!session) {
        throw new Error("No active session");
      }

      setIsTyping(true);
      setStreamingMessage("");

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, sessionId: session.id }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        // Check if response is JSON (limit exceeded) or streaming
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          if (data.limitExceeded) {
            setIsTyping(false);
            setPaywallOpen(true);
            queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
            return;
          }
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let accumulatedMessage = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            setIsTyping(false);
            setStreamingMessage("");
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  throw new Error(data.error);
                }

                if (data.done) {
                  setIsTyping(false);
                  setStreamingMessage("");
                  queryClient.invalidateQueries({ queryKey: ["/api/messages", session.id] });
                  queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });

                  // Play voice if enabled
                  if (voiceModeEnabled && accumulatedMessage) {
                    try {
                      const response = await fetch("/api/voice/speak", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          text: accumulatedMessage,
                          provider: user?.voiceProvider || "elevenlabs",
                          voiceId: user?.voiceId || "21m00Tcm4TlvDq8ikWAM",
                          apiKey: user?.elevenLabsApiKey
                        }),
                      });
                      if (response.ok) {
                        const blob = await response.blob();
                        const audio = new Audio(URL.createObjectURL(blob));
                        audio.play();
                      }
                    } catch (err) {
                      console.error("Failed to generate speech:", err);
                    }
                  }
                  return;
                }

                if (data.content) {
                  accumulatedMessage += data.content;
                  setStreamingMessage(accumulatedMessage);
                }
              } catch (parseError) {
                console.error("Error parsing SSE data:", parseError);
              }
            }
          }
        }

        if (session) {
          queryClient.invalidateQueries({ queryKey: ["/api/messages", session.id] });
        }
        queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log("Stream aborted by user");
        } else {
          throw error;
        }
      } finally {
        setIsTyping(false);
        setStreamingMessage("");
      }
    },
    onError: (error) => {
      setIsTyping(false);
      setStreamingMessage("");
      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
      console.error("Chat error:", error);
    },
  });

  const handleSendMessage = (content: string) => {
    sendMessageMutation.mutate(content);
  };

  const displayMessages = [...messages];

  if (streamingMessage && session) {
    displayMessages.push({
      id: "streaming",
      sessionId: session.id,
      userId: session.userId,
      role: "ai" as const,
      tag: "general" as const,
      text: streamingMessage,
      createdAt: new Date(),
    });
  }

  if (isLoading) {
    return (
      <div className="chat-shell">
        <div className="chat-panel">
          <ChatHeader />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <div className="chat-panel">
        <ChatHeader
          sessionId={session?.id}
          voiceModeEnabled={voiceModeEnabled}
          onVoiceModeToggle={() => setVoiceModeEnabled(!voiceModeEnabled)}
        />
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <ChatMessages
            messages={displayMessages}
            isLoading={isLoading}
            streamingMessage={streamingMessage}
            isTyping={isTyping && !streamingMessage}
          />
        </div>
        <div className="payment-sandbox-bar">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="cashfree-pulse" />
              Payments
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Secured by Cashfree (Test Mode)
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPaywallOpen(true)}
            className="flex items-center gap-2 shrink-0"
          >
            <CreditCard className="h-4 w-4" />
            Open Payment Sheet
          </Button>
        </div>
        <div className="chat-input-shell">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={sendMessageMutation.isPending}
          />
        </div>
        <VoiceCallButton />
      </div>
      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        messageCount={userUsage?.messageCount || 0}
      />
    </div>
  );
}
