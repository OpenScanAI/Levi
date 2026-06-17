import { useMemo } from "react";
import { Link } from "@/lib/router";
import { Pin, Trash2, Merge, GitCommit, AlertTriangle, Landmark, MessageSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn, relativeTime } from "@/lib/utils";
import { Identity } from "../Identity";
import type { MemoryItem, MemoryType } from "../../api/memory";

export interface MemoryGraphProps {
  memories: MemoryItem[];
  isLoading?: boolean;
  error?: string | null;
  onPin?: (memoryId: string, pinned: boolean) => void;
  onDelete?: (memoryId: string) => void;
  onMerge?: (sourceIds: string[], targetId: string) => void;
  className?: string;
}

const MEMORY_TYPE_CONFIG: Record<
  MemoryType,
  { label: string; icon: typeof GitCommit; colorClass: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }
> = {
  decision: {
    label: "Decision",
    icon: GitCommit,
    colorClass: "border-l-blue-500",
    badgeVariant: "default",
  },
  error: {
    label: "Error",
    icon: AlertTriangle,
    colorClass: "border-l-red-500",
    badgeVariant: "destructive",
  },
  code_change: {
    label: "Code Change",
    icon: GitCommit,
    colorClass: "border-l-emerald-500",
    badgeVariant: "secondary",
  },
  architecture: {
    label: "Architecture",
    icon: Landmark,
    colorClass: "border-l-purple-500",
    badgeVariant: "outline",
  },
  preference: {
    label: "Preference",
    icon: Settings,
    colorClass: "border-l-amber-500",
    badgeVariant: "secondary",
  },
  discussion: {
    label: "Discussion",
    icon: MessageSquare,
    colorClass: "border-l-slate-500",
    badgeVariant: "outline",
  },
};

function MemoryTypeBadge({ type }: { type: MemoryType }) {
  const config = MEMORY_TYPE_CONFIG[type] ?? MEMORY_TYPE_CONFIG.discussion;
  const { icon: Icon, label, badgeVariant } = config;
  return (
    <Badge variant={badgeVariant} className="gap-1 text-[10px] uppercase tracking-wide">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function GoalBreadcrumbs({ ancestry }: { ancestry: string[] }) {
  if (!ancestry || ancestry.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
      {ancestry.map((goal, index) => (
        <span key={`${goal}-${index}`} className="flex items-center gap-1">
          {index > 0 && <span className="text-muted-foreground/50">/</span>}
          <span className="rounded bg-muted px-1 py-0.5 font-mono tabular-nums hover:bg-muted/80 cursor-default">
            {goal}
          </span>
        </span>
      ))}
    </div>
  );
}

function MemoryCard({
  memory,
  onPin,
  onDelete,
  onMerge,
}: {
  memory: MemoryItem;
  onPin?: (memoryId: string, pinned: boolean) => void;
  onDelete?: (memoryId: string) => void;
  onMerge?: (sourceIds: string[], targetId: string) => void;
}) {
  const config = MEMORY_TYPE_CONFIG[memory.metadata.memory_type] ?? MEMORY_TYPE_CONFIG.discussion;
  const { icon: Icon } = config;

  const handlePin = () => {
    onPin?.(memory.id, true);
  };

  const handleDelete = () => {
    onDelete?.(memory.id);
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-l-4 transition-colors hover:bg-muted/30",
        config.colorClass,
      )}
    >
      <CardContent className="p-4">
        {/* Header: type badge + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MemoryTypeBadge type={memory.metadata.memory_type} />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {relativeTime(memory.metadata.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onPin && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handlePin}
                title="Pin memory"
                className="h-6 w-6"
              >
                <Pin className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDelete}
                title="Delete/Flag memory"
                className="h-6 w-6 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="mt-2 text-sm leading-relaxed text-foreground">{memory.content}</p>

        {/* Metadata footer */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Identity
            name={memory.metadata.agent_role}
            initials={memory.metadata.agent_id.slice(0, 2).toUpperCase()}
            size="xs"
          />
          <span className="text-[10px] font-mono text-muted-foreground">
            run:{memory.metadata.run_id.slice(0, 8)}
          </span>
          {memory.relevanceScore !== undefined && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              score: {memory.relevanceScore.toFixed(3)}
            </span>
          )}
        </div>

        {/* Goal ancestry */}
        {memory.metadata.goal_ancestry.length > 0 && (
          <div className="mt-2">
            <GoalBreadcrumbs ancestry={memory.metadata.goal_ancestry} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MemoryGraph({
  memories,
  isLoading = false,
  error,
  onPin,
  onDelete,
  onMerge,
  className,
}: MemoryGraphProps) {
  const groupedByType = useMemo(() => {
    const groups: Record<string, MemoryItem[]> = {};
    for (const memory of memories) {
      const type = memory.metadata.memory_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(memory);
    }
    return groups;
  }, [memories]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-12", className)}>
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
        <p className="mt-3 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed py-12", className)}>
        <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">No memories found.</p>
        <p className="text-xs text-muted-foreground/70">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{memories.length}</span>
        <span>memories</span>
        {Object.entries(groupedByType).map(([type, items]) => {
          const cfg = MEMORY_TYPE_CONFIG[type as MemoryType] ?? MEMORY_TYPE_CONFIG.discussion;
          const { icon: Icon } = cfg;
          return (
            <span key={type} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <Icon className="h-3 w-3" />
              {items.length}
            </span>
          );
        })}
      </div>

      {/* Memory list */}
      <div className="space-y-3">
        {memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            onPin={onPin}
            onDelete={onDelete}
            onMerge={onMerge}
          />
        ))}
      </div>
    </div>
  );
}
