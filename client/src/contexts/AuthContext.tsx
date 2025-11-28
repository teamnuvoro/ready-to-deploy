import { createContext, useContext, ReactNode, useEffect } from "react";
import { analytics } from "@/lib/analytics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type User } from "@shared/schema";

const authDisabled =
  import.meta.env.VITE_DISABLE_AUTH?.toString().toLowerCase() === "true";

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Initialize analytics on mount
  useEffect(() => {
    analytics.initialize();
  }, []);

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) {
        if (res.status === 401) return null;
        return null;
      }
      const data = await res.json();
      return data.user || null;
    },
    staleTime: Infinity,
  });

  // Track user when authenticated
  useEffect(() => {
    if (user) {
      analytics.identifyUser(user.id, {
        name: user.name,
        email: user.email,
        gender: user.gender,
        premium: user.premiumUser,
        persona: user.personalityModel,
        age: user.age,
      });
    }
  }, [user]);

  const login = (userData: User) => {
    queryClient.setQueryData(["/api/auth/session"], { user: userData });
    analytics.track("login_completed", { method: "manual" });
    analytics.identifyUser(userData.id, {
      name: userData.name,
      email: userData.email,
      gender: userData.gender,
      premium: userData.premiumUser,
    });
  };

  const logout = () => {
    analytics.track("logout");
    analytics.reset();
    queryClient.setQueryData(["/api/auth/session"], null);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    queryClient.clear();
  };

  // Handle auth disabled mode
  const effectiveUser = authDisabled && !user ? { id: "dev", name: "Dev User" } as User : user;

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser || null,
        login,
        logout,
        isAuthenticated: !!effectiveUser,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
