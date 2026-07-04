import * as SQLite from "expo-sqlite";
import { Goal } from "./types";

const db = SQLite.openDatabaseSync("zhuri.db");

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function loadGoals(): Goal[] {
  const rows = db.getAllSync<{ data: string }>(
    "SELECT data FROM goals ORDER BY created_at ASC"
  );
  const goals: Goal[] = [];
  for (const row of rows) {
    try {
      goals.push(JSON.parse(row.data));
    } catch {
      // 跳过损坏的行
    }
  }
  return goals;
}

export function saveGoal(goal: Goal): void {
  const now = new Date().toISOString();
  db.runSync(
    `INSERT INTO goals (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    goal.id,
    JSON.stringify(goal),
    goal.createdAt,
    now
  );
}

export function deleteGoalRow(id: string): void {
  db.runSync("DELETE FROM goals WHERE id = ?", id);
}

export function kvGet(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    key
  );
  return row?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  db.runSync(
    `INSERT INTO kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
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
