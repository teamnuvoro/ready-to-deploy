import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaywallSheet } from "@/components/paywall/PaywallSheet";
import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { VoiceCallButton } from "@/components/chat/VoiceCallButton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const ChatPage = () => {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const userId = localStorage.getItem('userId') || 'dev-user-001';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Get or create session
  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error('Failed to get session');
      return res.json();
    },
  });

  const sessionId = session?.id || 'dev-session-001';

  // ============================================
  // FETCH MESSAGES - AUTO-REFRESH EVERY 500ms
  // ============================================
  const { data: messagesData, isLoading: isMessagesLoading } = useQuery({
    queryKey: ['messages', sessionId],
    queryFn: async () => {
      if (!sessionId) return { messages: [] };
      
      // Try both endpoint formats
      let res = await fetch(`/api/messages/${sessionId}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`/api/messages?sessionId=${sessionId}`);
      }
      
      if (!res || !res.ok) {
        return { messages: [] };
      }

      const data = await res.json();
      return Array.isArray(data) ? { messages: data } : data;
    },
    refetchInterval: 500, // 🔑 CRITICAL: Refetch every 500ms
    refetchIntervalInBackground: true, // Keep refreshing even in background
    staleTime: 0, // Always consider data stale
    gcTime: 300000, // Keep in cache for 5 mins
    enabled: !!sessionId && !isSessionLoading,
    retry: 1,
    retryDelay: 100,
  });

  // Get messages array
  const messages = messagesData?.messages || [];

  // ============================================
  // AUTO-SCROLL TO BOTTOM
  // ============================================
  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Scroll when messages change

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  };

  // ============================================
  // SEND MESSAGE MUTATION - OPTIMISTIC UPDATE
  // ============================================
  const mutation = useMutation({
    mutationFn: async (msg: string) => {
      setError('');
      
      if (!msg.trim() || !userId || !sessionId) {
        throw new Error('Invalid message or user data');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: msg,
          userId,
          sessionId,
        }),
      });

      if (response.status === 402) {
        // Paywall hit
        setError('You\'ve reached your free message limit! Upgrade to continue.');
        setPaywallOpen(true);
        throw new Error('PAYWALL_HIT');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      return response.json();
    },

    // 🔑 OPTIMISTIC UPDATE: Add message immediately
    onMutate: async (newMessage) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: ['messages', sessionId] });

      // Get previous data
      const previousMessages = queryClient.getQueryData(['messages', sessionId]) as any;

      // Update cache with user message immediately
      queryClient.setQueryData(['messages', sessionId], (old: any) => {
        const timestamp = new Date().toISOString();
        return {
          messages: [
            ...(old?.messages || []),
            {
              id: `temp-${Date.now()}`,
              sessionId: sessionId,
              userId: userId,
              role: 'user',
              text: newMessage,
              createdAt: timestamp,
            },
          ],
        };
      });

      setIsTyping(true);

      return { previousMessages }; // Return for rollback if needed
    },

    // On success: Force refetch to get AI response
    onSuccess: (data) => {
      setIsTyping(false);
      setMessage(''); // Clear input
      
      // Immediately refetch messages to get AI response
      queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
      
      // Also manually refetch to ensure we get latest
      queryClient.refetchQueries({ queryKey: ['messages', sessionId] });
    },

    // On error: Rollback optimistic update
    onError: (error: any, _variables, context: any) => {
      setIsTyping(false);
      
      if (error.message === 'PAYWALL_HIT') {
        setError('You\'ve reached your free message limit! Upgrade to continue.');
        // Don't show generic error for paywall
      } else {
        setError(error.message || 'Failed to send message');
        toast({
          title: "Error",
          description: error.message || "Failed to send message",
          variant: "destructive",
        });
      }

      // Rollback to previous state
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', sessionId], context.previousMessages);
      }
    },
  });

  // ============================================
  // HANDLE FORM SUBMISSION
  // ============================================
  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;
    if (isTyping || mutation.isPending) return;
    if (error && error.includes('PAYWALL')) return;

    mutation.mutate(content);
  };

  const isLoading = isSessionLoading || isMessagesLoading;

  // Show Analysis Screen
  if (showAnalysis) {
    return (
      <div className="chat-shell">
        <div className="chat-panel">
          <AnalysisScreen
            aiName="Riya"
            userName={user?.name || "User"}
            onClose={() => setShowAnalysis(false)}
          />
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="chat-shell">
      <div className="chat-panel">
        {/* Header with Analysis Button */}
        <div className="relative z-10">
          <ChatHeader sessionId={sessionId} />
          {/* Analyze Button in header area */}
          <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
            <Button
              onClick={() => setShowAnalysis(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-full"
              size="sm"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze My Type
            </Button>
          </div>
        </div>

        {/* Messages with Enhanced UI */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <ChatMessages
            messages={messages}
            isLoading={isLoading}
            isTyping={isTyping}
            onQuickReply={handleSendMessage}
          />
          <div ref={messagesEndRef} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm animate-fadeIn">
            {error}
          </div>
        )}

        {/* Input Area */}
        <div className="chat-input-shell">
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={mutation.isPending || isTyping || (error && error.includes('PAYWALL'))}
          />
        </div>

        {/* Voice Call Button */}
        <VoiceCallButton disabled={!!error && error.includes('PAYWALL')} />
      </div>

      {/* Paywall Sheet */}
      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        messageCount={0}
      />
    </div>
  );
};

export default ChatPage;
