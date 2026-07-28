import { Goal } from "./types";
import { todayStr } from "./dates";
import { missedDays } from "./store";

/**
 * 节奏信号 —— 把打卡反馈真正用起来。
 *
 * 在这之前,actualMinutes / feedbackDifficulty / adjustmentPreference 只有在
 * 用户落后并点了救援时才会被读到。正常推进时全部沉睡:一个人连着好几天
 * 填「偏轻、只用了一半时间」,系统毫无反应,继续推同样轻的任务。
 *
 * 这里把这些信号累积起来,到阈值时让陪练主动开口。
 *
 * 重要边界:加码只能「提议」,不能自动执行 —— 救援是把人捞回来(可以主动),
 * 加码是提高难度(必须问过本人)。
 */

export type PaceSignal = "none" | "too_easy" | "too_hard";

export interface PaceAssessment {
  signal: PaceSignal;
  /** 参与判断的最近打卡数 */
  sampleSize: number;
  /** 实际用时 / 计划用时 的均值,1 表示刚好 */
  timeRatio: number;
  /** 连续同向反馈天数 */
  streak: number;
  /** 给用户看的一句话 */
  title: string;
  detail: string;
}

const MIN_SAMPLES = 3;
const LOOKBACK = 5;

const NONE: PaceAssessment = {
  signal: "none",
  sampleSize: 0,
  timeRatio: 1,
  streak: 0,
  title: "",
  detail: "",
};

/** 取最近有反馈的若干次打卡（按完成时间倒序） */
function recentFeedbackTasks(goal: Goal) {
  return goal.tasks
    .filter((t) => t.completed && t.feedbackAt)
    .sort((a, b) => String(b.feedbackAt).localeCompare(String(a.feedbackAt)))
    .slice(0, LOOKBACK);
}

export function assessPace(goal: Goal): PaceAssessment {
  // 落后的人不该被加码,救援优先
  if (goal.status !== "active" || missedDays(goal) > 0) return NONE;
  // 已经问过并被拒绝的,当天不再问
  if (goal.upgradeDismissedAt === todayStr()) return NONE;

  const recent = recentFeedbackTasks(goal);
  if (recent.length < MIN_SAMPLES) return NONE;

  let ratioSum = 0;
  let ratioCount = 0;
  for (const t of recent) {
    const planned = t.durationMinutes || goal.profile?.dailyMinutes || 30;
    if (t.actualMinutes && planned > 0) {
      ratioSum += t.actualMinutes / planned;
      ratioCount++;
    }
  }
  const timeRatio = ratioCount > 0 ? ratioSum / ratioCount : 1;

  // 连续同向的难度反馈（从最近一次往回数）
  const countStreak = (want: "too_easy" | "too_hard") => {
    let n = 0;
    for (const t of recent) {
      if (t.feedbackDifficulty === want) n++;
      else break;
    }
    return n;
  };

  const easyStreak = countStreak("too_easy");
  const hardStreak = countStreak("too_hard");

  // 偏轻：连续 3 次说太easy，或连续快很多（用时不到计划七成）
  const fastEnough = ratioCount >= MIN_SAMPLES && timeRatio <= 0.7;
  if (easyStreak >= 3 || (easyStreak >= 2 && fastEnough) || (fastEnough && timeRatio <= 0.55)) {
    const pct = Math.round((1 - timeRatio) * 100);
    return {
      signal: "too_easy",
      sampleSize: recent.length,
      timeRatio,
      streak: Math.max(easyStreak, ratioCount),
      title: "你的节奏比计划快",
      detail:
        pct > 0
          ? `最近 ${recent.length} 次平均比计划快 ${pct}%。要不要让陪练把剩下的加码?`
          : `最近连续 ${easyStreak} 次都觉得偏轻。要不要让陪练把剩下的加码?`,
    };
  }

  // 偏重：连续 2 次说太hard，或持续明显超时
  const tooSlow = ratioCount >= MIN_SAMPLES && timeRatio >= 1.4;
  if (hardStreak >= 2 || tooSlow) {
    const pct = Math.round((timeRatio - 1) * 100);
    return {
      signal: "too_hard",
      sampleSize: recent.length,
      timeRatio,
      streak: Math.max(hardStreak, ratioCount),
      title: "这个强度有点顶",
      detail:
        pct > 0
          ? `最近 ${recent.length} 次平均比计划多花 ${pct}%。要不要让陪练调轻一点?`
          : `最近连续 ${hardStreak} 次都觉得偏难。要不要让陪练调轻一点?`,
    };
  }

  return NONE;
}

/** 今天是否值得提示「还有余力,试试挑战版」 */
export function shouldOfferChallenge(
  plannedMinutes: number,
  actualMinutes: number,
  difficulty: string
): boolean {
  if (difficulty === "too_hard") return false;
  if (difficulty === "too_easy") return true;
  return plannedMinutes > 0 && actualMinutes / plannedMinutes <= 0.75;
}
