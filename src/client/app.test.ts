import { describe, expect, it } from "bun:test";

interface Counter {
  id: string;
  name: string;
  count: number;
}

type ViewMode = "single" | "grid" | "list";

interface AppState {
  counters: Counter[];
  activeId: string;
  viewMode: ViewMode;
  thumbZoneMode: boolean;
}

const MAX_NAME_LEN = 30;

function uid(): string {
  return "id";
}

function sanitizeCounter(input: unknown, fallbackName: string): Counter | null {
  if (typeof input !== "object" || input === null) return null;

  const candidate = input as { id?: unknown; name?: unknown; count?: unknown };
  const id = typeof candidate.id === "string" && candidate.id ? candidate.id : uid();
  const rawName = typeof candidate.name === "string" ? candidate.name : fallbackName;
  const name = rawName.trim().slice(0, MAX_NAME_LEN) || "Untitled";
  const count =
    typeof candidate.count === "number" && Number.isFinite(candidate.count) ? candidate.count : 0;

  return { id, name, count };
}

function parseCounters(input: unknown): Counter[] {
  if (!Array.isArray(input)) return [];

  const counters: Counter[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const parsed = sanitizeCounter(input[index], `Counter ${index + 1}`);
    if (parsed) counters.push(parsed);
  }
  return counters;
}

function resolveActiveId(counters: Counter[], activeId: unknown): string {
  if (counters.length === 0) {
    return "";
  }
  if (typeof activeId === "string" && counters.some((counter) => counter.id === activeId)) {
    return activeId;
  }
  return counters[0].id;
}

describe("state helpers", () => {
  it("sanitizeCounter normalizes fields and enforces name length", () => {
    const longName = "A".repeat(100);
    const result = sanitizeCounter(
      { id: "", name: `  ${longName}  `, count: 5 },
      "Fallback"
    ) as Counter;

    expect(result.id).toBe("id");
    expect(result.name.length).toBeLessThanOrEqual(MAX_NAME_LEN);
    expect(result.count).toBe(5);
  });

  it("sanitizeCounter falls back correctly when invalid", () => {
    const result = sanitizeCounter({}, "Fallback") as Counter;
    expect(result.id).toBe("id");
    expect(result.name).toBe("Fallback");
    expect(result.count).toBe(0);
  });

  it("parseCounters skips invalid entries", () => {
    const counters = parseCounters([null, { name: "Ok", count: 2 }, 42]);
    expect(counters.length).toBe(1);
    expect(counters[0].name).toBe("Ok");
  });

  it("resolveActiveId returns activeId when present", () => {
    const counters: Counter[] = [
      { id: "a", name: "A", count: 0 },
      { id: "b", name: "B", count: 0 }
    ];
    expect(resolveActiveId(counters, "b")).toBe("b");
  });

  it("resolveActiveId falls back to first counter when activeId missing", () => {
    const counters: Counter[] = [
      { id: "a", name: "A", count: 0 },
      { id: "b", name: "B", count: 0 }
    ];
    expect(resolveActiveId(counters, "c")).toBe("a");
  });

  it("resolveActiveId handles empty counters safely", () => {
    expect(resolveActiveId([], "anything")).toBe("");
  });
});
