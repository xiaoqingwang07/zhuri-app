import { Goal } from "./types";
import { completionRate, missedDays, nextIncompleteTaskIndex, todayTaskIndex } from "./store";
import { todayStr } from "./dates";

/**
 * 太阳状态机 —— 「逐日」的情绪单一数据源。
 *
 * 同一份状态驱动三处:
 *   1. 首页活太阳(SunDial)
 *   2. 推送通知配图与文案
 *   3. 将来的桌面动态图标(alternate app icon)
 *
 * 设计原则:太阳高度 = 用户此刻和目标的关系。
 * 断得越久天越黑,但永远不画到全黑 —— 逐日的态度是「还接得回来」。
 */
export type SunPhase = "night" | "dusk" | "dawn" | "rising" | "noon";

export interface SunState {
  phase: SunPhase;
  /** 太阳高度 0(沉在地平线下) → 1(当空) */
  altitude: number;
  /** 光晕强度 0-1 */
  glow: number;
  /** 天空渐变(上→下) */
  sky: [string, string];
  /** 太阳本体渐变(上→下) */
  sun: [string, string];
  /** 地面色 */
  ground: string;
  /** 地平线光色 */
  horizon: string;
  /** 状态短标题,用于推送标题 */
  title: string;
  /** 一句话状态描述 */
  line: string;
  /** 推送配图 key,对应 assets/images/push-<key>.png */
  imageKey: SunPhase;
}

const LIGHT: Record<SunPhase, Omit<SunState, "phase" | "title" | "line" | "imageKey">> = {
  night: {
    altitude: 0,
    glow: 0.12,
    sky: ["#3B3550", "#5C4A55"],
    sun: ["#8C7E96", "#6E6280"],
    ground: "#241F2E",
    horizon: "#7A6A78",
  },
  dusk: {
    altitude: 0.22,
    glow: 0.3,
    sky: ["#6B5A72", "#C77F63"],
    sun: ["#FFC98F", "#E8763F"],
    ground: "#3A2C33",
    horizon: "#E0906A",
  },
  dawn: {
    altitude: 0.42,
    glow: 0.55,
    sky: ["#FFC9A0", "#FFE6CC"],
    sun: ["#FFF3DC", "#FF9A4D"],
    ground: "#7A4B34",
    horizon: "#FFD1A3",
  },
  rising: {
    altitude: 0.72,
    glow: 0.8,
    sky: ["#FFB877", "#FFF0DC"],
    sun: ["#FFF8E8", "#FFA24D"],
    ground: "#8A5638",
    horizon: "#FFE0B8",
  },
  noon: {
    altitude: 0.95,
    glow: 1,
    sky: ["#FFCE7A", "#FFF6E4"],
    sun: ["#FFFDF4", "#FFC24D"],
    ground: "#9A6540",
    horizon: "#FFEBC4",
  },
};

const DARK: Record<SunPhase, Omit<SunState, "phase" | "title" | "line" | "imageKey">> = {
  night: {
    altitude: 0,
    glow: 0.1,
    sky: ["#191826", "#2A2333"],
    sun: ["#5A5266", "#453E52"],
    ground: "#12101A",
    horizon: "#4C4352",
  },
  dusk: {
    altitude: 0.22,
    glow: 0.28,
    sky: ["#2B2333", "#6E4335"],
    sun: ["#E8A870", "#C25F30"],
    ground: "#1C1620",
    horizon: "#9A5F41",
  },
  dawn: {
    altitude: 0.42,
    glow: 0.5,
    sky: ["#43281F", "#7A452C"],
    sun: ["#FFE0B0", "#FF8C3D"],
    ground: "#241813",
    horizon: "#C4794A",
  },
  rising: {
    altitude: 0.72,
    glow: 0.78,
    sky: ["#5C3520", "#A65E2E"],
    sun: ["#FFF1D8", "#FF9E44"],
    ground: "#2C1C14",
    horizon: "#E39A5C",
  },
  noon: {
    altitude: 0.95,
    glow: 1,
    sky: ["#7A4520", "#D08236"],
    sun: ["#FFFAEC", "#FFB84A"],
    ground: "#33200F",
    horizon: "#F0AE66",
  },
};

const COPY: Record<SunPhase, { title: string; line: string }> = {
  night: {
    title: "太阳快沉下去了",
    line: "断了几天,但它还没落。今天做最低版就能拉回来。",
  },
  dusk: {
    title: "天色在暗下来",
    line: "落后一点点,现在接住还很轻松。",
  },
  dawn: {
    title: "今天还没升起来",
    line: "做完今天这一步,太阳就升上去了。",
  },
  rising: {
    title: "今天接住了",
    line: "太阳升起来了,明天继续。",
  },
  noon: {
    title: "日正当空",
    line: "连续在跑,这个状态很稳。",
  },
};

/** 单个目标 → 太阳阶段 */
export function goalPhase(goal: Goal): SunPhase {
  const missed = missedDays(goal);
  if (missed >= 3) return "night";
  if (missed >= 1) return "dusk";

  const todayIdx = todayTaskIndex(goal);
  const done =
    todayIdx !== -1
      ? goal.tasks[todayIdx].completed
      : nextIncompleteTaskIndex(goal) === -1;

  if (!done) return "dawn";
  return goal.streak >= 7 ? "noon" : "rising";
}

/** 跨目标聚合:取最需要被救的那个(最暗的阶段) */
export function overallPhase(goals: Goal[]): SunPhase {
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) return "dawn";
  const order: SunPhase[] = ["night", "dusk", "dawn", "rising", "noon"];
  let worst = 4;
  for (const goal of active) {
    const idx = order.indexOf(goalPhase(goal));
    if (idx < worst) worst = idx;
  }
  return order[worst];
}

export function sunStateFor(phase: SunPhase, isDark: boolean): SunState {
  const palette = (isDark ? DARK : LIGHT)[phase];
  return { phase, ...palette, ...COPY[phase], imageKey: phase };
}

/** 便捷:直接从目标算出完整状态 */
export function sunStateForGoal(goal: Goal, isDark: boolean): SunState {
  return sunStateFor(goalPhase(goal), isDark);
}

/** 推送文案:带上目标名和具体动作,避免空泛 */
export function pushCopy(
  phase: SunPhase,
  goalName: string,
  todayTask?: string
): { title: string; body: string } {
  const task = todayTask ? `今天:${todayTask}` : "";
  switch (phase) {
    case "night":
      return {
        title: `逐日 · ${COPY.night.title}`,
        body: `「${goalName}」断了几天了。做一次最低完成版就能把太阳拉回来。${task}`,
      };
    case "dusk":
      return {
        title: `逐日 · ${COPY.dusk.title}`,
        body: `「${goalName}」落后一点了,现在接住还很轻松。${task}`,
      };
    case "noon":
      return {
        title: "逐日 · 保住这个连续",
        body: `「${goalName}」正在最好的状态,别在今天断。${task}`,
      };
    default:
      return {
        title: `逐日 · ${COPY.dawn.title}`,
        body: `「${goalName}」今天这一步做完,太阳就升上去了。${task}`,
      };
  }
}

/** 今天是不是已经过完了(用于判断展示明日预告) */
export function isTodayDone(goal: Goal): boolean {
  const idx = todayTaskIndex(goal);
  if (idx === -1) return nextIncompleteTaskIndex(goal) === -1;
  return goal.tasks[idx].completed;
}

/** 完成度,给需要数字的地方复用 */
export function goalProgress(goal: Goal): number {
  return completionRate(goal);
}

export const TODAY = todayStr;
