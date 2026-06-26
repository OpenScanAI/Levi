import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { notificationsApi } from "../api/notifications";
import type { NotificationType, NotificationEventType } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Bell, Plus, Trash2, Webhook } from "lucide-react";

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  webhook: Webhook,
  discord: Bell,
  telegram: Bell,
  slack: Bell,
  email: Bell,
};

const typeLabels: Record<string, string> = {
  webhook: "Webhook",
  discord: "Discord",
  telegram: "Telegram",
  slack: "Slack",
  email: "Email",
};

interface NotificationsConfigPanelProps {
  configs: Array<{
    id: string;
    type: string;
    targetUrl: string;
    events: string[];
    enabled: boolean;
  }>;
}

export function NotificationsConfigPanel({ configs }: NotificationsConfigPanelProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<NotificationType>("webhook");
  const [newTarget, setNewTarget] = useState("");
  const [newEvents, setNewEvents] = useState<NotificationEventType[]>(["agent.run.completed"]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.notifications(selectedCompanyId!),
    queryFn: () => notificationsApi.listConfigs(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { type: NotificationType; targetUrl: string; events: NotificationEventType[] }) =>
      notificationsApi.createConfig(selectedCompanyId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications(selectedCompanyId!) });
      setShowForm(false);
      setNewTarget("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ enabled: boolean }> }) =>
      notificationsApi.updateConfig(selectedCompanyId!, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications(selectedCompanyId!) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.deleteConfig(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications(selectedCompanyId!) });
    },
  });

  const displayConfigs = data ?? configs;
  const eventOptions: NotificationEventType[] = [
    "agent.run.completed",
    "agent.run.failed",
    "agent.run.stuck",
    "agent.finding.created",
    "agent.report.generated",
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Notification Configs</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-4 rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Type</label>
                <select
                  className="w-full mt-1 rounded-md border px-3 py-2 text-sm"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as NotificationType)}
                >
                  {Object.keys(typeLabels).map((t) => (
                    <option key={t} value={t}>
                      {typeLabels[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Target URL</label>
                <Input
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Events</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {eventOptions.map((event) => (
                  <label key={event} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewEvents([...newEvents, event]);
                        } else {
                          setNewEvents(newEvents.filter((ev) => ev !== event));
                        }
                      }}
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newTarget.trim()}
                onClick={() =>
                  createMutation.mutate({ type: newType, targetUrl: newTarget, events: newEvents })
                }
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading configs...</p>
        ) : displayConfigs.length > 0 ? (
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-4 p-3 text-sm font-medium text-muted-foreground border-b bg-muted/50">
              <div>Type</div>
              <div>Target</div>
              <div>Events</div>
              <div>Enabled</div>
              <div className="w-[50px]"></div>
            </div>
            <div className="divide-y">
              {displayConfigs.map((config) => {
                const Icon = typeIcons[config.type] ?? Bell;
                return (
                  <div key={config.id} className="grid grid-cols-5 gap-4 p-3 items-center">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {typeLabels[config.type] ?? config.type}
                    </div>
                    <div className="font-mono text-sm max-w-[200px] truncate">
                      {config.targetUrl}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {config.events.map((e) => (
                        <Badge key={e} variant="outline" className="text-xs">
                          {e}
                        </Badge>
                      ))}
                    </div>
                    <div>
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          config.enabled ? "bg-primary" : "bg-gray-200"
                        }`}
                        onClick={() =>
                          updateMutation.mutate({ id: config.id, body: { enabled: !config.enabled } })
                        }
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            config.enabled ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => deleteMutation.mutate(config.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notification configs set up yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
