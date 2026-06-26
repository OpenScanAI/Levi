import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { bulkOperationsApi } from "@/api/bulk-operations";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/context/ToastContext";
import { Loader2, Play, Pause, Trash2, BarChart3 } from "lucide-react";

interface BulkOperationsPanelProps {
  companyId: string;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    urlKey: string;
  }>;
}

export function BulkOperationsPanel({ companyId, agents }: BulkOperationsPanelProps) {
  const { pushToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === agents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(agents.map((a) => a.id)));
    }
  };

  const bulkMutation = useMutation({
    mutationFn: (action: "enable" | "disable" | "terminate") =>
      bulkOperationsApi.bulkUpdate(companyId, { agentIds: Array.from(selectedIds), action }),
    onSuccess: (data, action) => {
      pushToast({
        title: `Bulk ${action} complete`,
        body: `${data.updated} agents updated`,
        tone: "success",
      });
      setSelectedIds(new Set());
    },
    onError: (err: Error) => {
      pushToast({ title: "Bulk action failed", body: err.message, tone: "error" });
    },
  });

  const compareMutation = useMutation({
    mutationFn: () => bulkOperationsApi.compare(companyId, Array.from(selectedIds)),
    onSuccess: (data) => {
      pushToast({
        title: "Comparison ready",
        body: `${data.length} agents compared`,
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: "Comparison failed", body: err.message, tone: "error" });
    },
  });

  const selectedCount = selectedIds.size;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Bulk Operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {selectedIds.size === agents.length ? "Deselect All" : "Select All"}
          </Button>

          {selectedCount > 0 && (
            <>
              <Badge variant="secondary">{selectedCount} selected</Badge>
              <Separator orientation="vertical" className="h-6" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkMutation.mutate("enable")}
                disabled={bulkMutation.isPending}
              >
                <Play className="h-3 w-3 mr-1" />
                Enable
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkMutation.mutate("disable")}
                disabled={bulkMutation.isPending}
              >
                <Pause className="h-3 w-3 mr-1" />
                Disable
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => bulkMutation.mutate("terminate")}
                disabled={bulkMutation.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Terminate
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => compareMutation.mutate()}
                disabled={compareMutation.isPending}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Compare
              </Button>
            </>
          )}
        </div>

        {/* Agent list with checkboxes */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
              onClick={() => toggleSelect(agent.id)}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(agent.id)}
                onChange={() => toggleSelect(agent.id)}
                className="h-4 w-4"
              />
              <span className="flex-1 font-medium">{agent.name}</span>
              <Badge
                variant={
                  agent.status === "idle"
                    ? "default"
                    : agent.status === "paused"
                      ? "secondary"
                      : agent.status === "terminated"
                        ? "destructive"
                        : "outline"
                }
              >
                {agent.status}
              </Badge>
            </div>
          ))}
        </div>

        {bulkMutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
