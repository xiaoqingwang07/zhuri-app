import * as Crypto from "expo-crypto";
import { kvGet, kvSet } from "./db";
import { addDays, todayStr } from "./dates";
import { buildFallbackGoalAnalysis, enrichTaskWithDomainContext } from "./domainCoach";
import { DEFAULT_GOAL_PROFILE, DayTask, Goal, GoalAnalysis, GoalProfile, PersonaId } from "./types";
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

function sanitizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return list.length > 0 ? list : fallback;
}

function parseGoalAnalysis(
  data: any,
  goal: string,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): GoalAnalysis {
  const fallback = buildFallbackGoalAnalysis(goal, profile);
  const raw = data?.analysis || {};
  return {
    domain: String(raw.domain || fallback.domain),
    subject: String(raw.subject || fallback.subject),
    expertiseAngle: String(raw.expertiseAngle || fallback.expertiseAngle),
    successCriteria: sanitizeList(raw.successCriteria, fallback.successCriteria),
    keyMilestones: sanitizeList(raw.keyMilestones, fallback.keyMilestones),
    riskFactors: sanitizeList(raw.riskFactors, fallback.riskFactors),
    coachStrategy: String(raw.coachStrategy || fallback.coachStrategy),
  };
}

function mapToDayTask(
  t: any,
  index: number,
  startDate: string,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): DayTask {
  const duration = Number(t.durationMinutes || t.duration || t.minutes || profile.dailyMinutes);
  const difficulty = ["easy", "normal", "hard"].includes(t.difficulty)
    ? t.difficulty
    : index < 2
      ? "easy"
      : "normal";
  return {
    day: t.day || index + 1,
    date: addDays(startDate, index),
    task: t.task || t.content || "推进目标进度",
    pages: t.pages || "",
    type: t.type || "practice",
    completed: false,
    durationMinutes: Math.max(8, Math.min(180, duration)),
    difficulty,
    minimumTask: t.minimumTask || t.minimum || "先做 10 分钟，保住节奏",
    challengeTask: t.challengeTask || t.challenge || t.task || t.content || "推进目标进度",
    focus: t.focus,
    rationale: t.rationale,
    successCheck: t.successCheck,
    coachTip: t.coachTip,
    energy: t.energy || (difficulty === "hard" ? "push" : difficulty === "easy" ? "light" : "steady"),
  };
}

export interface PlanGenerationResult {
  tasks: DayTask[];
  usedAI: boolean;
  analysis: GoalAnalysis;
}

/** AI 拆解目标为每日任务；失败抛错由调用方降级到本地模板 */
export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): Promise<PlanGenerationResult> {
  const start = todayStr();
  const data = await callWorker<any>("/", { goal, totalDays, profile });
  const analysis = parseGoalAnalysis(data, goal, profile);
  const tasks = parseTaskArray(data).map((t, i) =>
    enrichTaskWithDomainContext(goal, mapToDayTask(t, i, start, profile), i, totalDays, profile, analysis)
  );
  if (tasks.length === 0) throw new Error("AI 返回了空计划");
  return { tasks, usedAI: true, analysis };
}

/** AI 拆解，最终失败时降级为本地模板 */
export async function generateTasksWithFallback(
  goal: string,
  totalDays: number,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): Promise<PlanGenerationResult> {
  try {
    return await generateTasksWithAI(goal, totalDays, profile);
  } catch {
    return {
      tasks: generateDefaultTasks(totalDays, goal, profile),
      usedAI: false,
      analysis: buildFallbackGoalAnalysis(goal, profile),
    };
  }
}

export interface AdjustResult {
  tasks: DayTask[];
  message: string;
}

export type RescueMode = "relaxed" | "steady" | "sprint";

/**
 * 杀手锏：AI 动态调整。
 * 把「已完成的保留 + 未完成的重排到从今天开始的剩余天数里」。
 */
export async function adjustPlanWithAI(
  goal: Goal,
  mode: RescueMode = "steady"
): Promise<AdjustResult> {
  const completed = goal.tasks.filter((t) => t.completed);
  const remaining = goal.tasks.filter((t) => !t.completed);
  const today = todayStr();
  const missed = missedDays(goal);
  const extension = mode === "relaxed" ? Math.min(3, Math.max(1, missed)) : 0;
  const compression = mode === "sprint" ? Math.min(3, Math.max(1, missed)) : 0;
  const remainingDays = Math.max(1, remaining.length + extension - compression);

  const data = await callWorker<any>("/adjust", {
    goal: goal.name,
    totalDays: goal.totalDays,
    profile: goal.profile || DEFAULT_GOAL_PROFILE,
    rescueMode: mode,
    missedCount: missed,
    completedCount: completed.length,
    remainingTasks: remaining.map((t) => ({ task: t.task, pages: t.pages, type: t.type })),
    remainingDays,
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
    durationMinutes: Number(t.durationMinutes || goal.profile?.dailyMinutes || 30),
    difficulty: ["easy", "normal", "hard"].includes(t.difficulty) ? t.difficulty : "normal",
    minimumTask: t.minimumTask || "先做 10 分钟，把节奏接回来",
    challengeTask: t.challengeTask || t.task || "推进目标进度",
    energy: t.energy || "steady",
    rescueNote: t.rescueNote,
    focus: t.focus,
    rationale: t.rationale,
    successCheck: t.successCheck,
    coachTip: t.coachTip,
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
