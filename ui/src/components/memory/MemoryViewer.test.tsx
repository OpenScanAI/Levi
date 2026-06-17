// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import React from "react";
import MemoryViewer from "./MemoryViewer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mocks
const searchMock = vi.fn();
const pinMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../../api/memory", () => ({
  memoryApi: {
    search: (...args: unknown[]) => searchMock(...args),
    pin: (...args: unknown[]) => pinMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock("@/context/ToastContext", () => ({
  useToastActions: () => ({ pushToast: vi.fn() }),
}));

vi.mock("./MemorySearch", () => ({
  MemorySearch: ({ onSearch, isLoading }: { onSearch: (f: unknown) => void; isLoading?: boolean }) => (
    <div data-testid="memory-search">
      <button
        data-testid="search-btn"
        onClick={() =>
          onSearch({
            query: "test",
            agentRole: "all",
            memoryType: "all",
            timeRange: "24h",
            goalId: "",
          })
        }
        disabled={isLoading}
      >
        Search
      </button>
    </div>
  ),
}));

vi.mock("./MemoryGraph", () => ({
  MemoryGraph: (props: {
    memories: Array<{ id: string; content: string }>;
    isLoading?: boolean;
    error?: string | null;
    onPin?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) => (
    <div data-testid="memory-graph">
      {props.isLoading && <span data-testid="loading">Loading</span>}
      {props.error && <span data-testid="error">{props.error}</span>}
      {props.memories.length === 0 && !props.isLoading && !props.error && (
        <span data-testid="empty">No memories found.</span>
      )}
      {props.memories.map((m) => (
        <div key={m.id} data-testid={`memory-${m.id}`}>
          {m.content}
          <button data-testid={`pin-${m.id}`} onClick={() => props.onPin?.(m.id)}>
            Pin
          </button>
          <button data-testid={`delete-${m.id}`} onClick={() => props.onDelete?.(m.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  ),
}));

describe("MemoryViewer", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function renderViewer() {
    const root = createRoot(container);
    act(() => {
      root.render(<MemoryViewer companyId="c1" projectId="p1" />);
    });
    return { root };
  }

  it("renders search and graph components", () => {
    renderViewer();
    expect(container.querySelector('[data-testid="memory-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="memory-graph"]')).not.toBeNull();
  });

  it("shows empty state initially", () => {
    renderViewer();
    expect(container.querySelector('[data-testid="empty"]')).not.toBeNull();
  });

  it("performs search and displays results", async () => {
    searchMock.mockResolvedValue({
      query: "test",
      projectId: "p1",
      companyId: "c1",
      count: 2,
      memories: [
        {
          id: "m1",
          content: "Memory one",
          metadata: {
            company_id: "c1",
            project_id: "p1",
            agent_id: "a1",
            task_id: "t1",
            goal_ancestry: ["g1"],
            agent_role: "Backend Engineer",
            timestamp: new Date().toISOString(),
            run_id: "r1",
            cost: 0.01,
            memory_type: "decision",
            visibility: "shared",
          },
          namespace: "ns1",
          confidence: 0.9,
        },
        {
          id: "m2",
          content: "Memory two",
          metadata: {
            company_id: "c1",
            project_id: "p1",
            agent_id: "a2",
            task_id: "t2",
            goal_ancestry: [],
            agent_role: "Frontend Engineer",
            timestamp: new Date().toISOString(),
            run_id: "r2",
            cost: 0.02,
            memory_type: "error",
            visibility: "shared",
          },
          namespace: "ns2",
          confidence: 0.8,
        },
      ],
    });

    renderViewer();
    const btn = container.querySelector('[data-testid="search-btn"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelector('[data-testid="memory-m1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="memory-m2"]')).not.toBeNull();
    expect(searchMock).toHaveBeenCalledWith(
      "c1",
      "p1",
      expect.objectContaining({ q: "test" })
    );
  });

  it("handles search errors gracefully", async () => {
    searchMock.mockRejectedValue(new Error("Network error"));

    renderViewer();
    const btn = container.querySelector('[data-testid="search-btn"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("Network error");
  });

  it("pins a memory optimistically", async () => {
    searchMock.mockResolvedValue({
      query: "test",
      projectId: "p1",
      companyId: "c1",
      count: 1,
      memories: [
        {
          id: "m1",
          content: "Memory one",
          metadata: {
            company_id: "c1",
            project_id: "p1",
            agent_id: "a1",
            task_id: "t1",
            goal_ancestry: [],
            agent_role: "Backend Engineer",
            timestamp: new Date().toISOString(),
            run_id: "r1",
            cost: 0.01,
            memory_type: "decision",
            visibility: "shared",
          },
          namespace: "ns1",
          confidence: 0.9,
        },
      ],
    });

    pinMock.mockResolvedValue({
      id: "m1",
      pinned: true,
      success: true,
    });

    renderViewer();
    const searchBtn = container.querySelector('[data-testid="search-btn"]') as HTMLButtonElement;
    await act(async () => {
      searchBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    const pinBtn = container.querySelector('[data-testid="pin-m1"]') as HTMLButtonElement;
    await act(async () => {
      pinBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(pinMock).toHaveBeenCalledWith("m1", { pinned: true });
  });

  it("deletes a memory and filters it out", async () => {
    searchMock.mockResolvedValue({
      query: "test",
      projectId: "p1",
      companyId: "c1",
      count: 1,
      memories: [
        {
          id: "m1",
          content: "Memory one",
          metadata: {
            company_id: "c1",
            project_id: "p1",
            agent_id: "a1",
            task_id: "t1",
            goal_ancestry: [],
            agent_role: "Backend Engineer",
            timestamp: new Date().toISOString(),
            run_id: "r1",
            cost: 0.01,
            memory_type: "decision",
            visibility: "shared",
          },
          namespace: "ns1",
          confidence: 0.9,
        },
      ],
    });

    deleteMock.mockResolvedValue(undefined);
    vi.stubGlobal("confirm", () => true);

    renderViewer();
    const searchBtn = container.querySelector('[data-testid="search-btn"]') as HTMLButtonElement;
    await act(async () => {
      searchBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    const deleteBtn = container.querySelector('[data-testid="delete-m1"]') as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(deleteMock).toHaveBeenCalledWith("m1");
    expect(container.querySelector('[data-testid="memory-m1"]')).toBeNull();
  });
});
