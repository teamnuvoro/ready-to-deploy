import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import {
  ArrowLeft,
  Activity,
  Users,
  BarChart3,
  Target,
  TrendingUp,
  PhoneCall,
  MessageSquare,
} from "lucide-react";

interface AnalyticsResponse {
  engagement: {
    totalUsers: number;
    activeUsers7d: number;
    avgMessagesPerSession: number;
    totalMessages: number;
    voiceCallSessions: number;
    voiceMinutes: number;
  };
  conversion: {
    premiumUsers: number;
    freeToPaidConversion: number;
    planBreakdown: Record<string, number>;
  };
  quality: {
    confidenceScore: number;
  };
}

export default function AnalyticsPage() {
  const { data, isLoading, error, refetch } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/analytics");
      return response.json();
    },
  });

  return (
    <div className="summary-shell">
      <div className="summary-panel">
        <header className="summary-header">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Chat
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.open("https://analytics.amplitude.com/", "_blank")}
            >
              <BarChart3 className="h-4 w-4" />
              Open Amplitude
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.open("https://sentry.io/", "_blank")}
            >
              <Activity className="h-4 w-4" />
              Open Sentry
            </Button>
            <div className="confidence-chip">
              <Activity className="h-4 w-4" />
              <div>
                <p className="text-xs text-muted-foreground">Live Metrics</p>
                <p className="text-sm font-semibold">Product Health</p>
              </div>
            </div>
          </div>
        </header>

        <div className="text-center space-y-2 mt-6 mb-10">
          <h1 className="text-3xl font-bold">Experience Analytics</h1>
          <p className="text-muted-foreground">
            Monitor engagement, conversion, and quality at a glance.
          </p>
        </div>

        {isLoading && (
          <div className="summary-empty">
            <p>Crunching numbers…</p>
          </div>
        )}

        {error && (
          <div className="summary-empty error">
            <p>Unable to load analytics. Please try again.</p>
            {error instanceof Error && (
              <p className="text-xs text-muted-foreground mt-2">
                {error.message}
              </p>
            )}
            <Button onClick={() => refetch()} className="mt-4">Retry</Button>
          </div>
        )}

        {!isLoading && !error && !data && (
          <div className="summary-empty">
            <p>No analytics data available yet.</p>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold mb-4">Engagement</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="insight-card">
                  <div className="card-icon">
                    <Users />
                  </div>
                  <p className="card-kicker">Total Users</p>
                  <p className="card-body text-2xl font-semibold">
                    {data.engagement.totalUsers.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    +{data.engagement.activeUsers7d} active in last 7 days
                  </p>
                </Card>
                <Card className="insight-card">
                  <div className="card-icon">
                    <MessageSquare />
                  </div>
                  <p className="card-kicker">Messages</p>
                  <p className="card-body text-2xl font-semibold">
                    {data.engagement.totalMessages.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.engagement.avgMessagesPerSession} avg per session
                  </p>
                </Card>
                <Card className="insight-card">
                  <div className="card-icon">
                    <PhoneCall />
                  </div>
                  <p className="card-kicker">Voice Calls</p>
                  <p className="card-body text-2xl font-semibold">
                    {data.engagement.voiceCallSessions}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.engagement.voiceMinutes} minutes on call
                  </p>
                </Card>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4">Conversion</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="insight-card">
                  <div className="card-icon">
                    <TrendingUp />
                  </div>
                  <p className="card-kicker">Premium Adoption</p>
                  <p className="card-body text-2xl font-semibold">
                    {data.conversion.freeToPaidConversion}% conversion
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.conversion.premiumUsers} active premium members
                  </p>
                </Card>
                <Card className="insight-card">
                  <div className="card-icon">
                    <BarChart3 />
                  </div>
                  <p className="card-kicker">Plan Mix</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {Object.keys(data.conversion.planBreakdown).length > 0 ? (
                      Object.entries(data.conversion.planBreakdown).map(
                        ([plan, value]) => (
                          <div className="flex justify-between" key={plan}>
                            <span className="text-muted-foreground capitalize">{plan}</span>
                            <span className="font-semibold">{value}</span>
                          </div>
                        ),
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground">No subscriptions yet</p>
                    )}
                  </div>
                </Card>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4">Quality</h2>
              <Card className="insight-card">
                <div className="card-icon">
                  <Target />
                </div>
                <p className="card-kicker">Summary Confidence</p>
                <p className="card-body text-2xl font-semibold">
                  {data.quality.confidenceScore}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Average confidence in your relationship insights.
                </p>
              </Card>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

