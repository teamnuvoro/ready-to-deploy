import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AICarousel } from "@/components/onboarding/AICarousel";
import { ProfileCreatedScreen } from "@/components/onboarding/ProfileCreatedScreen";
import { Loader2, ArrowRight, Phone, User, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Step = "info" | "otp" | "persona" | "success";

const aiAssistants = [
  {
    id: 1,
    name: "Riya",
    personality: "Sweet & Supportive",
    description: "Your warm companion who truly understands emotions and offers heartfelt advice.",
    image: "https://images.unsplash.com/photo-1758600587728-9bde755354ad?w=800&q=80",
    personalityId: "sweet_supportive",
  },
  {
    id: 2,
    name: "Meera",
    personality: "Playful & Flirty",
    description: "A fun presence who brings excitement and joy to your conversations.",
    image: "https://images.unsplash.com/photo-1739303987902-eccc301b09fc?w=800&q=80",
    personalityId: "playful_flirty",
  },
  {
    id: 3,
    name: "Aisha",
    personality: "Bold & Confident",
    description: "Strong and motivating, encourages you to be your best self.",
    image: "https://images.unsplash.com/photo-1760551937537-a29dbbfab30b?w=800&q=80",
    personalityId: "bold_confident",
  },
  {
    id: 4,
    name: "Kavya",
    personality: "Calm & Mature",
    description: "Sophisticated guidance with wisdom for mature relationship insights.",
    image: "https://images.unsplash.com/photo-1732588958769-fe931aca1ef0?w=800&q=80",
    personalityId: "calm_mature",
  },
];

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [isLoading, setIsLoading] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    gender: "",
  });
  const [otp, setOtp] = useState("");
  const [selectedAI, setSelectedAI] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1: Submit info and send OTP
  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.gender) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/signup", {
        name: formData.name,
        phone: formData.phone,
        gender: formData.gender,
      });
      
      const data = await response.json();
      
      if (data.success) {
        setUserId(data.userId);
        
        // Show OTP in dev mode
        if (data.otp) {
          toast({
            title: "OTP Sent",
            description: `OTP: ${data.otp} (Dev mode - expires in 10 minutes)`,
          });
        } else {
          toast({
            title: "OTP Sent",
            description: "Check your phone for the 6-digit code",
          });
        }
        
        setStep("otp");
      } else {
        throw new Error(data.error || "Failed to send OTP");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (otp.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "Please enter a 6-digit OTP",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/verify-otp", {
        phone: formData.phone,
        otp,
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store user data
        localStorage.setItem("userId", data.user.id);
        localStorage.setItem("token", data.token);
        localStorage.setItem("userName", formData.name);
        setUserId(data.user.id);
        
        toast({
          title: "Verified!",
          description: "OTP verified successfully",
        });
        
        setStep("persona");
      } else {
        throw new Error(data.error || "Invalid OTP");
      }
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Select persona and create session
  const handleSelectPersona = async () => {
    if (!selectedAI) {
      toast({
        title: "Please Select",
        description: "Swipe through to choose your companion",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const selectedAssistant = aiAssistants.find((ai) => ai.id === selectedAI);
      if (!selectedAssistant) throw new Error("Invalid selection");

      // Update user personality
      await apiRequest("PATCH", "/api/user/personality", {
        personalityId: selectedAssistant.personalityId,
      });

      // Create new session
      const currentUserId = userId || localStorage.getItem("userId") || "dev-user-001";
      const sessionResponse = await apiRequest("POST", "/api/session", {
        userId: currentUserId,
      });
      
      const sessionData = await sessionResponse.json();
      
      // Store session ID
      if (sessionData.id) {
        localStorage.setItem("sessionId", sessionData.id);
      }

      setStep("success");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set up your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccessComplete = () => {
    setLocation("/chat");
  };

  // Success Screen
  if (step === "success") {
    return <ProfileCreatedScreen onComplete={handleSuccessComplete} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Step 1: Info */}
          {step === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white rounded-2xl shadow-2xl p-8"
            >
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome to Riya</h1>
                <p className="text-gray-500">Your AI companion awaits 💕</p>
              </div>

              <form onSubmit={handleInfoSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="inline w-4 h-4 mr-2" />
                    Your Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Enter your name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Phone className="inline w-4 h-4 mr-2" />
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    placeholder="+91 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white rounded-2xl shadow-2xl p-8"
            >
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Enter OTP</h1>
                <p className="text-gray-500">
                  We sent a 6-digit code to <br />
                  <strong>{formData.phone}</strong>
                </p>
              </div>

              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <Input
                  type="text"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                />

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  size="lg"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("info")}
                  disabled={isLoading}
                >
                  Change Phone Number
                </Button>
              </form>
            </motion.div>
          )}

          {/* Step 3: Persona Selection */}
          {step === "persona" && (
            <motion.div
              key="persona"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                  <h1 className="text-2xl font-bold text-gray-800">Choose Your Companion</h1>
                </div>
                <p className="text-gray-600 text-sm">Swipe to explore different personalities</p>
              </div>

              <div className="mb-6" style={{ height: "500px" }}>
                <AICarousel
                  assistants={aiAssistants}
                  onSelectAI={setSelectedAI}
                  selectedAI={selectedAI}
                />
              </div>

              <Button
                onClick={handleSelectPersona}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full py-6"
                size="lg"
                disabled={!selectedAI || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `Continue with ${selectedAI ? aiAssistants.find((ai) => ai.id === selectedAI)?.name : "AI"}`
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
