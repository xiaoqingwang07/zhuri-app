import { Share } from "react-native";
import { APP_TOKEN, WORKER_URL } from "./config";
import { getDeviceId } from "./ai";
import { deleteGoalRow, kvGet, kvSet, loadGoals, saveGoal } from "./db";
import { Goal, PersonaId } from "./types";

const PERSONA_KEY = "persona";
const BACKUP_VERSION = 1;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  deviceId: string;
  persona: PersonaId | string;
  goals: Goal[];
  kv?: Record<string, string>;
}

function collectKv(): Record<string, string> {
  const keys = [
    PERSONA_KEY,
    "onboarding_done",
    "reminder_hour",
    "reminder_enabled",
    "pro_cached",
    "ai_usage",
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = kvGet(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

export function buildBackupPayload(): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    persona: kvGet(PERSONA_KEY) || "gentle",
    goals: loadGoals(),
    kv: collectKv(),
  };
}

/** 通过系统分享导出 JSON 文本（可存到文件/备忘录） */
export async function exportBackupShare(): Promise<void> {
  const payload = buildBackupPayload();
  const result = await Share.share({
    title: "逐日备份",
    message: JSON.stringify(payload),
  });
  if (result.action === Share.dismissedAction) {
    throw new Error("已取消导出");
  }
}

export function applyBackupPayload(raw: unknown): { goals: number } {
  const data = raw as BackupPayload;
  if (!data || !Array.isArray(data.goals)) {
    throw new Error("备份数据格式无效");
  }
  const existing = loadGoals();
  for (const goal of existing) {
    deleteGoalRow(goal.id);
  }
  let count = 0;
  for (const goal of data.goals) {
    if (goal?.id && Array.isArray(goal.tasks)) {
      saveGoal(goal);
      count++;
    }
  }
  if (data.kv) {
    for (const [key, value] of Object.entries(data.kv)) {
      if (typeof value === "string") kvSet(key, value);
    }
  }
  if (typeof data.persona === "string") {
    kvSet(PERSONA_KEY, data.persona);
  }
  return { goals: count };
}

export function parseBackupText(text: string): BackupPayload {
  const data = JSON.parse(text) as BackupPayload;
  if (!data || !Array.isArray(data.goals)) {
    throw new Error("不是有效的逐日备份 JSON");
  }
  return data;
}

export async function syncBackupToCloud(): Promise<void> {
  const payload = buildBackupPayload();
  const response = await fetch(`${WORKER_URL}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": getDeviceId(),
      "x-app-token": APP_TOKEN,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`云端备份失败 (${response.status}): ${text.slice(0, 120)}`);
  }
}

export async function restoreBackupFromCloud(): Promise<{ goals: number }> {
  const response = await fetch(`${WORKER_URL}/get`, {
    method: "GET",
    headers: {
      "x-device-id": getDeviceId(),
      "x-app-token": APP_TOKEN,
    },
  });
  if (!response.ok) {
    throw new Error(`云端恢复失败 (${response.status})`);
  }
  const data = await response.json();
  if (!data || (typeof data === "object" && !Array.isArray((data as BackupPayload).goals))) {
    throw new Error("云端还没有可用备份");
  }
  return applyBackupPayload(data);
}

export async function clearCloudBackup(): Promise<void> {
  const response = await fetch(`${WORKER_URL}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": getDeviceId(),
      "x-app-token": APP_TOKEN,
    },
    body: JSON.stringify({ version: BACKUP_VERSION, goals: [], cleared: true }),
  });
  if (!response.ok) {
    throw new Error(`清除失败 (${response.status})`);
  }
}
