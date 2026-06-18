import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Copy,
  ExternalLink,
  Flag,
} from "lucide-react";
import type { ResearchFinding } from "@paperclipai/shared";

function ConfidenceIcon({ confidence }: { confidence: string }) {
  if (confidence === "high") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (confidence === "medium") return <HelpCircle className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    low: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[confidence] ?? styles.low}`}>
      <ConfidenceIcon confidence={confidence} />
      {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
    </span>
  );
}

interface ResearchFindingsListProps {
  companyId: string;
  sessionId: string;
}

export function ResearchFindingsList({ companyId, sessionId }: ResearchFindingsListProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // First get tasks to show findings per task
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useQuery({
    queryKey: queryKeys.research.tasks(companyId, sessionId),
    queryFn: () => researchApi.listTasks(companyId, sessionId),
    enabled: !!companyId && !!sessionId,
  });

  // Get findings for selected task
  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: selectedTaskId ? queryKeys.research.findings(companyId, selectedTaskId) : ["research", "findings", "none"],
    queryFn: () => {
      if (!selectedTaskId) return Promise.resolve({ items: [], total: 0, limit: 50, offset: 0 });
      return researchApi.listFindings(companyId, selectedTaskId);
    },
    enabled: !!companyId && !!selectedTaskId,
  });

  const findings = findingsData?.items ?? [];

  const markDuplicateMutation = useMutation({
    mutationFn: ({ findingId, duplicateOfId }: { findingId: string; duplicateOfId: string }) =>
      researchApi.markDuplicate(companyId, findingId, { duplicateOfId }),
    onSuccess: () => {
      if (selectedTaskId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.research.findings(companyId, selectedTaskId),
        });
      }
    },
  });

  if (tasksLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (tasksError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
        <p className="text-sm text-red-700 dark:text-red-300">{tasksError.message}</p>
      </div>
    );
  }

  const taskList = tasks ?? [];

  if (taskList.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        message="No tasks available. Create tasks to collect findings."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Task selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Task:</span>
        <select
          value={selectedTaskId ?? ""}
          onChange={(e) => setSelectedTaskId(e.target.value || null)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Select a task...</option>
          {taskList.map((task) => (
            <option key={task.id} value={task.id}>
              {task.sequenceOrder}. {task.title}
            </option>
          ))}
        </select>
      </div>

      {/* Findings */}
      {selectedTaskId && findingsLoading && (
        <PageSkeleton variant="list" />
      )}

      {selectedTaskId && !findingsLoading && findings && findings.length === 0 && (
        <EmptyState
          icon={BookOpen}
          message="No findings for this task yet."
        />
      )}

      {selectedTaskId && findings && findings.length > 0 && (
        <div className="space-y-2">
          {findings.map((finding: ResearchFinding) => (
            <div
              key={finding.id}
              className={`border border-border rounded-lg p-4 space-y-2 ${finding.isDuplicate ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ConfidenceBadge confidence={finding.confidence} />
                  {finding.category && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {finding.category}
                    </span>
                  )}
                  {finding.isDuplicate && (
                    <span className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </span>
                  )}
                </div>
                {finding.reliabilityScore != null && (
                  <div className="text-xs text-muted-foreground">
                    Reliability: {Math.round(finding.reliabilityScore * 100)}%
                  </div>
                )}
              </div>

              <p className="text-sm">{finding.content}</p>

              {finding.sourceUrl && (
                <a
                  href={finding.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {finding.sourceTitle || finding.sourceDomain || finding.sourceUrl}
                </a>
              )}

              {!finding.isDuplicate && (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const duplicateOfId = prompt("Enter the ID of the original finding this duplicates:");
                      if (duplicateOfId) {
                        markDuplicateMutation.mutate({ findingId: finding.id, duplicateOfId });
                      }
                    }}
                  >
                    <Flag className="h-3 w-3 mr-1" />
                    Mark as duplicate
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
