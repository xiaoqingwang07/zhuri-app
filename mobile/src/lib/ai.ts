import * as Crypto from "expo-crypto";
import { kvGet, kvSet } from "./db";
import { addDays, todayStr } from "./dates";
import { DayTask, Goal, PersonaId } from "./types";
import { generateDefaultTasks, missedDays } from "./store";

const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";
const DEVICE_ID_KEY = "device_id";
// MiniMax-M3 生成多天计划通常需要 15–30 秒，隧道模式下更慢，超时要留足余量
const TIMEOUT_MS = 60000;

export function getDeviceId(): string {
  let id = kvGet(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    kvSet(DEVICE_ID_KEY, id);
  }
  return id;
}

async function callWorker<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": getDeviceId(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`AI 服务出错 (${response.status}): ${text.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function parseTaskArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.tasks) return data.tasks;
  if (data?.days) return data.days;
  return [];
}

function mapToDayTask(t: any, index: number, startDate: string): DayTask {
  return {
    day: t.day || index + 1,
    date: addDays(startDate, index),
    task: t.task || t.content || "推进目标进度",
    pages: t.pages || "",
    type: t.type || "practice",
    completed: false,
  };
}

/** AI 拆解目标为每日任务；失败抛错由调用方降级到本地模板 */
export async function generateTasksWithAI(
  goal: string,
  totalDays: number
): Promise<DayTask[]> {
  const start = todayStr();
  const data = await callWorker<any>("/", { goal, totalDays });
  const tasks = parseTaskArray(data).map((t, i) => mapToDayTask(t, i, start));
  if (tasks.length === 0) throw new Error("AI 返回了空计划");
  return tasks;
}

/** AI 拆解，最终失败时降级为本地模板 */
export async function generateTasksWithFallback(
  goal: string,
  totalDays: number
): Promise<{ tasks: DayTask[]; usedAI: boolean }> {
  try {
    const tasks = await generateTasksWithAI(goal, totalDays);
    return { tasks, usedAI: true };
  } catch {
    return { tasks: generateDefaultTasks(totalDays, goal), usedAI: false };
  }
}

export interface AdjustResult {
  tasks: DayTask[];
  message: string;
}

/**
 * 杀手锏：AI 动态调整。
 * 把「已完成的保留 + 未完成的重排到从今天开始的剩余天数里」。
 */
export async function adjustPlanWithAI(goal: Goal): Promise<AdjustResult> {
  const completed = goal.tasks.filter((t) => t.completed);
  const remaining = goal.tasks.filter((t) => !t.completed);
  const today = todayStr();

  const data = await callWorker<any>("/adjust", {
    goal: goal.name,
    totalDays: goal.totalDays,
    missedCount: missedDays(goal),
    completedCount: completed.length,
    remainingTasks: remaining.map((t) => ({ task: t.task, pages: t.pages, type: t.type })),
    remainingDays: remaining.length,
  });

  const rawTasks = parseTaskArray(data);
  if (rawTasks.length === 0) throw new Error("AI 调整失败");

  // 已完成任务保持原样，新任务从今天开始按天排列
  const newTasks: DayTask[] = rawTasks.map((t: any, i: number) => ({
    day: completed.length + i + 1,
    date: addDays(today, i),
    task: t.task || "推进目标进度",
    pages: t.pages || "",
    type: t.type || "practice",
    completed: false,
  }));

  const merged = [
    ...completed.map((t, i) => ({ ...t, day: i + 1 })),
    ...newTasks,
  ];

  return {
    tasks: merged,
    message: data.message || "已根据你的进度重新编排了剩余计划，从今天轻装上阵。",
  };
}

/** AI 督促文案（按人格 + 进度上下文生成），失败时返回本地兜底文案 */
export async function generateCoachMessage(
  persona: PersonaId,
  context: {
    goalName: string;
    streak: number;
    completionRate: number;
    missedCount: number;
    daysLeft: number;
    todayTask: string;
  }
): Promise<string> {
  try {
    const data = await callWorker<{ message: string }>("/coach", {
      persona,
      ...context,
    });
    if (data.message) return data.message;
    throw new Error("empty");
  } catch {
    return fallbackCoachMessage(persona, context.goalName);
  }
}

export function fallbackCoachMessage(persona: PersonaId, goalName: string): string {
  switch (persona) {
    case "strict":
      return `「${goalName}」还没打卡，别给自己找借口，现在就去完成。`;
    case "rational":
      return `提醒：「${goalName}」今日任务尚未完成，保持连续记录可显著提升达成率。`;
    default:
      return `今天的「${goalName}」还差一步就完成啦，花几分钟搞定它吧 🌟`;
  }
}

export interface WeeklyReview {
  summary: string;
  highlights: string[];
  suggestions: string[];
}

/** 每周 AI 复盘 */
export async function generateWeeklyReview(goals: Goal[]): Promise<WeeklyReview> {
  const today = todayStr();
  const weekAgo = addDays(today, -7);
  const stats = goals.map((g) => {
    const weekTasks = g.tasks.filter((t) => t.date >= weekAgo && t.date <= today);
    return {
      name: g.name,
      weekCompleted: weekTasks.filter((t) => t.completed).length,
      weekTotal: weekTasks.length,
      streak: g.streak,
      totalRate: Math.round(
        (g.tasks.filter((t) => t.completed).length / g.tasks.length) * 100
      ),
    };
  });

  const data = await callWorker<WeeklyReview>("/review", { stats });
  if (!data.summary) throw new Error("AI 复盘失败");
  return {
    summary: data.summary,
    highlights: data.highlights || [],
    suggestions: data.suggestions || [],
  };
}
