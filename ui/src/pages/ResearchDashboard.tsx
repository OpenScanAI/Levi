import { useState, useEffect } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { MetricCard } from "../components/MetricCard";
import { CreateSessionDialog } from "../components/CreateSessionDialog";
import { Button } from "@/components/ui/button";
import { FlaskConical, BookOpen, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import type { ResearchSessionListItem } from "@paperclipai/shared";

function SessionStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "running") return <Clock className="h-4 w-4 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (status === "paused") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    planning: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.planning}`}>
      <SessionStatusIcon status={status} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function ResearchDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Research" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.research.dashboard(selectedCompanyId!),
    queryFn: () => researchApi.dashboard(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: sessionsData } = useQuery({
    queryKey: [...queryKeys.research.sessions(selectedCompanyId!), { limit: 5 }],
    queryFn: () => researchApi.listSessions(selectedCompanyId!, { limit: 5 }),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={FlaskConical}
        message="Select a company to view research sessions."
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const totalSessions = data?.sessions?.total ?? 0;
  const activeSessions = data?.sessions?.byStatus?.running ?? 0;
  const completedSessions = data?.sessions?.byStatus?.completed ?? 0;
  const totalFindings = data?.findings?.total ?? 0;
  const totalSources = data?.sources?.total ?? 0;
  const recentSessions = sessionsData?.items ?? [];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
          <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <MetricCard
          icon={FlaskConical}
          value={totalSessions}
          label="Total Sessions"
          to="/research/sessions"
        />
        <MetricCard
          icon={Clock}
          value={activeSessions}
          label="Active"
          to="/research/sessions"
        />
        <MetricCard
          icon={BookOpen}
          value={totalFindings}
          label="Findings"
          to="/research/sessions"
        />
        <MetricCard
          icon={CheckCircle}
          value={totalSources}
          label="Sources"
          to="/research/sessions"
        />
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Sessions
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/research/sessions">View all</Link>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <FlaskConical className="h-4 w-4 mr-1.5" />
              New Session
            </Button>
          </div>
        </div>

        {recentSessions.length === 0 ? (
          <div className="border border-border rounded-lg p-6">
            <EmptyState
              icon={FlaskConical}
              message="No research sessions yet. Create your first session to get started."
            />
          </div>
        ) : (
          <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
            {recentSessions.map((session: ResearchSessionListItem) => (
              <Link
                key={session.id}
                to={`/research/sessions/${session.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors no-underline text-inherit"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{session.title}</span>
                    <SessionStatusBadge status={session.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{session.query}</p>
                </div>
                <div className="text-xs text-muted-foreground shrink-0 ml-4">
                  {new Date(session.updatedAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <CreateSessionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
