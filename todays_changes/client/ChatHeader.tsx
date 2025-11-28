import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ClipboardList, Crown, Loader2, LogOut, BarChart3, History, Settings, Brain, Volume2, VolumeX, Image as ImageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { PersonalitySelector } from "./PersonalitySelector";

interface ChatHeaderProps {
  sessionId?: string;
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
}

export function ChatHeader({ sessionId, voiceModeEnabled, onVoiceModeToggle }: ChatHeaderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
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
    <header className="fixed top-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-sm border-b border-border z-50">
      <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="text-header-title">
              Riya
            </h1>
            <p className="text-xs text-muted-foreground">
              Talking as <span className="font-medium">{user?.name || "Guest"}</span>
            </p>
          </div>
          <div 
            className="flex-shrink-0" 
            style={{ 
              display: 'flex', 
              alignItems: 'center',
              minHeight: '32px', // Ensure it has space
            }}
          >
            <PersonalitySelector />
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {userUsage?.premiumUser && (
            <div className="premium-badge-header">
              <Crown className="h-3.5 w-3.5" />
              <span>Premium Active</span>
            </div>
          )}
          <Link href="/analytics">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Button>
          </Link>

          <Link href="/memories">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Memories
            </Button>
          </Link>
          <Link href="/gallery">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Gallery
            </Button>
          </Link>
          {onVoiceModeToggle && (
            <Button
              variant={voiceModeEnabled ? "default" : "ghost"}
              size="sm"
              className="flex items-center gap-2"
              onClick={onVoiceModeToggle}
              title={voiceModeEnabled ? "Mute Voice" : "Enable Voice"}
            >
              {voiceModeEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          )}
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSummaryClick}
            disabled={endSessionMutation.isPending}
            data-testid="button-summary-tracker"
          >
            {endSessionMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ClipboardList className="w-4 h-4" />
            )}
            Summary Tracker
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
