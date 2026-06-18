import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useNavigate } from "@/lib/router";
import { queryKeys } from "../lib/queryKeys";
import { researchApi } from "../api/research";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlaskConical, Loader2, AlertTriangle, Sparkles, Plus, Trash2, Edit2, Check, X, ArrowLeft, ArrowRight, Wand2 } from "lucide-react";
import type { ResearchDepth } from "@paperclipai/shared";

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "form" | "subtopics" | "creating";

interface Subtopic {
  id: string;
  title: string;
  description: string;
  priority: number;
}

export function CreateSessionDialog({ open, onOpenChange }: CreateSessionDialogProps) {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("medium");
  const [maxSubtopics, setMaxSubtopics] = useState(5);
  const [error, setError] = useState<string | null>(null);

  // Step state
  const [step, setStep] = useState<Step>("form");
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [strategy, setStrategy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      researchApi.createSession(selectedCompanyId!, {
        title: title.trim(),
        query: query.trim(),
        depth,
        maxSubtopics,
        plan: subtopics.length > 0 ? { strategy, subtopics } : undefined,
      }),
    onSuccess: async (session) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research.sessions(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.research.dashboard(selectedCompanyId!) });

      // Auto-start the session
      try {
        await researchApi.startSession(selectedCompanyId!, session.id);
      } catch (err) {
        // Auto-start failed, but session is created - user can start manually
        console.warn("Auto-start failed:", err);
      }

      resetForm();
      onOpenChange(false);
      navigate(`/research/sessions/${session.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
      setStep("form");
    },
  });

  const resetForm = () => {
    setTitle("");
    setQuery("");
    setDepth("medium");
    setMaxSubtopics(5);
    setError(null);
    setStep("form");
    setSubtopics([]);
    setStrategy("");
    setGenerateError(null);
    setEditingId(null);
  };

  const handleClose = () => {
    if (step === "creating") return;
    resetForm();
    onOpenChange(false);
  };

  const handleGenerateSubtopics = async () => {
    if (!query.trim()) {
      setError("Please enter a research query first.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setError(null);
    try {
      const result = await researchApi.generateSubtopics(selectedCompanyId!, {
        query: query.trim(),
        depth,
        maxSubtopics,
      });
      setStrategy(result.strategy);
      setSubtopics(result.subtopics);
      setStep("subtopics");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate subtopics.";
      setGenerateError(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSkipSubtopics = () => {
    setSubtopics([]);
    setStrategy("");
    setStep("creating");
    createMutation.mutate();
  };

  const handleConfirmSubtopics = () => {
    setStep("creating");
    createMutation.mutate();
  };

  const handleAddSubtopic = () => {
    const newSubtopic: Subtopic = {
      id: `subtopic-${Date.now()}`,
      title: "New Subtopic",
      description: "Description of what to research",
      priority: subtopics.length + 1,
    };
    setSubtopics([...subtopics, newSubtopic]);
    startEdit(newSubtopic);
  };

  const handleRemoveSubtopic = (id: string) => {
    const filtered = subtopics.filter((s) => s.id !== id);
    // Re-prioritize
    const reordered = filtered.map((s, idx) => ({ ...s, priority: idx + 1 }));
    setSubtopics(reordered);
  };

  const startEdit = (subtopic: Subtopic) => {
    setEditingId(subtopic.id);
    setEditTitle(subtopic.title);
    setEditDescription(subtopic.description);
  };

  const saveEdit = () => {
    if (!editingId) return;
    setSubtopics(
      subtopics.map((s) =>
        s.id === editingId
          ? { ...s, title: editTitle.trim() || s.title, description: editDescription.trim() || s.description }
          : s
      )
    );
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const isPending = createMutation.isPending || generating;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {step === "form" && "New Research Session"}
            {step === "subtopics" && "Review Subtopics"}
            {step === "creating" && "Creating Session..."}
          </DialogTitle>
          <DialogDescription>
            {step === "form" && "Enter your research topic and generate subtopics."}
            {step === "subtopics" && "Review, edit, or add subtopics for your research."}
            {step === "creating" && "Creating your research session and starting research..."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/50">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {generateError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/50">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Subtopic generation failed</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">{generateError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Form */}
        {step === "form" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerateSubtopics();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., React Server Components Analysis"
                maxLength={200}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="query">Research Query</Label>
              <Textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to research?"
                rows={3}
                disabled={isPending}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="depth">Depth</Label>
                <select
                  id="depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as ResearchDepth)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  disabled={isPending}
                >
                  <option value="shallow">Shallow (3 subtopics)</option>
                  <option value="medium">Medium (4-5 subtopics)</option>
                  <option value="deep">Deep (5-7 subtopics)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxSubtopics">Max Subtopics</Label>
                <Input
                  id="maxSubtopics"
                  type="number"
                  min={1}
                  max={20}
                  value={maxSubtopics}
                  onChange={(e) => setMaxSubtopics(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  disabled={isPending}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSkipSubtopics}
                disabled={isPending || !title.trim() || !query.trim()}
              >
                Skip & Create
              </Button>
              <Button
                type="submit"
                disabled={isPending || !title.trim() || !query.trim()}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Generate Subtopics
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 2: Subtopics Review */}
        {step === "subtopics" && (
          <div className="space-y-4">
            {strategy && (
              <div className="rounded-md bg-muted px-3 py-2">
                <p className="text-sm font-medium text-muted-foreground">Strategy</p>
                <p className="text-sm">{strategy}</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Subtopics ({subtopics.length})</Label>
                <Button type="button" variant="ghost" size="sm" onClick={handleAddSubtopic}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {subtopics.map((subtopic, index) => (
                  <div
                    key={subtopic.id}
                    className="rounded-md border border-border p-3 space-y-2"
                  >
                    {editingId === subtopic.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Subtopic title"
                          className="h-8"
                        />
                        <Textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description"
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={saveEdit}>
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {index + 1}
                            </span>
                            <p className="text-sm font-medium truncate">{subtopic.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {subtopic.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startEdit(subtopic)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemoveSubtopic(subtopic.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button type="button" variant="secondary" onClick={handleSkipSubtopics}>
                Skip & Create
              </Button>
              <Button type="button" onClick={handleConfirmSubtopics}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Create & Start
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === "creating" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center space-y-1">
              <p className="text-lg font-medium">Creating Research Session</p>
              <p className="text-sm text-muted-foreground">
                {subtopics.length > 0
                  ? `Creating session with ${subtopics.length} subtopics...`
                  : "Creating session..."}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
