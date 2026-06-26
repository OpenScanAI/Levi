import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { LiveTelemetryPanel } from "../components/LiveTelemetryPanel";
import { RunHistoryTable } from "../components/RunHistoryTable";
import { FindingsPanel } from "../components/FindingsPanel";
import { ReportsPanel } from "../components/ReportsPanel";
import { NotificationsConfigPanel } from "../components/NotificationsConfigPanel";
import { BulkImportPanel } from "../components/BulkImportPanel";
import { BulkOperationsPanel } from "../components/BulkOperationsPanel";
import { agentRunsApi } from "../api/agent-runs";
import { findingsApi } from "../api/findings";
import { reportsApi } from "../api/reports";
import { notificationsApi } from "../api/notifications";
import { agentsApi } from "../api/agents";

export function AgentActivityDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [activeTab, setActiveTab] = useState<"telemetry" | "runs" | "findings" | "reports" | "notifications" | "bulk">("telemetry");

  useEffect(() => {
    setBreadcrumbs([{ label: "Agent Activity" }]);
  }, [setBreadcrumbs]);

  const { data: runStats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.agentRuns(selectedCompanyId!),
    queryFn: () => agentRunsApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: findingsSummary, isLoading: findingsLoading } = useQuery({
    queryKey: [...queryKeys.findings(selectedCompanyId!), "summary"],
    queryFn: () => findingsApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery({
    queryKey: queryKeys.reports(selectedCompanyId!),
    queryFn: () => reportsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: notificationConfigs, isLoading: notificationsLoading } = useQuery({
    queryKey: queryKeys.notifications(selectedCompanyId!),
    queryFn: () => notificationsApi.listConfigs(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agentsList, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <p className="text-muted-foreground">Select a company to view agent activity.</p>
      </div>
    );
  }

  const tabs = [
    { id: "telemetry" as const, label: "Live Telemetry" },
    { id: "runs" as const, label: "Run History" },
    { id: "findings" as const, label: "Findings" },
    { id: "reports" as const, label: "Reports" },
    { id: "notifications" as const, label: "Notifications" },
    { id: "bulk" as const, label: "Bulk Ops" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Agent Activity Dashboard</h1>
      </div>

      <div className="flex gap-1 border-b pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statsLoading || findingsLoading || reportsLoading || notificationsLoading || agentsLoading ? (
        <PageSkeleton />
      ) : (
        <div className="space-y-6">
          {activeTab === "telemetry" && <LiveTelemetryPanel runStats={runStats} findingsSummary={findingsSummary} />}
          {activeTab === "runs" && <RunHistoryTable />}
          {activeTab === "findings" && <FindingsPanel />}
          {activeTab === "reports" && <ReportsPanel reports={reportsData?.reports ?? []} />}
          {activeTab === "notifications" && <NotificationsConfigPanel configs={notificationConfigs ?? []} />}
          {activeTab === "bulk" && (
            <div className="space-y-6">
              <BulkImportPanel companyId={selectedCompanyId} />
              <BulkOperationsPanel companyId={selectedCompanyId} agents={agentsList ?? []} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
