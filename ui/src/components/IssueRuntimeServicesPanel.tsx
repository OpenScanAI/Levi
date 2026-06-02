import type { IssueWorkProduct } from "@paperclipai/shared";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Activity, Server, Globe } from "lucide-react";
import { workProductsApi } from "../api/work-products";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type IssueRuntimeServicesPanelProps = {
  issueId: string;
  hasLiveRuns: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isRuntimeWorkProduct(wp: IssueWorkProduct) {
  return wp.type === "preview_url" || wp.type === "runtime_service";
}

function healthDotClass(health: IssueWorkProduct["healthStatus"]) {
  switch (health) {
    case "healthy":
      return "bg-emerald-500";
    case "unhealthy":
      return "bg-red-500";
    default:
      return "bg-amber-400";
  }
}

function healthLabel(health: IssueWorkProduct["healthStatus"]) {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "unhealthy":
      return "Unhealthy";
    default:
      return "Unknown";
  }
}

function statusBadgeClass(status: IssueWorkProduct["status"]) {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-600";
    case "draft":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600";
    case "ready_for_review":
      return "border-blue-500/30 bg-blue-500/10 text-blue-600";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function runtimeProviderLabel(wp: IssueWorkProduct) {
  const meta = wp.metadata as Record<string, unknown> | null;
  const provider = meta?.provider as string | undefined;
  const serviceType = meta?.serviceType as string | undefined;
  if (provider && serviceType) return `${provider} · ${serviceType}`;
  if (provider) return provider;
  if (serviceType) return serviceType;
  if (wp.type === "preview_url") return "Preview";
  return "Runtime";
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function WorkProductCard({ wp }: { wp: IssueWorkProduct }) {
  const url = wp.url;
  const title = wp.title || url || "Untitled service";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3 hover:bg-accent/30 transition-colors">
      <div className="mt-0.5 shrink-0">
        {wp.type === "preview_url" ? (
          <Globe className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Server className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              statusBadgeClass(wp.status),
            )}
          >
            {wp.status}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              className={cn("h-2 w-2 rounded-full", healthDotClass(wp.healthStatus))}
              title={healthLabel(wp.healthStatus)}
            />
            {healthLabel(wp.healthStatus)}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {runtimeProviderLabel(wp)}
          </span>
        </div>

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export function IssueRuntimeServicesPanel({
  issueId,
  hasLiveRuns,
}: IssueRuntimeServicesPanelProps) {
  const { data: workProducts, isLoading } = useQuery({
    queryKey: queryKeys.issues.workProducts(issueId),
    queryFn: () => workProductsApi.listForIssue(issueId),
    refetchInterval: hasLiveRuns ? 5000 : 30000,
    staleTime: hasLiveRuns ? 2000 : 10000,
  });

  const runtimeProducts = workProducts?.filter(isRuntimeWorkProduct) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-16 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (runtimeProducts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        Runtime services
      </h3>
      <div className="space-y-2">
        {runtimeProducts.map((wp) => (
          <WorkProductCard key={wp.id} wp={wp} />
        ))}
      </div>
    </div>
  );
}
