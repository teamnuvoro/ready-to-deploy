import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";

interface Personality {
  id: string;
  name: string;
  description: string;
  adjectives: string[];
}

export function PersonalitySelector() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isChanging, setIsChanging] = useState(false);

  // Debug: Log when component mounts - use useEffect to ensure it logs
  useEffect(() => {
    console.log("[PersonalitySelector] ✅ Component MOUNTED and rendering!");
    console.log("[PersonalitySelector] User:", user?.id || "No user");
  }, [user]);

  // Fetch all available personalities - ALWAYS fetch, no conditions
  const { data: personalitiesData, isLoading: isLoadingPersonalities, error: personalitiesError } = useQuery<{ personalities: Personality[] }>({
    queryKey: ["/api/personalities"],
    queryFn: async () => {
      console.log("[PersonalitySelector] Fetching personalities from /api/personalities");
      try {
        const response = await apiRequest("GET", "/api/personalities");
        const data = await response.json();
        console.log("[PersonalitySelector] Got personalities:", data);
        return data;
      } catch (error) {
        console.error("[PersonalitySelector] Error fetching personalities:", error);
        throw error;
      }
    },
    retry: 1,
    enabled: true, // Always enabled
  });

  // Fetch current user's personality
  const { data: currentPersonality, isLoading: isLoadingCurrent } = useQuery<{ personality: Personality }>({
    queryKey: ["/api/user/personality"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/user/personality");
      return response.json();
    },
    enabled: !!user,
    retry: 1,
  });

  const updatePersonalityMutation = useMutation({
    mutationFn: async (personalityId: string) => {
      const response = await apiRequest("POST", "/api/user/personality", {
        personalityId,
      });
      return response.json();
    },
    onMutate: () => {
      setIsChanging(true);
    },
    onSuccess: (data, personalityId) => {
      toast({
        title: "Personality Changed",
        description: `Switched to ${data.personality?.name || personalityId}. Your conversations will now reflect this personality!`,
      });
      // Invalidate auth query to refresh user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/personality"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Change Personality",
        description: error.message || "Could not update personality. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsChanging(false);
    },
  });

  const personalities = personalitiesData?.personalities || [];
  const selectedPersonalityId = currentPersonality?.personality?.id || user?.personalityModel || "riya_classic";

  // Find the selected personality for display
  const selectedPersonality = personalities.find(p => p.id === selectedPersonalityId);
  const displayName = selectedPersonality?.name || "Riya Classic";
  
  // Ensure the selected personality ID exists in the personalities list
  const validSelectedId = personalities.length > 0 && personalities.some(p => p.id === selectedPersonalityId) 
    ? selectedPersonalityId 
    : "riya_classic";

  const handlePersonalityChange = (personalityId: string) => {
    if (personalityId === validSelectedId) {
      return; // No change needed
    }
    updatePersonalityMutation.mutate(personalityId);
  };

  // Debug logging
  console.log("[PersonalitySelector] Render:", {
    isLoadingPersonalities,
    personalitiesError,
    personalitiesCount: personalities.length,
    selectedPersonalityId,
    displayName,
    validSelectedId,
    hasUser: !!user,
  });

  // Always show the selector, even if loading or no data
  // Show loading state or fallback to default
  const containerStyle = { 
    minWidth: '180px', 
    visibility: 'visible' as const, 
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '4px 8px',
    borderRadius: '6px',
    border: '2px solid rgb(147, 51, 234)', // Bright purple border
    backgroundColor: 'rgba(147, 51, 234, 0.15)', // Visible purple background
    boxShadow: '0 2px 4px rgba(147, 51, 234, 0.2)',
  };

  if (isLoadingPersonalities) {
    return (
      <div className="flex items-center gap-2" style={containerStyle} data-testid="personality-selector-loading">
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <Select disabled>
          <SelectTrigger className="w-[140px] h-7 text-xs bg-background border border-border">
            <SelectValue placeholder="Loading..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  // If error or no personalities, show a basic selector with default
  // But still make it functional if we have at least the default
  if (personalitiesError || personalities.length === 0) {
    console.warn("[PersonalitySelector] ⚠️ No personalities loaded, showing fallback", {
      error: personalitiesError,
      count: personalities.length,
    });
    return (
      <div className="flex items-center gap-2" style={containerStyle} data-testid="personality-selector-error">
        <Sparkles className="h-4 w-4 text-primary" />
        <Select value="riya_classic" disabled>
          <SelectTrigger className="w-[140px] h-7 text-xs bg-background border border-border">
            <SelectValue placeholder="Riya Classic (Default)" />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  return (
    <div 
      className="flex items-center gap-2 rounded-md px-2 py-1" 
      style={{ 
        minWidth: '180px', 
        visibility: 'visible' as const, 
        display: 'flex' as const,
        alignItems: 'center' as const,
        border: '2px solid rgb(147, 51, 234)', // Bright purple border
        backgroundColor: 'rgba(147, 51, 234, 0.15)', // Visible purple background
        boxShadow: '0 2px 4px rgba(147, 51, 234, 0.2)',
      }}
      data-testid="personality-selector"
    >
      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
      <Select
        value={validSelectedId}
        onValueChange={handlePersonalityChange}
        disabled={isChanging || updatePersonalityMutation.isPending}
      >
        <SelectTrigger className="w-[140px] h-7 text-xs bg-background border border-border hover:bg-accent">
          {isChanging || updatePersonalityMutation.isPending ? (
            <div className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Changing...</span>
            </div>
          ) : (
            <SelectValue placeholder="Select Personality" />
          )}
        </SelectTrigger>
        <SelectContent className="w-[280px]">
          {personalities.map((personality) => (
            <SelectItem 
              key={personality.id} 
              value={personality.id}
              textValue={personality.name}
              className="py-2 cursor-pointer"
            >
              <div className="flex flex-col items-start gap-1 w-full">
                <span className="font-medium text-sm">{personality.name}</span>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {personality.description}
                </span>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {personality.adjectives.slice(0, 3).map((adj, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
                    >
                      {adj}
                    </span>
                  ))}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

