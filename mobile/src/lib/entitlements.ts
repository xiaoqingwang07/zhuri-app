import { kvGet, kvGetJSON, kvSet, kvSetJSON } from "./db";
import {
  FREE_AI_QUOTA_PER_MONTH,
  MAX_GOALS_FREE,
  MAX_GOALS_PRO,
} from "./types";

const PRO_CACHE_KEY = "pro_cached";
const AI_USAGE_KEY = "ai_usage"; // { month: "2026-07", count: number }

interface AIUsage {
  month: string;
  count: number;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 本地缓存的 Pro 状态（RevenueCat 校验后写入，离线时使用缓存） */
export function isProCached(): boolean {
  return kvGet(PRO_CACHE_KEY) === "1";
}

export function setProCached(isPro: boolean): void {
  kvSet(PRO_CACHE_KEY, isPro ? "1" : "0");
}

export function maxGoals(isPro: boolean): number {
  return isPro ? MAX_GOALS_PRO : MAX_GOALS_FREE;
}

export function getAIUsage(): AIUsage {
  const usage = kvGetJSON<AIUsage>(AI_USAGE_KEY, { month: currentMonth(), count: 0 });
  if (usage.month !== currentMonth()) {
    return { month: currentMonth(), count: 0 };
  }
  return usage;
}

export function remainingAIQuota(isPro: boolean): number {
  if (isPro) return Infinity;
  return Math.max(0, FREE_AI_QUOTA_PER_MONTH - getAIUsage().count);
}

export function consumeAIQuota(): void {
  const usage = getAIUsage();
  kvSetJSON(AI_USAGE_KEY, { month: usage.month, count: usage.count + 1 });
}
