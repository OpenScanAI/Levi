import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { bulkOperationsApi } from "@/api/bulk-operations";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/context/ToastContext";
import { Loader2, Plus, Trash2, GitBranch } from "lucide-react";

interface BulkImportPanelProps {
  companyId: string;
}

interface RepoInput {
  url: string;
  branch: string;
}

export function BulkImportPanel({ companyId }: BulkImportPanelProps) {
  const { pushToast } = useToast();
  const [repos, setRepos] = useState<RepoInput[]>([{ url: "", branch: "main" }]);

  const importMutation = useMutation({
    mutationFn: () =>
      bulkOperationsApi.bulkImport(
        companyId,
        repos.filter((r) => r.url.trim()).map((r) => ({ url: r.url.trim(), branch: r.branch.trim() || null })),
      ),
    onSuccess: (data) => {
      const succeeded = data.results.filter((r) => r.success).length;
      const failed = data.results.filter((r) => !r.success).length;
      pushToast({
        title: "Bulk Import Complete",
        body: `${succeeded} succeeded, ${failed} failed`,
        tone: "success",
      });
      setRepos([{ url: "", branch: "main" }]);
    },
    onError: (err: Error) => {
      pushToast({ title: "Import failed", body: err.message, tone: "error" });
    },
  });

  const addRepo = () => setRepos([...repos, { url: "", branch: "main" }]);
  const removeRepo = (index: number) => setRepos(repos.filter((_, i) => i !== index));
  const updateRepo = (index: number, field: keyof RepoInput, value: string) => {
    const next = [...repos];
    next[index][field] = value;
    setRepos(next);
  };

  const hasValidRepos = repos.some((r) => r.url.trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Bulk Import from GitHub
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {repos.map((repo, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="https://github.com/owner/repo"
              value={repo.url}
              onChange={(e) => updateRepo(index, "url", e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="branch"
              value={repo.branch}
              onChange={(e) => updateRepo(index, "branch", e.target.value)}
              className="w-32"
            />
            {repos.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeRepo(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addRepo} className="w-full">
          <Plus className="h-4 w-4 mr-1" />
          Add another repo
        </Button>

        <Separator />

        <Button
          onClick={() => importMutation.mutate()}
          disabled={!hasValidRepos || importMutation.isPending}
          className="w-full"
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            "Import Agents"
          )}
        </Button>

        {importMutation.isSuccess && (
          <div className="space-y-2">
            {importMutation.data.results.map((result, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[300px]">{result.url}</span>
                {result.success ? (
                  <Badge variant="default" className="bg-green-600">
                    {result.agentName}
                  </Badge>
                ) : (
                  <Badge variant="destructive">{result.error}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
