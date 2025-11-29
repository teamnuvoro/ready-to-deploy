import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ClipboardList, Crown, Loader2, LogOut, BarChart3, History, Settings, Brain, Volume2, VolumeX, Image as ImageIcon, Phone, CreditCard } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { PaywallSheet } from "@/components/paywall/PaywallSheet";


interface ChatHeaderProps {
  sessionId?: string;
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
  onPaymentClick?: () => void;
  onVoiceCallClick?: () => void;
}

export function ChatHeader({ sessionId, voiceModeEnabled, onVoiceModeToggle, onPaymentClick, onVoiceCallClick }: ChatHeaderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { data: userUsage } = useQuery<{
    messageCount: number;
    callDuration: number;
    premiumUser: boolean;
  }>({
    queryKey: ["/api/user/usage", "header"],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/user/usage", {});
      return response.json();
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session ID");

      const response = await apiRequest("POST", "/api/session/end", {
        sessionId,
      });
      return response.json();
    },
    onSuccess: (data: { success: boolean; summary: any }) => {
      toast({
        title: "Session Ended",
        description: "Your conversation summary has been generated",
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session"] });

      // Navigate to summary page
      setLocation("/summary");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to end session",
        variant: "destructive",
      });
    },
  });

  const handleSummaryClick = () => {
    if (sessionId) {
      endSessionMutation.mutate();
    } else {
      setLocation("/summary");
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout", {});
      logout();
      setLocation("/login");
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out",
      });
    } catch (error) {
      toast({
        title: "Logout Failed",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-b border-purple-100 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto h-full flex items-center justify-between px-4">
        {/* Left: Brand & Personality */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="cursor-pointer flex flex-col">
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Riya
              </h1>
            </div>
          </Link>
        </div>

        {/* Center: Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-secondary/30 p-1 rounded-full border border-secondary">
          <Link href="/analytics">
            <Button variant="ghost" size="sm" className={`text-xs h-8 rounded-full ${useLocation()[0] === '/analytics' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-primary hover:bg-white/50'}`}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Analytics
            </Button>
          </Link>
          <Link href="/memories">
            <Button variant="ghost" size="sm" className={`text-xs h-8 rounded-full ${useLocation()[0] === '/memories' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}>
              <Brain className="h-3.5 w-3.5 mr-1.5" />
              Memories
            </Button>
          </Link>
          <Link href="/gallery">
            <Button variant="ghost" size="sm" className={`text-xs h-8 rounded-full ${useLocation()[0] === '/gallery' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'}`}>
              <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
              Gallery
            </Button>
          </Link>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {userUsage?.premiumUser && (
            <div className="hidden lg:flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium border border-amber-200 mr-2">
              <Crown className="h-3 w-3" />
              <span>Premium</span>
            </div>
          )}

          {/* Voice Call Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onVoiceCallClick) {
                onVoiceCallClick();
              } else {
                setLocation("/call");
              }
            }}
            className="h-8 gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 rounded-full"
            title="Voice Call"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Call</span>
          </Button>

          {/* Payment/Upgrade Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onPaymentClick) {
                onPaymentClick();
              } else {
                setPaywallOpen(true);
              }
            }}
            className="h-8 gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 rounded-full"
            title="Upgrade to Premium"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Upgrade</span>
          </Button>

          {/* Voice Toggle */}
          {onVoiceModeToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onVoiceModeToggle}
              className={`h-8 w-8 rounded-full ${voiceModeEnabled ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
              title={voiceModeEnabled ? "Mute Voice" : "Enable Voice"}
            >
              {voiceModeEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          )}

          {/* Settings */}
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:bg-secondary">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>

          {/* Summary Tracker */}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex h-8 gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 rounded-full"
            onClick={handleSummaryClick}
            disabled={endSessionMutation.isPending}
          >
            {endSessionMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ClipboardList className="w-3 h-3" />
            )}
            <span className="hidden lg:inline">Summary</span>
          </Button>

          {/* Logout */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        messageCount={userUsage?.messageCount || 0}
      />
    </header>
  );
}
