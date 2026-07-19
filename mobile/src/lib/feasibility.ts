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

function evaluateFitness(
  goal: string,
  days: number,
  selectedDays: number,
  profile: GoalProfile
): FeasibilityResult | null {
  const g = goal;
  const isFitness = /跑|马拉松|全马|半马|健身|减脂|减重|游泳|骑车|力量训练/.test(g);
  if (!isFitness) return null;

  const beginner = profile.currentLevel === "beginner";
  if (/全马|42\s*公里|马拉松(?!半)/.test(g) && days < 90 && beginner) {
    return {
      level: "unrealistic",
      title: "这个运动目标太猛了",
      message: `从零备战全马通常需要数月渐进，${days} 天硬排容易受伤或半途放弃。`,
      suggestion: `建议改成「${selectedDays}天建立跑步习惯并完成 5 公里」或把周期拉到 90 天以上。`,
      recommendedDays: 120,
      revisedGoal: `${selectedDays}天从零跑到5公里`,
    };
  }
  if (/半马|21\s*公里/.test(g) && days < 45 && beginner) {
    return {
      level: "stretch",
      title: "半马备战偏紧",
      message: `新手用 ${days} 天冲击半马压力偏大，容易过量。`,
      suggestion: "可以继续，但建议先以 5 公里/10 公里为第一阶段，或拉长周期。",
      revisedGoal: `${selectedDays}天跑到10公里`,
    };
  }
  if (/减脂|减重|减肥/.test(g) && /(\d+)\s*公斤/.test(g)) {
    const kg = Number(g.match(/(\d+)\s*公斤/)?.[1] || 0);
    const maxSafe = Math.max(1, Math.floor(days / 10));
    if (kg >= 8 && days <= 21) {
      return {
        level: "unrealistic",
        title: "减重幅度不现实",
        message: `${days} 天减 ${kg} 公斤远超健康节奏，硬拆计划会骗人。`,
        suggestion: `建议改成「${selectedDays}天建立饮食与训练习惯，目标减重 ${Math.min(kg, maxSafe)} 公斤以内」。`,
        revisedGoal: `${selectedDays}天健康减脂${Math.min(3, maxSafe)}公斤`,
      };
    }
  }
  return null;
}

function evaluateLanguage(
  goal: string,
  days: number,
  selectedDays: number,
  profile: GoalProfile
): FeasibilityResult | null {
  const g = goal;
  const isLang = /英语|日语|韩语|口语|雅思|托福|五十音|外语/.test(g);
  if (!isLang) return null;

  if (/自由交流|流利对话|裸考过|从零.*(日语|英语).*交流/.test(g) && days <= 14) {
    return {
      level: "unrealistic",
      title: "语言目标周期太短",
      message: `${days} 天从零到「自由交流」不符合语言学习规律。`,
      suggestion: `建议改成「${selectedDays}天掌握五十音/日常寒暄」或「建立每日跟读习惯」。`,
      revisedGoal: `${selectedDays}天建立每日口语跟读习惯`,
    };
  }
  if (/雅思|托福/.test(g) && /提[高升].*1\.5|提[高升].*2/.test(g) && days < 60) {
    return {
      level: "stretch",
      title: "提分目标偏冲刺",
      message: "短周期大幅提分通常需要更高强度与刷题量。",
      suggestion: "可以继续生成，但建议把目标改成「突破薄弱项」或拉长到 60 天以上。",
    };
  }
  if (profile.currentLevel === "beginner" && /流利/.test(g) && days < 30) {
    return {
      level: "stretch",
      title: "「流利」需要更长陪跑",
      message: "对刚开始的人，「流利」更适合作为阶段愿景，而不是短周期验收标准。",
      suggestion: "建议把成功标准改成可验收的小目标，例如自我介绍、跟读、日常问答。",
      revisedGoal: `${selectedDays}天能完成1分钟英语自我介绍`,
    };
  }
  return null;
}

function evaluateProject(
  goal: string,
  days: number,
  selectedDays: number,
  profile: GoalProfile
): FeasibilityResult | null {
  const g = goal;
  const isProject = /App|应用|小程序|网站|上线|社交|盈利|完整/.test(g);
  if (!isProject) return null;

  if (/社交|完整.*(App|应用)|上线盈利|从零.*(App|应用).*上线/.test(g) && days <= 30) {
    return {
      level: "unrealistic",
      title: "项目范围太大",
      message: `${days} 天做出「完整社交 App 并上线盈利」几乎必然变成虚假计划。`,
      suggestion: `建议改成「${selectedDays}天做出可演示的 MVP（1 个核心流程）」。`,
      recommendedDays: 60,
      revisedGoal: `${selectedDays}天做出可演示的MVP`,
    };
  }
  if (/上线/.test(g) && days <= 14 && profile.currentLevel === "beginner") {
    return {
      level: "stretch",
      title: "上线周期偏紧",
      message: "新手在两周内从零到上线压力很大，容易停在环境配置。",
      suggestion: "可以继续，但建议把验收标准改成「可本地跑通的 MVP」。",
      revisedGoal: `${selectedDays}天做完可本地演示的MVP`,
    };
  }
  return null;
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

  const fitness = evaluateFitness(normalized, days, selectedDays, profile);
  if (fitness) return fitness;
  const language = evaluateLanguage(normalized, days, selectedDays, profile);
  if (language) return language;
  const project = evaluateProject(normalized, days, selectedDays, profile);
  if (project) return project;

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
