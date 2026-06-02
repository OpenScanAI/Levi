import type { IssueWorkProduct } from "@paperclipai/shared";
import { api } from "./client";

export const workProductsApi = {
  listForIssue: (issueId: string) =>
    api.get<IssueWorkProduct[]>(`/issues/${issueId}/work-products`),
  create: (issueId: string, data: Record<string, unknown>) =>
    api.post<IssueWorkProduct>(`/issues/${issueId}/work-products`, data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<IssueWorkProduct>(`/work-products/${id}`, data),
  remove: (id: string) => api.delete<IssueWorkProduct>(`/work-products/${id}`),
};
