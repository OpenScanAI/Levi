import { api } from "./client";

export const agentAnalyticsApi = {
  summary: async (companyId: string) => {
    return api.get(
      `/companies/${companyId}/analytics/agents`,
    );
  },
};
