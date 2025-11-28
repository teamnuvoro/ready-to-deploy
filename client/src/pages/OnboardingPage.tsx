import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const onboardingSchema = z.object({
    name: z.string().min(2, "Name is required"),
    age: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(18, "Must be 18+")),
    city: z.string().min(2, "City is required"),
    occupation: z.string().min(2, "Occupation is required"),
    relationshipStatus: z.string().min(1, "Please select a status"),
});

export default function OnboardingPage() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof onboardingSchema>>({
        resolver: zodResolver(onboardingSchema),
        defaultValues: {
            name: user?.name || "",
            age: (user?.age?.toString() || "") as any,
            city: user?.city || "",
            occupation: user?.occupation || "",
            relationshipStatus: user?.relationshipStatus || "",
        },
    });

    async function onSubmit(values: z.infer<typeof onboardingSchema>) {
        setIsLoading(true);
        try {
            await apiRequest("PATCH", "/api/user", values);
            await queryClient.invalidateQueries({ queryKey: ["/api/user"] });

            toast({
                title: "Profile Updated",
                description: "Let's start chatting!",
            });

            setLocation("/chat");
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save profile. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md space-y-8"
            >
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold">Tell us about you</h1>
                    <p className="text-muted-foreground">Help Riya get to know you better.</p>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>What should Riya call you?</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Your Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="age"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Age</FormLabel>
                                            <FormControl>
                                                <Input type="number" placeholder="25" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="city"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>City</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Mumbai" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="occupation"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>What do you do?</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Software Engineer, Student, etc." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="relationshipStatus"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Relationship Status</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="single">Single</SelectItem>
                                                <SelectItem value="dating">Dating</SelectItem>
                                                <SelectItem value="complicated">It's Complicated</SelectItem>
                                                <SelectItem value="married">Married</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                    <>
                                        Next Step
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </Form>
                </div>
            </motion.div>
        </div>
    );
}
