import type { NotificationType, NotificationEventType } from "@paperclipai/shared";
import { api } from "./client";

export interface NotificationConfig {
  id: string;
  companyId: string;
  type: NotificationType;
  targetUrl: string;
  events: NotificationEventType[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const notificationsApi = {
  listConfigs: (companyId: string) =>
    api.get<NotificationConfig[]>(`/companies/${companyId}/notifications/config`),
  getConfig: (companyId: string, id: string) =>
    api.get<NotificationConfig>(`/companies/${companyId}/notifications/config/${id}`),
  createConfig: (companyId: string, body: {
    type: NotificationType;
    targetUrl: string;
    events: NotificationEventType[];
    enabled?: boolean;
  }) => api.post<NotificationConfig>(`/companies/${companyId}/notifications/config`, body),
  updateConfig: (companyId: string, id: string, body: Partial<{
    type: NotificationType;
    targetUrl: string;
    events: NotificationEventType[];
    enabled: boolean;
  }>) => api.patch<NotificationConfig>(`/companies/${companyId}/notifications/config/${id}`, body),
  deleteConfig: (companyId: string, id: string) =>
    api.delete<{ deleted: true }>(`/companies/${companyId}/notifications/config/${id}`),
};
