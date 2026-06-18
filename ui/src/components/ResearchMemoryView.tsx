import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "./PageSkeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  Clock,
  Save,
  Trash2,
  Key,
  Database,
} from "lucide-react";

interface ResearchMemoryViewProps {
  companyId: string;
  sessionId: string;
}

export function ResearchMemoryView({ companyId, sessionId }: ResearchMemoryViewProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: memory, isLoading, error: loadError } = useQuery({
    queryKey: queryKeys.research.memory(companyId, sessionId),
    queryFn: () => researchApi.getMemory(companyId, sessionId),
    enabled: !!companyId,
  });

  const setMemoryMutation = useMutation({
    mutationFn: () =>
      researchApi.setMemory(companyId, {
        key: newKey.trim(),
        value: newValue,
        sessionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.research.memory(companyId, sessionId),
      });
      setNewKey("");
      setNewValue("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError.message}</p>
      </div>
    );
  }

  const memoryEntries = (memory as Array<{ id: string; key: string; value: unknown; createdAt: string; updatedAt: string }>) ?? [];

  return (
    <div className="space-y-4">
      {/* Add new memory */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Store Memory
        </h3>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/50">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="memory-key">Key</Label>
          <Input
            id="memory-key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="e.g., react-server-components-summary"
            disabled={setMemoryMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="memory-value">Value (JSON or text)</Label>
          <Textarea
            id="memory-value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Store research insights, summaries, or structured data..."
            rows={4}
            disabled={setMemoryMutation.isPending}
          />
        </div>

        <Button
          onClick={() => {
            if (!newKey.trim()) {
              setError("Key is required.");
              return;
            }
            setError(null);
            setMemoryMutation.mutate();
          }}
          disabled={setMemoryMutation.isPending || !newKey.trim()}
        >
          <Save className="h-4 w-4 mr-1.5" />
          {setMemoryMutation.isPending ? "Saving..." : "Save Memory"}
        </Button>
      </div>

      {/* Memory entries */}
      {memoryEntries.length === 0 ? (
        <EmptyState
          icon={Database}
          message="No research memory stored yet."
        />
      ) : (
        <div className="space-y-2">
          {memoryEntries.map((entry: { id: string; key: string; value: unknown; createdAt: string; updatedAt: string }) => (
            <div
              key={entry.id}
              className="border border-border rounded-lg p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{entry.key}</span>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </span>
              </div>

              <div className="bg-muted/50 rounded-md p-3">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-40">
                  {typeof entry.value === "string"
                    ? entry.value
                    : JSON.stringify(entry.value, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
