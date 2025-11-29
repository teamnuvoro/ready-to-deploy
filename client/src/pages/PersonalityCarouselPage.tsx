import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { AICarousel } from "@/components/onboarding/AICarousel";
import { ProfileCreatedScreen } from "@/components/onboarding/ProfileCreatedScreen";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const aiAssistants = [
  {
    id: 1,
    name: "Riya",
    personality: "Empathetic & Caring",
    description: "Your warm companion who truly understands emotions and offers heartfelt advice.",
    image: "https://images.unsplash.com/photo-1758600587728-9bde755354ad?w=800&q=80"
  },
  {
    id: 2,
    name: "Priya",
    personality: "Confident & Motivating",
    description: "A strong presence who encourages you to be your best self in relationships.",
    image: "https://images.unsplash.com/photo-1739303987902-eccc301b09fc?w=800&q=80"
  },
  {
    id: 3,
    name: "Ananya",
    personality: "Elegant & Wise",
    description: "Sophisticated guidance with a touch of class for mature relationship insights.",
    image: "https://images.unsplash.com/photo-1760551937537-a29dbbfab30b?w=800&q=80"
  },
  {
    id: 4,
    name: "Maya",
    personality: "Fun & Adventurous",
    description: "Brings excitement and fresh perspectives to help you enjoy relationship journey.",
    image: "https://images.unsplash.com/photo-1732588958769-fe931aca1ef0?w=800&q=80"
  }
];

export default function PersonalityCarouselPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentScreen, setCurrentScreen] = useState<"select" | "success">("select");
  const [selectedAI, setSelectedAI] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectAI = (id: number) => {
    setSelectedAI(id);
  };

  const handleContinueWithAI = async () => {
    if (!selectedAI) {
      toast({
        title: "Please select an AI",
        description: "Swipe through the carousel to choose your companion",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Map carousel IDs to personality IDs (adjust based on your backend)
      const personalityMap: Record<number, string> = {
        1: "riya-classic",
        2: "priya-confident",
        3: "ananya-elegant",
        4: "maya-playful",
      };

      const personalityId = personalityMap[selectedAI] || "riya-classic";
      
      // Update user personality
      await apiRequest("PATCH", "/api/user/personality", { personalityId });
      
      // Show success screen
      setCurrentScreen("success");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to select personality. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessComplete = () => {
    setLocation("/chat");
  };

  if (currentScreen === "success") {
    return <ProfileCreatedScreen onComplete={handleSuccessComplete} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      {/* Mobile Container */}
      <div className="w-full max-w-[430px] h-screen bg-gradient-to-b from-pink-100 via-purple-100 to-orange-100 flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="text-center pt-12 pb-6 px-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            <h1 className="text-3xl text-gray-800">Choose Your AI Assistant</h1>
          </div>
          <p className="text-gray-600">Swipe to explore different personalities</p>
        </div>

        {/* Carousel */}
        <div className="flex-1 flex items-center">
          <AICarousel 
            assistants={aiAssistants}
            onSelectAI={handleSelectAI}
            selectedAI={selectedAI}
          />
        </div>

        {/* Continue Button */}
        <div className="px-6 pb-8">
          <Button 
            size="lg"
            onClick={handleContinueWithAI}
            disabled={!selectedAI || isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 rounded-full shadow-lg disabled:opacity-50 transition-colors"
          >
            {isLoading 
              ? "Loading..." 
              : `Continue with ${selectedAI ? aiAssistants.find(ai => ai.id === selectedAI)?.name : "AI"}`
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

