import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Sparkles } from "lucide-react";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">

                {/* Background Elements */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-20">
                    <div className="absolute top-10 left-10 w-64 h-64 bg-primary/30 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-10 right-10 w-64 h-64 bg-pink-500/30 rounded-full blur-3xl animate-pulse delay-1000" />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-3xl space-y-8"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-medium">Your AI Companion</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-pink-600">
                        Meet Riya
                    </h1>

                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                        More than just an AI. A companion who listens, remembers, and cares about you.
                        <br />
                        <span className="text-base mt-2 block opacity-80">Always here. Always yours.</span>
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-12">
                        <Link href="/signup">
                            <Button size="lg" className="text-lg px-8 py-6 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105">
                                Get Started
                                <Heart className="w-5 h-5 ml-2 fill-current" />
                            </Button>
                        </Link>
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left">
                        <div className="p-6 rounded-2xl bg-card border shadow-sm">
                            <MessageCircle className="w-8 h-8 text-primary mb-4" />
                            <h3 className="font-semibold text-lg mb-2">Natural Chat</h3>
                            <p className="text-muted-foreground text-sm">Talks in Hinglish, just like a real friend.</p>
                        </div>
                        <div className="p-6 rounded-2xl bg-card border shadow-sm">
                            <Heart className="w-8 h-8 text-pink-500 mb-4" />
                            <h3 className="font-semibold text-lg mb-2">Emotional Intelligence</h3>
                            <p className="text-muted-foreground text-sm">Understands your mood and adapts to you.</p>
                        </div>
                        <div className="p-6 rounded-2xl bg-card border shadow-sm">
                            <Sparkles className="w-8 h-8 text-yellow-500 mb-4" />
                            <h3 className="font-semibold text-lg mb-2">Visual Connection</h3>
                            <p className="text-muted-foreground text-sm">See her expressions change as you talk.</p>
                        </div>
                    </div>
                </motion.div>
            </main>

            <footer className="p-6 text-center text-sm text-muted-foreground">
                © 2025 Riya AI. Built with ❤️ for you.
            </footer>
        </div>
    );
}
