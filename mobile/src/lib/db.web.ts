/**
 * Web 端内存存储（仅开发预览用，Expo Go 真机走 db.native.ts + SQLite）。
 */
import { Goal } from "./types";

const goalsStore = new Map<string, Goal>();
const kvStore = new Map<string, string>();

export function loadGoals(): Goal[] {
  return Array.from(goalsStore.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function saveGoal(goal: Goal): void {
  goalsStore.set(goal.id, goal);
}

export function deleteGoalRow(id: string): void {
  goalsStore.delete(id);
}

export function kvGet(key: string): string | null {
  return kvStore.get(key) ?? null;
}

export function kvSet(key: string, value: string): void {
  kvStore.set(key, value);
}

export function kvGetJSON<T>(key: string, fallback: T): T {
  const raw = kvGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function kvSetJSON(key: string, value: unknown): void {
  kvSet(key, JSON.stringify(value));
}
