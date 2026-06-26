import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  stuck: number;
}

interface FindingsSummaryItem {
  severity: "critical" | "high" | "medium" | "low" | "info";
  count: number;
  verified: number;
  unverified: number;
}

interface LiveTelemetryPanelProps {
  runStats?: RunStats;
  findingsSummary?: FindingsSummaryItem[];
}

export function LiveTelemetryPanel({ runStats, findingsSummary }: LiveTelemetryPanelProps) {
  const severityColors: Record<string, string> = {
    critical: "bg-red-600",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
    info: "bg-gray-500",
  };

  const totalFindings = useMemo(
    () => findingsSummary?.reduce((sum, f) => sum + f.count, 0) ?? 0,
    [findingsSummary]
  );
  const verifiedFindings = useMemo(
    () => findingsSummary?.reduce((sum, f) => sum + f.verified, 0) ?? 0,
    [findingsSummary]
  );

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total Runs" value={runStats?.total ?? 0} color="text-blue-600" />
        <StatCard icon={CheckCircle} label="Succeeded" value={runStats?.succeeded ?? 0} color="text-green-600" />
        <StatCard icon={XCircle} label="Failed" value={runStats?.failed ?? 0} color="text-red-600" />
        <StatCard icon={Clock} label="Running" value={runStats?.running ?? 0} color="text-yellow-600" />
      </div>

      {/* Stuck Agents Warning */}
      {(runStats?.stuck ?? 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">{runStats!.stuck} agent(s) stuck</p>
            <p className="text-sm text-red-600">Agents have been running longer than expected.</p>
          </div>
        </div>
      )}

      {/* Findings Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium">Findings Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {findingsSummary && findingsSummary.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-2xl font-bold">{totalFindings}</div>
                <div className="text-sm text-muted-foreground">total findings</div>
                <div className="ml-auto flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    {verifiedFindings} verified
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                    {totalFindings - verifiedFindings} unverified
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {findingsSummary.map((item) => (
                  <div key={item.severity} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${severityColors[item.severity]}`} />
                    <span className="w-20 text-sm capitalize">{item.severity}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${severityColors[item.severity]} transition-all`}
                        style={{
                          width: `${totalFindings > 0 ? (item.count / totalFindings) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No findings recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
