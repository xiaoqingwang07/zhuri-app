import * as Crypto from "expo-crypto";
import { addDays, todayStr } from "./dates";
import {
  buildDomainTaskDraft,
  buildFallbackGoalAnalysis,
  enrichTaskWithDomainContext,
} from "./domainCoach";
import { BADGES, CheckInFeedback, DEFAULT_GOAL_PROFILE, DayTask, Goal, GoalAnalysis, GoalProfile } from "./types";

export function createInitialGoal(
  name: string,
  description: string,
  totalDays: number,
  tasks: DayTask[],
  profile: GoalProfile = DEFAULT_GOAL_PROFILE,
  analysis?: GoalAnalysis
): Goal {
  const now = new Date().toISOString();
  return {
    id: Crypto.randomUUID(),
    name,
    description,
    totalDays,
    startDate: todayStr(),
    tasks,
    currentDay: 1,
    streak: 0,
    longestStreak: 0,
    reviveCards: 1,
    badges: BADGES.map((b) => ({ ...b })),
    status: "active",
    createdAt: now,
    profile,
    analysis,
    adjustCount: 0,
  };
}

/** 按日历日计算连续打卡：从今天（若今日未完成则从昨天）往回数 */
function calcStreak(tasks: DayTask[]): number {
  const completedDates = new Set(
    tasks.filter((t) => t.completed).map((t) => t.date)
  );
  if (completedDates.size === 0) return 0;

  const today = todayStr();
  let cursor = completedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completedDates.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function unlockBadges(goal: Goal, streak: number): Goal["badges"] {
  return goal.badges.map((badge) => {
    if (!badge.unlockedAt && streak >= badge.daysRequired) {
      return { ...badge, unlockedAt: new Date().toISOString() };
    }
    return badge;
  });
}

export interface CheckInResult {
  goal: Goal;
  newBadges: Goal["badges"];
  justCompleted: boolean;
}

export function checkIn(
  goal: Goal,
  dayIndex: number,
  feedback?: CheckInFeedback
): CheckInResult {
  const updatedTasks = [...goal.tasks];
  updatedTasks[dayIndex] = {
    ...updatedTasks[dayIndex],
    completed: true,
    completedAt: new Date().toISOString(),
    actualMinutes: feedback?.actualMinutes,
    feedbackDifficulty: feedback?.difficulty,
    blocker: feedback?.blocker,
    adjustmentPreference: feedback?.adjustmentPreference,
    feedbackAt: feedback ? new Date().toISOString() : undefined,
  };

  const streak = calcStreak(updatedTasks);
  const badges = unlockBadges(goal, streak);
  const newBadges = badges.filter(
    (b, i) => b.unlockedAt && !goal.badges[i].unlockedAt
  );

  const longestStreak = Math.max(goal.longestStreak, streak);

  // 每连续 30 天奖励一张复活卡
  const bonusCards =
    Math.floor(streak / 30) - Math.floor(goal.streak / 30);
  const reviveCards = Math.max(goal.reviveCards, 0) + Math.max(0, bonusCards);

  const firstIncomplete = updatedTasks.findIndex((t) => !t.completed);
  const currentDay =
    firstIncomplete === -1 ? goal.totalDays : firstIncomplete + 1;

  const allCompleted = updatedTasks.every((t) => t.completed);
  const status: Goal["status"] = allCompleted ? "completed" : "active";

  return {
    goal: {
      ...goal,
      tasks: updatedTasks,
      streak,
      longestStreak,
      reviveCards,
      badges,
      currentDay,
      status,
      completedAt: allCompleted ? new Date().toISOString() : goal.completedAt,
    },
    newBadges,
    justCompleted: allCompleted && goal.status !== "completed",
  };
}

/** 用复活卡补救最早一个错过的日子 */
export function useReviveCard(goal: Goal): Goal | null {
  if (goal.reviveCards <= 0) return null;
  const today = todayStr();
  const missedIndex = goal.tasks.findIndex(
    (t) => !t.completed && t.date < today
  );
  if (missedIndex === -1) return null;

  const updatedTasks = [...goal.tasks];
  updatedTasks[missedIndex] = {
    ...updatedTasks[missedIndex],
    completed: true,
    completedAt: new Date().toISOString(),
    revived: true,
  };

  const streak = calcStreak(updatedTasks);
  const longestStreak = Math.max(goal.longestStreak, streak);
  const badges = unlockBadges(goal, streak);

  return {
    ...goal,
    tasks: updatedTasks,
    streak,
    longestStreak,
    badges,
    reviveCards: goal.reviveCards - 1,
    status: updatedTasks.every((t) => t.completed) ? "completed" : goal.status,
  };
}

/** 严格匹配「今天」日期的任务；没有则返回 -1（勿与补作业混淆） */
export function todayTaskIndex(goal: Goal): number {
  const today = todayStr();
  return goal.tasks.findIndex((t) => t.date === today);
}

/** 最早一个未完成任务（用于补作业 / 无今日槽位时） */
export function nextIncompleteTaskIndex(goal: Goal): number {
  return goal.tasks.findIndex((t) => !t.completed);
}

/** 错过的天数（日期已过但未完成） */
export function missedDays(goal: Goal): number {
  const today = todayStr();
  return goal.tasks.filter((t) => !t.completed && t.date < today).length;
}

/** 完成率 0-1 */
export function completionRate(goal: Goal): number {
  if (goal.tasks.length === 0) return 0;
  return goal.tasks.filter((t) => t.completed).length / goal.tasks.length;
}

/** AI 失败时的本地降级任务生成（从 Web 版移植） */
export function generateDefaultTasks(
  totalDays: number,
  goalName: string,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): DayTask[] {
  const tasks: DayTask[] = [];
  const g = goalName;
  const analysis = buildFallbackGoalAnalysis(goalName, profile);
  const isReading = /读|书|阅读|看完|《/.test(g);
  const isCoding = /开发|编程|代码|app|程序|网站|项目|上线|功能|产品/i.test(g);
  const isFitness = /跑|健身|运动|锻炼|马拉松|公里|游泳|骑车|减肥|减重/.test(g);
  const isLearning = /学|技能|课程|语言|英语|吉他|钢琴|乐器|设计|画|绘|考证|证书/.test(g);
  const isHabit = /习惯|早起|冥想|打卡|坚持|戒/.test(g);

  const durationBase =
    profile.pace === "gentle"
      ? Math.max(10, Math.round(profile.dailyMinutes * 0.75))
      : profile.pace === "ambitious"
        ? Math.round(profile.dailyMinutes * 1.15)
        : profile.dailyMinutes;

  const getDifficulty = (progress: number): DayTask["difficulty"] => {
    if (profile.pace === "gentle") return progress < 0.65 ? "easy" : "normal";
    if (profile.pace === "ambitious") return progress < 0.25 ? "normal" : "hard";
    return progress < 0.2 ? "easy" : progress > 0.75 ? "hard" : "normal";
  };

  const makeVariants = (task: string, pages: string, progress: number) => {
    const minutes = Math.max(
      8,
      Math.round(durationBase * (progress < 0.15 ? 0.8 : progress > 0.75 ? 1.15 : 1))
    );
    return {
      durationMinutes: minutes,
      difficulty: getDifficulty(progress),
      minimumTask: pages ? `完成 ${pages} 的一半，先不断档` : "先做 10 分钟，保住节奏",
      challengeTask: task,
      energy: progress < 0.18 ? "light" : progress > 0.78 ? "push" : "steady",
    } satisfies Partial<DayTask>;
  };

  const getTask = (
    i: number
  ): { task: string; pages: string; type: string } => {
    const specialistDraft = buildDomainTaskDraft(goalName, i, totalDays);
    if (specialistDraft) return specialistDraft;

    const progress = i / totalDays;
    const dayNum = i + 1;

    if (isCoding) {
      if (progress < 0.15) return { task: "明确需求与技术选型，整理开发文档", pages: `第${dayNum}天`, type: "planning" };
      if (progress < 0.3) return { task: "搭建项目脚手架，完成基础框架", pages: `第${dayNum}天`, type: "coding" };
      if (progress < 0.6) return { task: `开发核心功能模块（第${Math.round(progress * 10) - 2}个功能点）`, pages: `第${dayNum}天`, type: "coding" };
      if (progress < 0.8) return { task: "联调测试，修复已知 Bug", pages: `第${dayNum}天`, type: "debugging" };
      if (progress < 0.95) return { task: "完善 UI 细节，撰写使用说明", pages: `第${dayNum}天`, type: "design" };
      return { task: "上线发布，收集首批用户反馈", pages: "发布", type: "summary" };
    }

    if (isFitness) {
      const km = Math.round(2 + progress * 8);
      if (progress < 0.2) return { task: "热身训练 + 基础体能练习", pages: `${km}公里`, type: "warmup" };
      if (progress < 0.7) return { task: "完成今日训练计划，记录数据", pages: `${km}公里`, type: "workout" };
      if (progress < 0.9) return { task: "强化训练，冲刺目标配速", pages: `${km}公里`, type: "workout" };
      return { task: "正式测试 / 比赛，记录最终成绩", pages: "终测", type: "race" };
    }

    if (isLearning && !isReading) {
      if (progress < 0.2) return { task: "学习基础概念，完成入门练习", pages: `第${dayNum}天`, type: "learn" };
      if (progress < 0.5) return { task: "深入学习核心内容，每日练习 30 分钟", pages: `第${dayNum}天`, type: "practice" };
      if (progress < 0.75) return { task: "综合练习，巩固薄弱环节", pages: `第${dayNum}天`, type: "review" };
      if (progress < 0.9) return { task: "模拟测试 / 实战演练", pages: `第${dayNum}天`, type: "mock" };
      return { task: "总复习，查漏补缺，准备验收", pages: "收尾", type: "summary" };
    }

    if (isHabit) {
      if (progress < 0.1) return { task: "制定具体执行规则，准备必要工具", pages: `第${dayNum}天`, type: "planning" };
      if (progress < 0.7) return { task: "执行今日计划，记录完成情况", pages: `第${dayNum}天`, type: "habit" };
      if (progress < 0.9) return { task: "回顾过去一周，优化执行策略", pages: `第${dayNum}天`, type: "review" };
      return { task: "总结习惯养成情况，制定下阶段计划", pages: "收尾", type: "summary" };
    }

    if (isReading) {
      const pagesPerDay = Math.ceil(300 / totalDays);
      const startPage = i * pagesPerDay + 1;
      const endPage = Math.min((i + 1) * pagesPerDay, 300);
      const cleanName = goalName.replace(/《|》|读完|看完/g, "").trim();
      if (progress < 0.9) return { task: `阅读《${cleanName}》第${startPage}-${endPage}页`, pages: `P${startPage}-P${endPage}`, type: "reading" };
      if (progress < 0.95) return { task: "全书回顾，做读书笔记", pages: "全书", type: "notes" };
      return { task: "整理核心观点，写读后感", pages: "总结", type: "summary" };
    }

    if (progress < 0.2) return { task: "制定详细计划，分解子目标", pages: `第${dayNum}天`, type: "planning" };
    if (progress < 0.7) return { task: `按计划推进：${goalName.slice(0, 12)}（第${dayNum}天）`, pages: `第${dayNum}天`, type: "practice" };
    if (progress < 0.9) return { task: "检验阶段性成果，调整策略", pages: `第${dayNum}天`, type: "review" };
    return { task: "完成收尾工作，总结经验", pages: "收尾", type: "summary" };
  };

  const start = todayStr();
  for (let i = 0; i < totalDays; i++) {
    const progress = i / totalDays;
    const draft = getTask(i);
    const dayTask: DayTask = {
      day: i + 1,
      date: addDays(start, i),
      task: draft.task,
      pages: draft.pages,
      type: draft.type,
      completed: false,
      ...makeVariants(draft.task, draft.pages, progress),
    };
    tasks.push(enrichTaskWithDomainContext(goalName, dayTask, i, totalDays, profile, analysis));
  }
  return tasks;
}
