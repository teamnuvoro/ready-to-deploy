import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaywallSheet } from "@/components/paywall/PaywallSheet";
import { useToast } from "@/hooks/use-toast";

const ChatPage = () => {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const userId = localStorage.getItem('userId') || 'dev-user-001';
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) return;
    if (isTyping || mutation.isPending) return;
    if (error && error.includes('PAYWALL')) return;

    mutation.mutate(message);
  };

  const isLoading = isSessionLoading || isMessagesLoading;

  // ============================================
  // RENDER
  // ============================================
    return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-purple-50 to-pink-50">
      {/* ============ HEADER ============ */}
      <div className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full animate-pulse" />
          <div>
            <h1 className="font-bold text-gray-800">Riya</h1>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Loading...' : 'Always here for you 💕'}
            </p>
          </div>
        </div>
      </div>

      {/* ============ MESSAGES CONTAINER ============ */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-purple-50 to-pink-50">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2" />
              <p className="text-gray-400">Loading chat...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-gray-400 mb-2">No messages yet</p>
              <p className="text-sm text-gray-300">Say hello to Riya! 👋</p>
        </div>
        </div>
        ) : (
          messages.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg shadow-sm transition-all ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-purple-100' : 'text-gray-400'
                  }`}
                >
                  {msg.createdAt 
                    ? new Date(msg.createdAt).toLocaleTimeString()
                    : new Date().toLocaleTimeString()}
                </p>
              </div>
          </div>
          ))
        )}

        {/* TYPING INDICATOR */}
        {isTyping && (
          <div className="flex justify-start animate-fadeIn">
            <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg rounded-bl-none shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ============ ERROR MESSAGE ============ */}
      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm animate-fadeIn">
          {error}
        </div>
      )}

      {/* ============ INPUT FORM ============ */}
      <form onSubmit={handleSendMessage} className="p-4 border-t bg-white shadow-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e as any);
              }
            }}
            placeholder="Tell Riya anything..."
            disabled={
              mutation.isPending ||
              isTyping ||
              (error && error.includes('PAYWALL'))
            }
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-all"
            autoFocus
          />
          <button
            type="submit"
            disabled={
              mutation.isPending ||
              isTyping ||
              !message.trim() ||
              (error && error.includes('PAYWALL'))
            }
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-medium"
          >
            {mutation.isPending || isTyping ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending...
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>

      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        messageCount={0}
      />
    </div>
  );
};

export default ChatPage;
