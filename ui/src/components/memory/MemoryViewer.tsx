import React, { useState, useCallback } from "react";
import { MemorySearch } from "./MemorySearch";
import { MemoryGraph } from "./MemoryGraph";
import { memoryApi, type MemoryItem, type MemorySearchFilters as ApiMemorySearchFilters } from "../../api/memory";
import { useToastActions } from "@/context/ToastContext";

// Local filter shape emitted by MemorySearch component
interface LocalMemorySearchFilters {
  query: string;
  agentRole: string;
  memoryType: string;
  timeRange: "all" | "1h" | "24h" | "7d" | "30d";
  goalId: string;
  from?: string;
  to?: string;
}

export interface MemoryViewerProps {
  companyId: string;
  projectId: string;
  className?: string;
}

export default function MemoryViewer({ companyId, projectId, className }: MemoryViewerProps) {
  const { pushToast } = useToastActions();

  // Filters state
  const [filters, setFilters] = useState<LocalMemorySearchFilters>({
    query: "",
    agentRole: "all",
    memoryType: "all",
    timeRange: "all",
    goalId: "",
  });

  // Results state
  const [results, setResults] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Time range mapping
  const timeRangeToDates = useCallback((range: LocalMemorySearchFilters["timeRange"]): { from?: string; to?: string } => {
    const now = new Date();
    const to = now.toISOString();
    switch (range) {
      case "1h":
        return { from: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), to };
      case "24h":
        return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to };
      case "7d":
        return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), to };
      case "30d":
        return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to };
      default:
        return {};
    }
  }, []);

  // Search handler
  const handleSearch = useCallback(
    async (searchFilters: LocalMemorySearchFilters) => {
      setFilters(searchFilters);
      setIsLoading(true);
      setError(null);

      try {
        const { from, to } = timeRangeToDates(searchFilters.timeRange);

        const apiFilters: ApiMemorySearchFilters = {
          q: searchFilters.query,
          agentRole: searchFilters.agentRole === "all" ? undefined : searchFilters.agentRole,
          memoryType:
            searchFilters.memoryType === "all"
              ? undefined
              : (searchFilters.memoryType as ApiMemorySearchFilters["memoryType"]),
          from,
          to,
        };

        const response = await memoryApi.search(companyId, projectId, apiFilters);
        setResults(response.memories ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed. Please try again.";
        setError(message);
        pushToast({ title: "Search failed", body: message, tone: "error" });
      } finally {
        setIsLoading(false);
      }
    },
    [companyId, projectId, timeRangeToDates, pushToast],
  );

  // Pin handler — optimistic local toggle
  const handlePin = useCallback(
    async (memoryId: string) => {
      const memory = results.find((m) => m.id === memoryId);
      const newPinned = !((memory?.metadata as unknown as Record<string, unknown>)?.["pinned"] === true);

      try {
        await memoryApi.pin(memoryId, { pinned: newPinned });

        setResults((prev) =>
          prev.map((m) =>
            m.id === memoryId
              ? { ...m, metadata: { ...m.metadata, pinned: newPinned } as typeof m.metadata }
              : m,
          ),
        );

        pushToast({ title: newPinned ? "Memory pinned" : "Memory unpinned", tone: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to pin memory.";
        pushToast({ title: "Pin failed", body: message, tone: "error" });
      }
    },
    [results, pushToast],
  );

  // Delete handler — local filter + API call
  const handleDelete = useCallback(
    async (memoryId: string) => {
      if (!window.confirm("Are you sure you want to delete this memory?")) {
        return;
      }

      try {
        await memoryApi.delete(memoryId);

        setResults((prev) => prev.filter((m) => m.id !== memoryId));
        pushToast({ title: "Memory deleted", tone: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete memory.";
        pushToast({ title: "Delete failed", body: message, tone: "error" });
      }
    },
    [pushToast],
  );

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      <MemorySearch
        onSearch={handleSearch}
        isLoading={isLoading}
      />
      <MemoryGraph
        memories={results}
        isLoading={isLoading}
        error={error}
        onPin={handlePin}
        onDelete={handleDelete}
      />
    </div>
  );
}
 (2/2)