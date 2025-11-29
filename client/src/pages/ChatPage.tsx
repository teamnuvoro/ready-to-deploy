import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Message, type Session } from "@shared/schema";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { VoiceCallButton } from "@/components/chat/VoiceCallButton";
import { PaywallSheet } from "@/components/paywall/PaywallSheet";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CreditCard, ShieldCheck, Sparkles } from "lucide-react";

import { analytics } from "@/lib/analytics";

export default function ChatPage() {
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);

  const { data: session, isLoading: isSessionLoading } = useQuery<Session>({
    queryKey: ["session"],
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        // Fallback to Express API if Supabase not configured
        const res = await fetch("/api/session", { method: "POST" });
        if (!res.ok) throw new Error("Failed to get session");
        return res.json();
      }
      
      const res = await fetch(`${supabaseUrl}/functions/v1/get-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ userId: user?.id || "dev-user-001" }),
      });
      
      if (!res.ok) throw new Error("Failed to get session");
      return res.json();
    }
  });

  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<Message[]>({
    queryKey: ["messages", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      if (!supabaseUrl || !supabaseKey || !session?.id) {
        // Fallback to Express API if Supabase not configured
        const res = await fetch(`/api/messages?sessionId=${session?.id}`);
        if (!res.ok) return [];
        return res.json();
      }
      
      const res = await fetch(`${supabaseUrl}/functions/v1/get-messages?sessionId=${session.id}`, {
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
        },
      });
      
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

  const { data: userUsage, isLoading: isUsageLoading } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
  });



  const isLoading = isSessionLoading || isMessagesLoading || isUsageLoading;
  // Bypass limit in development mode
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
        // Use Express API endpoint (simplified MVP)
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            message: content,
            userId: user?.id || "dev-user-001",
            sessionId: session.id 
          }),
          signal: abortControllerRef.current.signal,
        });

        // Handle paywall error
        if (response.status === 402) {
          const data = await response.json();
          throw new Error("PAYWALL_HIT");
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to send message");
        }

        // Get JSON response (non-streaming)
        const data = await response.json();
        return data;

        // Return the response data
        return data;
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
    onSuccess: (data) => {
      setIsTyping(false);
      setStreamingMessage("");
      
      // Invalidate queries to refresh messages and usage
      if (session?.id) {
        queryClient.invalidateQueries({ queryKey: ["messages", session.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
    },
    onError: (error: any) => {
      setIsTyping(false);
      setStreamingMessage("");
      
      // Handle paywall error
      if (error.message === "PAYWALL_HIT") {
        setPaywallOpen(true);
        toast({
          title: "Message Limit Reached",
          description: "You've reached your free message limit! Upgrade to continue chatting.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to send message. Please try again.",
          variant: "destructive",
        });
      }
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
      sessionId: session.id,
      userId: session.userId,
      role: "ai" as const,
      tag: "general" as const,
      text: streamingMessage,
      createdAt: new Date(),
    });
  }

  useEffect(() => {
    if (paywallOpen) {
      analytics.track("paywall_shown", {
        source: isLimitReached ? "limit_reached" : "user_click",
        messageCount: userUsage?.messageCount
      });
    }
  }, [paywallOpen, isLimitReached, userUsage]);

  // Paywall & Limit Logic
  useEffect(() => {
    if (userUsage) {
      // Soft warning at 18 messages
      if (userUsage.messageCount === 18 && !userUsage.premiumUser) {
        toast({
          title: "Almost there...",
          description: "Bas thoda sa reh gaya… free limit khatam hone wali hai.",
          duration: 5000,
        });
      }

      // Hard limit trigger
      if ((userUsage.messageLimitReached || userUsage.callLimitReached) && !userUsage.premiumUser) {
        setPaywallOpen(true);
      }
    }
  }, [userUsage, toast]);



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
        <div className="relative z-10">
          <ChatHeader
            sessionId={session?.id}
            voiceModeEnabled={voiceModeEnabled}
            onVoiceModeToggle={() => setVoiceModeEnabled(!voiceModeEnabled)}
          />
          {/* Hovering "Riya" Animation */}
          <div className="absolute top-4 left-16 pointer-events-none">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {showAnalysis ? (
            <AnalysisScreen
              aiName="Riya"
              userName={user?.name || "User"}
              onClose={() => setShowAnalysis(false)}
            />
          ) : (
            <ChatMessages
              messages={displayMessages}
              isLoading={isLoading}
              streamingMessage={streamingMessage}
              isTyping={isTyping && !streamingMessage}
              quickReplies={[]}
              onQuickReply={handleSendMessage}
            />
          )}
        </div>

        {/* Analyze Button */}
        {!showAnalysis && (
          <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
            <Button
              onClick={() => setShowAnalysis(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-full"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze My Type
            </Button>
          </div>
        )}

        {/* Paywall Banner when locked */}
        {isLimitReached && (
          <div className="bg-destructive/10 border-t border-destructive/20 p-3 text-center animate-in slide-in-from-bottom-5">
            <p className="text-sm font-medium text-destructive mb-2">
              To continue chatting, choose a plan.
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={() => setPaywallOpen(true)}
              className="w-full max-w-xs"
            >
              Unlock Chat
            </Button>
          </div>
        )}

        {/* Sandbox Payment Bar (Only if NOT limit reached to avoid clutter) */}
        {!isLimitReached && (
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
        )}

        <div className="chat-input-shell">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={sendMessageMutation.isPending || isLimitReached}
          />
        </div>
        <VoiceCallButton disabled={isLimitReached} />
      </div>
      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        messageCount={userUsage?.messageCount || 0}
      />
    </div>
  );
}
