import { GoalProfile } from "./types";

export type FeasibilityLevel = "ok" | "stretch" | "unrealistic";

export interface FeasibilityResult {
  level: FeasibilityLevel;
  title: string;
  message: string;
  suggestion: string;
  recommendedDays?: number;
  revisedGoal?: string;
}

const BOOK_SCALE_HINTS: { pattern: RegExp; pages: number; name: string }[] = [
  { pattern: /二十四史|24史/, pages: 40000, name: "二十四史" },
  { pattern: /资治通鉴/, pages: 6000, name: "资治通鉴" },
  { pattern: /史记/, pages: 1200, name: "史记" },
  { pattern: /四大名著|红楼梦.*西游记|西游记.*红楼梦/, pages: 4500, name: "四大名著" },
  { pattern: /资本论/, pages: 1800, name: "资本论" },
];

function extractExplicitDays(goal: string): number | null {
  const match = goal.match(/(\d+)\s*(天|日|周|个月|月)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (match[2] === "周") return value * 7;
  if (match[2] === "个月" || match[2] === "月") return value * 30;
  return value;
}

function extractBookCount(goal: string): number | null {
  const match = goal.match(/(\d+)\s*(本|册|卷)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function estimateReadingPages(goal: string): { pages: number; source: string } | null {
  for (const hint of BOOK_SCALE_HINTS) {
    if (hint.pattern.test(goal)) return { pages: hint.pages, source: hint.name };
  }

  const explicitPages = goal.match(/(\d+)\s*(页|p)/i);
  if (explicitPages) {
    const pages = Number(explicitPages[1]);
    if (Number.isFinite(pages)) return { pages, source: `${pages}页` };
  }

  const count = extractBookCount(goal);
  if (count && count >= 2) return { pages: count * 260, source: `${count}本书` };

  return null;
}

function readableHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}小时`;
}

export function evaluateGoalFeasibility(
  goal: string,
  selectedDays: number,
  profile: GoalProfile
): FeasibilityResult {
  const normalized = goal.trim();
  const explicitDays = extractExplicitDays(normalized);
  const days = explicitDays || selectedDays;
  const isReadingGoal = /读|阅读|看完|书|史|名著|页|本|册|卷/.test(normalized);

  if (explicitDays && explicitDays !== selectedDays) {
    return {
      level: "stretch",
      title: "目标时间和计划周期不一致",
      message: `你写的是 ${explicitDays} 天，但当前选择的是 ${selectedDays} 天。逐日会按你选择的 ${selectedDays} 天排计划。`,
      suggestion: "建议先把目标里的时间删掉，或者选择更接近的周期，避免计划和预期打架。",
    };
  }

  if (!isReadingGoal) {
    return {
      level: "ok",
      title: "目标可生成",
      message: "这个目标可以进入陪跑计划。",
      suggestion: "逐日会按你的时间和节奏生成任务。",
    };
  }

  const estimate = estimateReadingPages(normalized);
  if (!estimate) {
    return {
      level: "ok",
      title: "目标可生成",
      message: "这个阅读目标可以进入陪跑计划。",
      suggestion: "如果书很厚，建议在目标里写清页数或章节。",
    };
  }

  const pagesPerHour =
    profile.currentLevel === "advanced" ? 35 : profile.currentLevel === "some" ? 25 : 15;
  const availableMinutes = days * profile.dailyMinutes;
  const requiredMinutes = (estimate.pages / pagesPerHour) * 60;
  const loadRatio = requiredMinutes / Math.max(availableMinutes, 1);
  const pagesPerDay = Math.ceil(estimate.pages / days);

  if (loadRatio >= 2.2 || pagesPerDay >= 220) {
    const recommendedDays = Math.ceil(requiredMinutes / Math.max(profile.dailyMinutes * 0.85, 10));
    const revisedGoal =
      estimate.source === "二十四史"
        ? `${selectedDays}天读完《史记》选读或二十四史导读`
        : `${selectedDays}天完成${estimate.source}的重点章节/导读`;
    return {
      level: "unrealistic",
      title: "这个目标太猛了，直接排会骗人",
      message: `按你每天 ${profile.dailyMinutes} 分钟、${days} 天计算，约有 ${readableHours(availableMinutes)} 可用时间；但「${estimate.source}」粗估需要 ${readableHours(requiredMinutes)}，平均每天约 ${pagesPerDay} 页。`,
      suggestion: `建议改成「${revisedGoal}」，或把周期拉到约 ${recommendedDays} 天以上。`,
      recommendedDays,
      revisedGoal,
    };
  }

  if (loadRatio >= 1.25 || pagesPerDay >= 120) {
    return {
      level: "stretch",
      title: "这个目标偏冲刺",
      message: `粗估每天要读 ${pagesPerDay} 页左右，对当前时间和基础来说压力偏大。`,
      suggestion: "可以继续生成，但建议改成重点章节、导读版，或者把节奏改成「冲刺一点」。",
    };
  }

  return {
    level: "ok",
    title: "目标可生成",
    message: "这个阅读目标和当前投入时间大致匹配。",
    suggestion: "逐日会给你标准任务和最低完成版。",
  };
}
