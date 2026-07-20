import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

export function StatusBadge({ status, throttleReason }: { status: string; throttleReason?: "BUDGET_EXCEEDED" | "NO_CONTEXT" | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
          statusBadge[status] ?? statusBadgeDefault
        )}
      >
        {status.replace(/_/g, " ")}
      </span>
      {throttleReason && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
            statusBadge[throttleReason] ?? statusBadgeDefault
          )}
        >
          {throttleReason === "BUDGET_EXCEEDED" ? "Budget exceeded" : "No context"}
        </span>
      )}
    </span>
  );
}
