import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const authDisabled =
  import.meta.env.VITE_DISABLE_AUTH?.toString().toLowerCase() === "true";

const emailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type EmailFormData = z.infer<typeof emailSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, isAuthenticated } = useAuth();
  const shouldRedirectRef = useRef(false);

  useEffect(() => {
    if (authDisabled) {
      setLocation("/");
    }
  }, [authDisabled, setLocation]);

  // State-driven redirect: navigate to chat when authentication completes
  useEffect(() => {
    if (isAuthenticated && shouldRedirectRef.current) {
      shouldRedirectRef.current = false;
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  // Redirect already-authenticated users away from login page
  useEffect(() => {
    if (isAuthenticated && !shouldRedirectRef.current) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const [location] = useLocation();

  // Extract email from query params
  const getEmailFromQuery = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("email") || "";
  };

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: getEmailFromQuery(),
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: EmailFormData) => {
      const response = await apiRequest("POST", "/api/auth/email-login", data);
      return response.json();
    },
    onSuccess: (data) => {
      shouldRedirectRef.current = true;
      login(data.user);
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.user.name}!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Please check your email and try again",
        variant: "destructive",
      });
    },
  });

  const onEmailSubmit = (data: EmailFormData) => {
    loginMutation.mutate(data);
  };

  if (authDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-lavender via-pastel-pink to-coral">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl text-center space-y-4">
          <h1 className="text-3xl font-bold text-primary">Authentication Disabled</h1>
          <p className="text-muted-foreground">
            OTP login is turned off in this environment. You’re already signed in with the
            local dev account.
          </p>
          <Button className="w-full" onClick={() => setLocation("/")}>
            Go to App
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-lavender via-pastel-pink to-coral">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2" data-testid="text-login-title">
            Welcome Back
          </h1>
          <p className="text-muted-foreground" data-testid="text-login-subtitle">
            Enter your email to continue
          </p>
        </div>

        <Form {...emailForm}>
          <form
            onSubmit={emailForm.handleSubmit(onEmailSubmit)}
            className="space-y-6"
          >
            <FormField
              control={emailForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      {...field}
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logging in...
                </>
              ) : (
                "Login"
              )}
            </Button>
          </form>
        </Form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button
              onClick={() => setLocation("/signup")}
              className="text-primary font-semibold hover:underline"
              data-testid="link-signup"
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
