import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ChatPage from "@/pages/ChatPage";
import CallPage from "@/pages/CallPage";
import SummaryPage from "@/pages/SummaryPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import PaymentCallback from "@/pages/PaymentCallback";
import HistoryPage from "@/pages/HistoryPage";
import HistoryDetailPage from "@/pages/HistoryDetailPage";
import SettingsPage from "@/pages/SettingsPage";
import MemoriesPage from "@/pages/MemoriesPage";
import GalleryPage from "@/pages/GalleryPage";
import LandingPage from "@/pages/LandingPage";
import OnboardingPage from "@/pages/OnboardingPage";
import PersonalityCarouselPage from "@/pages/PersonalityCarouselPage";

import SignupPage from "@/pages/SignupPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/not-found";

const authDisabled =
  import.meta.env.VITE_DISABLE_AUTH?.toString().toLowerCase() === "true";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (authDisabled) {
    return <Component />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

// Root route component that can use hooks
function RootRoute() {
  const { user } = useAuth();
  
  if (!user) {
    return <LandingPage />;
  }
  
  return <Redirect to="/chat" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/login" component={LoginPage} />

      {/* Onboarding Flow */}
      <Route path="/onboarding">
        {() => <ProtectedRoute component={OnboardingPage} />}
      </Route>
      <Route path="/personality-selection">
        {() => <ProtectedRoute component={PersonalityCarouselPage} />}
      </Route>



      {/* Main App */}
      <Route path="/chat">
        {() => <ProtectedRoute component={ChatPage} />}
      </Route>
      <Route path="/call">
        {() => <ProtectedRoute component={CallPage} />}
      </Route>
      <Route path="/summary">
        {() => <ProtectedRoute component={SummaryPage} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} />}
      </Route>
      <Route path="/memories">
        {() => <ProtectedRoute component={MemoriesPage} />}
      </Route>
      <Route path="/gallery">
        {() => <ProtectedRoute component={GalleryPage} />}
      </Route>

      {/* Legacy/Hidden Routes (kept as requested if useful) */}
      <Route path="/payment/callback">
        {() => <ProtectedRoute component={PaymentCallback} />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={HistoryPage} />}
      </Route>
      <Route path="/history/:id">
        {(params) => <ProtectedRoute component={() => <HistoryDetailPage />} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
