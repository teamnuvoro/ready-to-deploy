import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClipboardList, Crown, Loader2, LogOut, BarChart3, History, Settings, Brain, Volume2, VolumeX, Image as ImageIcon, CreditCard, Sparkles, Menu } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatHeaderProps {
  sessionId?: string;
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
  onPaymentClick?: () => void;
  onAnalyzeClick?: () => void;
  userUsage?: {
    messageCount: number;
    callDuration: number;
    premiumUser: boolean;
    messageLimitReached?: boolean;
    callLimitReached?: boolean;
  };
}

export function ChatHeader({ sessionId, voiceModeEnabled, onVoiceModeToggle, onPaymentClick, onAnalyzeClick, userUsage: userUsageProp }: ChatHeaderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const finalUserUsage = userUsageProp || userUsage;

  const endSessionMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session ID");

      const response = await apiRequest("POST", "/api/session/end", {
        sessionId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Session Ended",
        description: "Your conversation summary has been generated",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session"] });

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
      <div className={`h-full flex items-center justify-between ${isMobile ? 'px-3' : 'px-6'}`}>
        {/* Left: Brand */}
        <Link href="/">
          <div className="cursor-pointer">
            <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Riya
            </h1>
          </div>
        </Link>

        {/* Center: Desktop Navigation */}
        {!isMobile && (
          <nav className="hidden md:flex items-center gap-1 bg-secondary/30 p-1 rounded-full border border-secondary">
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full">
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Analytics
              </Button>
            </Link>
            <Link href="/memories">
              <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full">
                <Brain className="h-3.5 w-3.5 mr-1.5" />
                Memories
              </Button>
            </Link>
            <Link href="/call">
              <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Voice Call
              </Button>
            </Link>
          </nav>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              {!finalUserUsage?.premiumUser && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onPaymentClick}
                  className="text-xs h-8"
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                  Upgrade
                </Button>
              )}
              {finalUserUsage?.premiumUser && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-50 border border-yellow-200">
                  <Crown className="h-3.5 w-3.5 text-yellow-600" />
                  <span className="text-xs font-semibold text-yellow-700">Premium</span>
                </div>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onVoiceModeToggle}
                className="h-8 w-8"
                title={voiceModeEnabled ? "Voice mode enabled" : "Voice mode disabled"}
              >
                {voiceModeEnabled ? (
                  <Volume2 className="h-4 w-4 text-pink-600" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>
            </>
          )}

          {/* Mobile Menu */}
          {isMobile ? (
            <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/analytics">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/memories">
                    <Brain className="h-4 w-4 mr-2" />
                    Memories
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/call">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Voice Call
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {!finalUserUsage?.premiumUser && (
                  <DropdownMenuItem onClick={onPaymentClick}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Upgrade to Premium
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
