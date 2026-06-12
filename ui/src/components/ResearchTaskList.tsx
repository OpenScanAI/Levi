import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  AlertTriangle,
  SkipForward,
  PlayCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import type { ResearchTask } from "@paperclipai/shared";

function TaskStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "running") return <PlayCircle className="h-4 w-4 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (status === "skipped") return <SkipForward className="h-4 w-4 text-muted-foreground" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    skipped: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      <TaskStatusIcon status={status} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface ResearchTaskListProps {
  companyId: string;
  sessionId: string;
}

export function ResearchTaskList({ companyId, sessionId }: ResearchTaskListProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: queryKeys.research.tasks(companyId, sessionId),
    queryFn: () => researchApi.listTasks(companyId, sessionId),
    enabled: !!companyId && !!sessionId,
  });

  const retryMutation = useMutation({
    mutationFn: (taskId: string) => researchApi.retryTask(companyId, sessionId, taskId),
    onSuccess: () => {
      // Invalidate tasks and session queries to refresh UI
      queryClient.invalidateQueries({ queryKey: queryKeys.research.tasks(companyId, sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.research.session(companyId, sessionId) });
    },
  });

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
        <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
      </div>
    );
  }

  const taskList = tasks ?? [];

  if (taskList.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        message="No tasks for this session yet."
      />
    );
  }

  return (
    <div className="space-y-2">
      {taskList.map((task: ResearchTask) => (
        <div
          key={task.id}
          className="border border-border rounded-lg overflow-hidden"
        >
          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
            onClick={() =>
              setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
            }
          >
            {expandedTaskId === task.id ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {task.sequenceOrder}. {task.title}
                </span>
                <TaskStatusBadge status={task.status} />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {task.status === "failed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    retryMutation.mutate(task.id);
                  }}
                  disabled={retryMutation.isPending && retryMutation.variables === task.id}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${retryMutation.isPending && retryMutation.variables === task.id ? "animate-spin" : ""}`} />
                  Retry
                </Button>
              )}
              {task.reliabilityScore != null && (
                <div className="text-xs text-muted-foreground">
                  Reliability: {Math.round(task.reliabilityScore * 100)}%
                </div>
              )}
            </div>
          </button>

          {expandedTaskId === task.id && (
            <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border">
              {task.findingsSummary && (
                <div className="pt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Findings Summary
                  </h4>
                  <p className="text-sm">{task.findingsSummary}</p>
                </div>
              )}

              {task.sources && task.sources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Sources
                  </h4>
                  <div className="space-y-1">
                    {task.sources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-primary hover:underline truncate"
                      >
                        {source.title || source.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {task.startedAt && (
                  <span>Started: {new Date(task.startedAt).toLocaleDateString()}</span>
                )}
                {task.completedAt && (
                  <span>Completed: {new Date(task.completedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
