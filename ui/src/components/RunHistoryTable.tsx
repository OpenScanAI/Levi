import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { agentRunsApi } from "../api/agent-runs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, CheckCircle, XCircle, Clock } from "lucide-react";

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Play,
  paused: Pause,
  succeeded: CheckCircle,
  failed: XCircle,
  pending: Clock,
};

const statusColors: Record<string, string> = {
  running: "bg-blue-100 text-blue-800",
  paused: "bg-yellow-100 text-yellow-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-gray-100 text-gray-800",
};

export function RunHistoryTable() {
  const { selectedCompanyId } = useCompany();
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.agentRuns(selectedCompanyId!), { offset, limit }],
    queryFn: () =>
      agentRunsApi.list(selectedCompanyId!, { offset: String(offset), limit: String(limit) }),
    enabled: !!selectedCompanyId,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Run History</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        ) : data && data.runs.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-md border">
              <div className="grid grid-cols-4 gap-4 p-3 text-sm font-medium text-muted-foreground border-b bg-muted/50">
                <div>Status</div>
                <div>Agent</div>
                <div>Started</div>
                <div>Finished</div>
              </div>
              <div className="divide-y">
                {data.runs.map((run) => {
                  const Icon = statusIcons[run.status] ?? Clock;
                  return (
                    <div key={run.id} className="grid grid-cols-4 gap-4 p-3 items-center">
                      <div>
                        <Badge variant="secondary" className={statusColors[run.status] ?? ""}>
                          <Icon className="h-3 w-3 mr-1" />
                          {run.status}
                        </Badge>
                      </div>
                      <div className="font-medium truncate">{run.agentId}</div>
                      <div className="text-sm text-muted-foreground">
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= data.total}
                onClick={() => setOffset((o) => o + limit)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
