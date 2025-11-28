import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Heart, Sparkles, Brain, Zap, Moon } from "lucide-react";
import { motion } from "framer-motion";

interface Personality {
    id: string;
    name: string;
    description: string;
    traits: {
        agreeableness: number;
        anger: number;
        empathy: number;
        extroversion: number;
        openness: number;
        conscientiousness: number;
    };
    adjectives: string[];
    sampleQuote: string;
}

const personalityIcons = {
    riya_classic: Heart,
    spicy_meena: Zap,
    thoughtful_anika: Brain,
    energetic_priya: Sparkles,
    mysterious_kavya: Moon,
};

const personalityColors = {
    riya_classic: "from-pink-500 to-purple-500",
    spicy_meena: "from-red-500 to-orange-500",
    thoughtful_anika: "from-blue-500 to-indigo-500",
    energetic_priya: "from-yellow-500 to-pink-500",
    mysterious_kavya: "from-purple-500 to-gray-500",
};

export default function PersonalitySelectionPage() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [personalities, setPersonalities] = useState<Personality[]>([]);
    const [selectedPersonality, setSelectedPersonality] = useState<string | null>(null);
    const [loadingPersonalities, setLoadingPersonalities] = useState(true);

    useEffect(() => {
        fetchPersonalities();
    }, []);

    const fetchPersonalities = async () => {
        try {
            const response = await apiRequest("GET", "/api/personalities");
            const data = await response.json();
            setPersonalities(data.personalities || []);
        } catch (error) {
            console.error("Error fetching personalities:", error);
            toast({
                title: "Error",
                description: "Failed to load personalities. Please refresh.",
                variant: "destructive",
            });
        } finally {
            setLoadingPersonalities(false);
        }
    };

    const handleSelect = (personalityId: string) => {
        setSelectedPersonality(personalityId);
    };

    const handleComplete = async () => {
        if (!selectedPersonality) {
            toast({
                title: "Please Select",
                description: "Please choose a personality before continuing.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            await apiRequest("POST", "/api/user/personality", {
                personalityId: selectedPersonality,
            });

            await queryClient.invalidateQueries({ queryKey: ["/api/user"] });

            toast({
                title: "Personality Selected!",
                description: "Your AI companion is ready to chat.",
            });

            setLocation("/chat");
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save personality. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (loadingPersonalities) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-coral-50 dark:from-gray-900 dark:via-purple-900 dark:to-gray-900 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl space-y-8"
            >
                <div className="text-center space-y-3">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        Choose Your Companion
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Pick the personality that matches your vibe. Each one is unique!
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {personalities.map((personality) => {
                        const Icon = personalityIcons[personality.id as keyof typeof personalityIcons] || Heart;
                        const gradientClass = personalityColors[personality.id as keyof typeof personalityColors] || "from-purple-500 to-pink-500";
                        const isSelected = selectedPersonality === personality.id;

                        return (
                            <motion.div
                                key={personality.id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Card
                                    className={`p-6 cursor-pointer transition-all duration-300 ${
                                        isSelected
                                            ? "border-2 border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20"
                                            : "border hover:border-primary/50 hover:shadow-md"
                                    }`}
                                    onClick={() => handleSelect(personality.id)}
                                >
                                    <div className="space-y-4">
                                        {/* Header */}
                                        <div className="flex items-start justify-between">
                                            <div className={`p-3 rounded-xl bg-gradient-to-br ${gradientClass} text-white`}>
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            {isSelected && (
                                                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Description */}
                                        <div>
                                            <h3 className="text-xl font-bold mb-1">{personality.name}</h3>
                                            <p className="text-sm text-muted-foreground mb-3">
                                                {personality.description}
                                            </p>
                                        </div>

                                        {/* Traits */}
                                        <div className="flex flex-wrap gap-2">
                                            {personality.adjectives.slice(0, 3).map((adj, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
                                                >
                                                    {adj}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Sample Quote */}
                                        <div className="pt-3 border-t">
                                            <p className="text-sm italic text-muted-foreground">
                                                "{personality.sampleQuote}"
                                            </p>
                                        </div>

                                        {/* Trait Bars */}
                                        <div className="space-y-2 pt-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Warmth</span>
                                                <span className="font-semibold">{personality.traits.agreeableness}/10</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Spice</span>
                                                <span className="font-semibold">{personality.traits.anger}/10</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">Energy</span>
                                                <span className="font-semibold">{personality.traits.extroversion}/10</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="flex justify-center pt-4">
                    <Button
                        size="lg"
                        className="w-full md:w-auto px-12"
                        onClick={handleComplete}
                        disabled={isLoading || !selectedPersonality}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Setting up...
                            </>
                        ) : (
                            <>
                                Continue with {personalities.find(p => p.id === selectedPersonality)?.name || "Selection"}
                            </>
                        )}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

