import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { findingsApi } from "../api/findings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";

const severityColors: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-white",
  low: "bg-blue-500 text-white",
  info: "bg-gray-500 text-white",
};

export function FindingsPanel() {
  const { selectedCompanyId } = useCompany();
  const [offset, setOffset] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const limit = 20;

  const params: Record<string, string> = { offset: String(offset), limit: String(limit) };
  if (severityFilter) params.severity = severityFilter;

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.findings(selectedCompanyId!), { offset, limit, severityFilter }],
    queryFn: () => findingsApi.list(selectedCompanyId!, params),
    enabled: !!selectedCompanyId,
  });

  const severities = ["critical", "high", "medium", "low", "info"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Findings</CardTitle>
          <div className="flex gap-1">
            {severities.map((s) => (
              <Button
                key={s}
                variant={severityFilter === s ? "default" : "outline"}
                size="sm"
                className="text-xs capitalize"
                onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading findings...</p>
        ) : data && data.findings.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-md border">
              <div className="grid grid-cols-4 gap-4 p-3 text-sm font-medium text-muted-foreground border-b bg-muted/50">
                <div>Severity</div>
                <div>Title</div>
                <div>Category</div>
                <div>Status</div>
              </div>
              <div className="divide-y">
                {data.findings.map((finding) => (
                  <div key={finding.id} className="grid grid-cols-4 gap-4 p-3 items-center">
                    <div>
                      <Badge className={severityColors[finding.severity] ?? ""}>
                        {finding.severity}
                      </Badge>
                    </div>
                    <div className="font-medium max-w-[300px] truncate">
                      {finding.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {finding.category ?? "—"}
                    </div>
                    <div>
                      {finding.verified ? (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <ShieldCheck className="h-4 w-4" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-600 text-sm">
                          <ShieldAlert className="h-4 w-4" /> Unverified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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
          <div className="flex flex-col items-center gap-2 py-8">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No findings recorded yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
