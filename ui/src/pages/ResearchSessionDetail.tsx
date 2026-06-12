import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  FlaskConical,
  Clock,
  CheckCircle,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Calendar,
  BarChart3,
  Layers,
  Loader2,
  XCircle,
  Edit3,
  Save,
  RotateCcw,
  Eye,
  Pencil,
} from "lucide-react";
import type { ResearchSessionDetail as ResearchSessionDetailType } from "@paperclipai/shared";
import { ResearchTaskList } from "../components/ResearchTaskList";
import { ResearchFindingsList } from "../components/ResearchFindingsList";
import { ResearchSourcesList } from "../components/ResearchSourcesList";
import { ResearchMemoryView } from "../components/ResearchMemoryView";

function SessionStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "cancelled") return <XCircle className="h-5 w-5 text-orange-500" />;
  if (status === "running") return <PlayCircle className="h-5 w-5 text-blue-500" />;
  if (status === "failed") return <AlertTriangle className="h-5 w-5 text-red-500" />;
  if (status === "paused") return <PauseCircle className="h-5 w-5 text-amber-500" />;
  return <Clock className="h-5 w-5 text-muted-foreground" />;
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    planning: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    cancelled: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.planning}`}>
      <SessionStatusIcon status={status} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div
        className="bg-primary h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

type ResearchTab = "overview" | "tasks" | "findings" | "sources" | "memory";

export function ResearchSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ResearchTab>("overview");

  const {
    data: session,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.research.session(selectedCompanyId!, sessionId!),
    queryFn: () => researchApi.getSession(selectedCompanyId!, sessionId!),
    enabled: !!selectedCompanyId && !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data as ResearchSessionDetailType | undefined;
      if (data?.status === "running" || data?.status === "cancelling") return 2000;
      return false;
    },
  });

  const startMutation = useMutation({
    mutationFn: () => researchApi.startSession(selectedCompanyId!, sessionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.session(selectedCompanyId!, sessionId!) });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => researchApi.cancelSession(selectedCompanyId!, sessionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.session(selectedCompanyId!, sessionId!) });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => researchApi.resumeSession(selectedCompanyId!, sessionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.session(selectedCompanyId!, sessionId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.research.sessions(selectedCompanyId!) });
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Research", href: "/research" },
      { label: "Sessions", href: "/research/sessions" },
      { label: session?.title ?? sessionId ?? "Session" },
    ]);
  }, [setBreadcrumbs, session, sessionId]);

  if (!selectedCompanyId || !sessionId) {
    return (
      <EmptyState
        icon={FlaskConical}
        message="Select a company and session to view details."
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/50">
        <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <EmptyState
        icon={FlaskConical}
        message="Session not found."
      />
    );
  }

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "tasks", label: `Tasks (${session.tasks?.length ?? 0})` },
    { value: "findings", label: `Findings (${session.findings?.length ?? 0})` },
    { value: "sources", label: `Sources (${session.sources?.length ?? 0})` },
    { value: "memory", label: "Memory" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SessionStatusBadge status={session.status} />
            <span className="text-xs text-muted-foreground capitalize">
              {session.depth} depth
            </span>
            {session.progressPercent > 0 && (
              <span className="text-xs text-muted-foreground">
                {session.progressPercent}% complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session.status === "planning" && (
              <Button
                size="sm"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-1" />
                )}
                Start Research
              </Button>
            )}
            {(session.status === "running" || session.status === "cancelling") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Cancel
              </Button>
            )}
            {(session.status === "cancelled" || session.status === "failed") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                {resumeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1" />
                )}
                Resume Research
              </Button>
            )}
          </div>
        </div>

        <h1 className="text-xl font-semibold">{session.title}</h1>

        <p className="text-sm text-muted-foreground">{session.query}</p>

        {session.progressPercent > 0 && (
          <div className="max-w-md">
            <ProgressBar percent={session.progressPercent} />
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Created {new Date(session.createdAt).toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Updated {new Date(session.updatedAt).toLocaleDateString()}
          </span>
          {session.startedAt && (
            <span className="flex items-center gap-1">
              <PlayCircle className="h-3.5 w-3.5" />
              Started {new Date(session.startedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ResearchTab)}>
        <PageTabBar
          items={tabs}
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ResearchTab)}
        />

        <TabsContent value="overview" className="mt-4 space-y-4">
          <OverviewTab session={session} companyId={selectedCompanyId} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <ResearchTaskList
            companyId={selectedCompanyId}
            sessionId={sessionId}
          />
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          <ResearchFindingsList
            companyId={selectedCompanyId}
            sessionId={sessionId}
          />
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <ResearchSourcesList
            companyId={selectedCompanyId}
            sessionId={sessionId}
          />
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <ResearchMemoryView
            companyId={selectedCompanyId}
            sessionId={sessionId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ session, companyId }: { session: ResearchSessionDetailType; companyId: string }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(session.report || "");
  const [showOriginal, setShowOriginal] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (report: string) =>
      researchApi.updateSession(companyId, session.id, { report }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.session(companyId, session.id) });
      setIsEditing(false);
    },
  });

  const handleSave = () => {
    updateMutation.mutate(editContent);
  };

  const handleCancel = () => {
    setEditContent(session.report || "");
    setIsEditing(false);
    setShowOriginal(false);
  };

  const handleEdit = () => {
    setEditContent(session.report || "");
    setIsEditing(true);
    setShowOriginal(false);
  };

  const displayReport = showOriginal && session.originalReport
    ? session.originalReport
    : session.report;

  return (
    <div className="space-y-4">
      {/* Plan */}
      {session.plan && session.plan.subtopics.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Research Plan
          </h3>
          <p className="text-sm text-muted-foreground">{session.plan.strategy}</p>
          <div className="space-y-2">
            {session.plan.subtopics.map((subtopic, idx) => (
              <div
                key={subtopic.id}
                className="flex items-start gap-3 p-2 rounded-md bg-muted/50"
              >
                <span className="text-xs font-medium text-muted-foreground mt-0.5">
                  {idx + 1}
                </span>
                <div>
                  <p className="text-sm font-medium">{subtopic.title}</p>
                  <p className="text-xs text-muted-foreground">{subtopic.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {session.report && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Research Report
              </h3>
              {session.isEdited && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <Pencil className="h-3 w-3" />
                  User Modified
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && session.originalReport && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowOriginal(!showOriginal)}
                >
                  {showOriginal ? (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Show Edited
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Show Original
                    </>
                  )}
                </Button>
              )}
              {!isEditing && (
                <Button type="button" size="sm" variant="outline" onClick={handleEdit}>
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit Report
                </Button>
              )}
            </div>
          </div>

          {showOriginal && session.originalReport && (
            <div className="rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Viewing original generated report
              </p>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-3">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your report content in Markdown..."
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Editing in Markdown format. Last updated: {new Date(session.updatedAt).toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm">{displayReport}</pre>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Session Metadata</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Max Subtopics</p>
            <p>{session.maxSubtopics}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Depth</p>
            <p className="capitalize">{session.depth}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Tasks</p>
            <p>{session.tasks?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Findings</p>
            <p>{session.findings?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Sources</p>
            <p>{session.sources?.length ?? 0}</p>
          </div>
          {session.completedAt && (
            <div>
              <p className="text-muted-foreground text-xs">Completed</p>
              <p>{new Date(session.completedAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
