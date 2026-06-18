import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./EmptyState";
import {
  Globe,
  ExternalLink,
  Star,
  MousePointerClick,
  Clock,
} from "lucide-react";
import type { ResearchSource } from "@paperclipai/shared";

interface ResearchSourcesListProps {
  companyId: string;
  sessionId: string;
}

export function ResearchSourcesList({ companyId, sessionId }: ResearchSourcesListProps) {
  const { data: sources, isLoading, error } = useQuery({
    queryKey: queryKeys.research.sources(companyId, sessionId),
    queryFn: () => researchApi.listSources(companyId, sessionId),
    enabled: !!companyId && !!sessionId,
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

  const sourceList = sources ?? [];

  if (sourceList.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        message="No sources collected for this session yet."
      />
    );
  }

  return (
    <div className="space-y-2">
      {sourceList.map((source: ResearchSource) => (
        <div
          key={source.id}
          className="border border-border rounded-lg p-4 space-y-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {source.title || source.url}
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </a>
              {source.domain && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {source.domain}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {source.reliabilityScore != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                Reliability: {Math.round(source.reliabilityScore * 100)}%
              </span>
            )}
            <span className="flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" />
              Accessed {source.accessCount} time{source.accessCount !== 1 ? "s" : ""}
            </span>
            {source.lastAccessedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last: {new Date(source.lastAccessedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
