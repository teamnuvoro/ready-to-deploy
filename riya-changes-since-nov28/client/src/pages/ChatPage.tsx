import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Message, type Session } from "@shared/schema";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { PaywallSheet } from "@/components/paywall/PaywallSheet";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { CreditCard, ShieldCheck, Sparkles, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { analytics } from "@/lib/analytics";

export default function ChatPage() {
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);

  const { data: session, isLoading: isSessionLoading } = useQuery<Session>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get session");
      return res.json();
    }
  });

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<Message[]>({
    queryKey: ["messages", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const res = await fetch(`/api/messages?sessionId=${session?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  interface UserUsage {
    messageCount: number;
    callDuration: number;
    premiumUser: boolean;
    messageLimitReached: boolean;
    callLimitReached: boolean;
  }

  const { data: userUsage } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/user/usage");
        if (!res.ok) {
          return { messageCount: 0, callDuration: 0, premiumUser: false, messageLimitReached: false, callLimitReached: false };
        }
        return res.json();
      } catch {
        return { messageCount: 0, callDuration: 0, premiumUser: false, messageLimitReached: false, callLimitReached: false };
      }
    },
    staleTime: 30000,
  });

  // Figma design: Hinglish quick replies
  const quickReplies = [
    "Mera current relationship confusing hai",
    "Kaise pata chalega koi mujhe pasand karta hai?",
    "Main kya dhundh raha hoon samajhna chahta hoon",
    "Mujhe dating advice chahiye",
    "Mujhe trust issues ho rahe hain",
    "Kaise pata chalega main relationship ready hoon?"
  ];

  // Only wait for session to load, not usage (which can load in background)
  const isLoading = isSessionLoading;
  const isDev = import.meta.env.MODE === 'development';
  const isLimitReached = !isDev && (userUsage?.messageLimitReached || userUsage?.callLimitReached) && !userUsage?.premiumUser;

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

        if (response.status === 402) {
          setIsTyping(false);
          setPaywallOpen(true);
          queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

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
                  if (session?.id) {
                    queryClient.invalidateQueries({ queryKey: ["/api/messages", session.id] });
                  }
                  queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });

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
    analytics.track("message_sent", {
      length: content.length,
      voiceMode: voiceModeEnabled
    });
    sendMessageMutation.mutate(content);
  };

  const displayMessages = [...messages];

  if (streamingMessage && session) {
    displayMessages.push({
      id: "streaming",
      content: streamingMessage,
      role: "assistant",
      sessionId: session.id,
      createdAt: new Date(),
      isStreaming: true,
    } as any);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen w-full bg-background">
        <ChatHeader sessionId={session?.id} userUsage={userUsage} />
        <div className="flex-1 overflow-hidden flex flex-col gap-4 p-4 md:p-6 pt-20">
          <Skeleton className="h-12 w-3/4 rounded-lg" />
          <Skeleton className="h-12 w-2/3 rounded-lg ml-auto" />
          <Skeleton className="h-12 w-3/4 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isMobile ? 'h-screen' : 'min-h-screen'} w-full bg-background`}>
      <ChatHeader 
        sessionId={session?.id} 
        voiceModeEnabled={voiceModeEnabled}
        onVoiceModeToggle={() => setVoiceModeEnabled(!voiceModeEnabled)}
        onAnalyzeClick={() => setShowAnalysis(true)}
        onPaymentClick={() => setPaywallOpen(true)}
        userUsage={userUsage}
      />

      {showAnalysis ? (
        <AnalysisScreen 
          aiName="Riya"
          userName={user?.name || "User"}
          onClose={() => setShowAnalysis(false)} 
        />
      ) : (
        <>
          <ChatMessages 
            messages={displayMessages} 
            isLoading={isLoading}
            isMobile={isMobile}
          />

          {isLimitReached && (
            <div className={`${isMobile ? 'mx-2 mb-2' : 'mx-6 mb-4'} p-4 rounded-lg bg-amber-50 border border-amber-200`}>
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <span className="font-semibold text-amber-900">Message limit reached</span>
              </div>
              <p className="text-sm text-amber-800 mb-3">Upgrade to premium for unlimited messages</p>
              <Button 
                size="sm" 
                className="w-full"
                onClick={() => setPaywallOpen(true)}
              >
                Upgrade Now
              </Button>
            </div>
          )}

          <div className={isMobile ? 'px-2 pb-2' : 'px-6 pb-6'}>
            <ChatInput 
              onSendMessage={handleSendMessage}
              isLoading={sendMessageMutation.isPending || isTyping}
              disabled={isLimitReached}
              isMobile={isMobile}
              quickReplies={messages.length <= 3 ? quickReplies : []}
            />
          </div>
        </>
      )}

      <PaywallSheet open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}
