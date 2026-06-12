import { useState } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock, CheckCircle, AlertTriangle, Trash2, XCircle } from "lucide-react";
import type { ResearchSessionListItem } from "@paperclipai/shared";
import { useEffect } from "react";

function SessionStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "cancelled") return <XCircle className="h-4 w-4 text-orange-500" />;
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
    cancelled: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.planning}`}>
      <SessionStatusIcon status={status} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function ResearchSessions() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Research", href: "/research" }, { label: "Sessions" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.research.sessions(selectedCompanyId!), { status: statusFilter || "all" }],
    queryFn: () => researchApi.listSessions(selectedCompanyId!, {
      status: statusFilter || undefined,
      limit: 50,
    }),
    enabled: !!selectedCompanyId,
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => researchApi.deleteSession(selectedCompanyId!, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.sessions(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.research.dashboard(selectedCompanyId!) });
    },
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
    return <PageSkeleton variant="list" />;
  }

  const sessions = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
          <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Research Sessions</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All statuses</option>
            <option value="planning">Planning</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="border border-border rounded-lg">
          <EmptyState
            icon={FlaskConical}
            message={statusFilter ? `No sessions with status "${statusFilter}".` : "No research sessions yet."}
          />
        </div>
      ) : (
        <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
          {sessions.map((session: ResearchSessionListItem) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <Link
                to={`/research/sessions/${session.id}`}
                className="flex items-center gap-3 min-w-0 flex-1 no-underline text-inherit"
              >
                <SessionStatusIcon status={session.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{session.title}</span>
                    <SessionStatusBadge status={session.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{session.query}</p>
                </div>
              </Link>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <div className="text-xs text-muted-foreground">
                  {session.progressPercent > 0 && (
                    <span className="mr-2">{session.progressPercent}%</span>
                  )}
                  {new Date(session.updatedAt).toLocaleDateString()}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm("Delete this research session?")) {
                      deleteMutation.mutate(session.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total count */}
      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sessions.length} of {total} sessions
        </p>
      )}
    </div>
  );
}
