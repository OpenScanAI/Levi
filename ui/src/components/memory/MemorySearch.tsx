import { useState, useCallback } from "react";
import { Search, Filter, Clock, Target, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { MemoryType } from "../../api/memory";

export interface MemorySearchFilters {
  query: string;
  agentRole: string;
  memoryType: MemoryType | "all";
  timeRange: "all" | "1h" | "24h" | "7d" | "30d";
  goalId: string;
  from?: string;
  to?: string;
}

export interface MemorySearchProps {
  className?: string;
  onSearch: (filters: MemorySearchFilters) => void;
  isLoading?: boolean;
}

const AGENT_ROLES = [
  { value: "all", label: "All Roles" },
  { value: "Backend Engineer", label: "Backend Engineer" },
  { value: "Frontend Engineer", label: "Frontend Engineer" },
  { value: "DevOps Engineer", label: "DevOps Engineer" },
  { value: "Data Engineer", label: "Data Engineer" },
  { value: "Product Manager", label: "Product Manager" },
  { value: "CEO", label: "CEO" },
  { value: "CTO", label: "CTO" },
];

const MEMORY_TYPES: { value: MemoryType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "decision", label: "Decision" },
  { value: "error", label: "Error" },
  { value: "code_change", label: "Code Change" },
  { value: "architecture", label: "Architecture" },
  { value: "preference", label: "Preference" },
  { value: "discussion", label: "Discussion" },
];

const TIME_RANGES = [
  { value: "all", label: "All Time" },
  { value: "1h", label: "Last Hour" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

function timeRangeToDates(range: MemorySearchFilters["timeRange"]): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (range) {
    case "1h":
      return { from: new Date(now.getTime() - 60 * 60 * 1000).toISOString(), to };
    case "24h":
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to };
    case "7d":
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), to };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to };
    default:
      return {};
  }
}

export function MemorySearch({ className, onSearch, isLoading = false }: MemorySearchProps) {
  const [filters, setFilters] = useState<MemorySearchFilters>({
    query: "",
    agentRole: "all",
    memoryType: "all",
    timeRange: "all",
    goalId: "",
  });

  const updateFilter = useCallback(<K extends keyof MemorySearchFilters>(key: K, value: MemorySearchFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const { from, to } = timeRangeToDates(filters.timeRange);
      onSearch({
        ...filters,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      } as MemorySearchFilters);
    },
    [filters, onSearch],
  );

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* Natural language query */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Why did we pick JWT over sessions?"
          value={filters.query}
          onChange={(e) => updateFilter("query", e.target.value)}
          className="pl-9"
          disabled={isLoading}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={filters.agentRole}
            onValueChange={(value) => updateFilter("agentRole", value)}
            disabled={isLoading}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Agent Role" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value} className="text-xs">
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={filters.memoryType}
            onValueChange={(value) => updateFilter("memoryType", value as MemoryType | "all")}
            disabled={isLoading}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Memory Type" />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-xs">
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={filters.timeRange}
            onValueChange={(value) => updateFilter("timeRange", value as MemorySearchFilters["timeRange"])}
            disabled={isLoading}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((range) => (
                <SelectItem key={range.value} value={range.value} className="text-xs">
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Goal filter..."
            value={filters.goalId}
            onChange={(e) => updateFilter("goalId", e.target.value)}
            className="h-8 w-[140px] text-xs"
            disabled={isLoading}
          />
        </div>

        <Button type="submit" size="sm" disabled={isLoading || !filters.query.trim()} className="ml-auto">
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </div>
    </form>
  );
}
