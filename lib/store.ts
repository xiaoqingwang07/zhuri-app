import { Goal, DayTask, BADGES, DEFAULT_BADGES, SupervisionUser } from "./types";
import { saveDataToCloud } from "./ai";

const GOALS_KEY = "zhuri_goals";
const USERS_KEY = "zhuri_supervision_users";

export function saveGoals(goals: Goal[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  
  // P2: Background sync to Cloudflare KV
  if (goals.length > 0) {
    saveDataToCloud({ [GOALS_KEY]: goals }).catch(err => console.log('Sync deferred:', err));
  }
}

export function loadGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(GOALS_KEY);
  if (!data) return [];
  try {
    const goals: Goal[] = JSON.parse(data);
    // Add reviveCards to goals that don't have it
    return goals.map((g) => ({
      ...g,
      reviveCards: g.reviveCards ?? 1,
    }));
  } catch {
    return [];
  }
}

export function clearGoals(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GOALS_KEY);
}

export function loadGoal(): Goal | null {
  const goals = loadGoals();
  return goals.length > 0 ? goals[0] : null;
}

export function createInitialGoal(
  name: string,
  description: string,
  totalDays: number,
  tasks: DayTask[]
): Goal {
  const today = new Date();
  const startDate = today.toISOString().split("T")[0];

  return {
    id: crypto.randomUUID(),
    name,
    description,
    totalDays,
    startDate,
    tasks,
    currentDay: 1,
    streak: 0,
    longestStreak: 0,
    reviveCards: 1,
    badges: [...DEFAULT_BADGES],
    status: "active",
  };
}

export function checkIn(goal: Goal, dayIndex: number): Goal {
  const updatedTasks = [...goal.tasks];
  updatedTasks[dayIndex] = {
    ...updatedTasks[dayIndex],
    completed: true,
    completedAt: new Date().toISOString(),
  };

  // Calculate streak
  let streak = 0;
  let currentDay = dayIndex;
  while (currentDay >= 0 && updatedTasks[currentDay].completed) {
    streak++;
    currentDay--;
  }

  // Check for new badges
  const badges = goal.badges.map((badge) => {
    const badgeDef = BADGES.find((b) => b.id === badge.id);
    if (badgeDef && streak >= badgeDef.daysRequired && !badge.unlockedAt) {
      return { ...badge, unlockedAt: new Date().toISOString() };
    }
    return badge;
  });

  // Update longest streak
  const longestStreak = Math.max(goal.longestStreak, streak);

  // Award revive card every 30 days
  const newReviveCards = Math.floor((streak + 1) / 30) - Math.floor(goal.streak / 30);
  const reviveCards = Math.max(goal.reviveCards, 0) + Math.max(0, newReviveCards);

  // Update current day
  const currentDayIndex = updatedTasks.findIndex((t) => !t.completed);
  const newCurrentDay = currentDayIndex === -1 ? goal.totalDays : currentDayIndex + 1;

  // Check if all tasks are completed
  const allCompleted = updatedTasks.every((t) => t.completed);
  const status: Goal["status"] = allCompleted ? "completed" : "active";
  const completedAt = allCompleted ? new Date().toISOString() : goal.completedAt;

  return {
    ...goal,
    tasks: updatedTasks,
    streak,
    longestStreak,
    reviveCards,
    badges,
    currentDay: newCurrentDay,
    status,
    completedAt,
  };
}

export function useReviveCard(goal: Goal): Goal | null {
  if (goal.reviveCards <= 0) return null;

  const today = new Date().toISOString().split("T")[0];

  // Find first incomplete past task (missed day)
  const missedIndex = goal.tasks.findIndex(
    (t) => !t.completed && t.date < today
  );

  if (missedIndex === -1) return null; // No missed days

  // Mark as completed
  const updatedTasks = [...goal.tasks];
  updatedTasks[missedIndex] = {
    ...updatedTasks[missedIndex],
    completed: true,
    completedAt: new Date().toISOString(),
  };

  // Recalculate streak from beginning
  let streak = 0;
  for (let i = 0; i < updatedTasks.length; i++) {
    if (updatedTasks[i].completed) {
      streak++;
    } else {
      break;
    }
  }

  const longestStreak = Math.max(goal.longestStreak, streak);

  // Update badges
  const badges = goal.badges.map((b) => {
    if (b.unlockedAt) return b;
    if (streak >= b.daysRequired) {
      return { ...b, unlockedAt: new Date().toISOString() };
    }
    return b;
  });

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

export function generateDefaultTasks(totalDays: number, goalName: string): DayTask[] {
  const tasks: DayTask[] = [];

  // Detect goal type from keywords
  const g = goalName;
  const isReading = /读|书|阅读|看完|《/.test(g);
  const isCoding = /开发|编程|代码|app|程序|网站|项目|上线|功能|产品/.test(g);
  const isFitness = /跑|健身|运动|锻炼|马拉松|公里|游泳|骑车|减肥|减重/.test(g);
  const isLearning = /学|技能|课程|语言|英语|吉他|钢琴|乐器|设计|画|绘|考证|证书/.test(g);
  const isHabit = /习惯|早起|冥想|打卡|坚持|戒/.test(g);

  // Build day-by-day task phases depending on goal type
  const getTask = (i: number): { task: string; pages: string; type: DayTask["type"] } => {
    const progress = i / totalDays; // 0 → 1
    const dayNum = i + 1;

    if (isCoding) {
      if (progress < 0.15) return { task: `明确需求与技术选型，整理开发文档`, pages: `第${dayNum}天`, type: "notes" };
      if (progress < 0.3)  return { task: `搭建项目脚手架，完成基础框架`, pages: `第${dayNum}天`, type: "notes" };
      if (progress < 0.6)  return { task: `开发核心功能模块（第${Math.round(progress * 10) - 2}个功能点）`, pages: `第${dayNum}天`, type: "notes" };
      if (progress < 0.8)  return { task: `联调测试，修复已知 Bug`, pages: `第${dayNum}天`, type: "review" };
      if (progress < 0.95) return { task: `完善 UI 细节，撰写使用说明`, pages: `第${dayNum}天`, type: "notes" };
      return { task: `上线发布，收集首批用户反馈`, pages: "发布", type: "summary" };
    }

    if (isFitness) {
      const km = Math.round(2 + progress * 8);
      if (progress < 0.2) return { task: `热身训练 + 基础体能练习`, pages: `${km}公里`, type: "reading" };
      if (progress < 0.7) return { task: `完成今日训练计划，记录数据`, pages: `${km}公里`, type: "reading" };
      if (progress < 0.9) return { task: `强化训练，冲刺目标配速`, pages: `${km}公里`, type: "review" };
      return { task: `正式测试 / 比赛，记录最终成绩`, pages: "终测", type: "summary" };
    }

    if (isLearning && !isReading) {
      if (progress < 0.2) return { task: `学习基础概念，完成入门练习`, pages: `第${dayNum}天`, type: "reading" };
      if (progress < 0.5) return { task: `深入学习核心内容，每日练习 30 分钟`, pages: `第${dayNum}天`, type: "reading" };
      if (progress < 0.75) return { task: `综合练习，巩固薄弱环节`, pages: `第${dayNum}天`, type: "review" };
      if (progress < 0.9) return { task: `模拟测试 / 实战演练`, pages: `第${dayNum}天`, type: "review" };
      return { task: `总复习，查漏补缺，准备验收`, pages: "收尾", type: "summary" };
    }

    if (isHabit) {
      if (progress < 0.1) return { task: `制定具体执行规则，准备必要工具`, pages: `第${dayNum}天`, type: "notes" };
      if (progress < 0.7) return { task: `执行今日计划，记录完成情况`, pages: `第${dayNum}天`, type: "reading" };
      if (progress < 0.9) return { task: `回顾过去一周，优化执行策略`, pages: `第${dayNum}天`, type: "review" };
      return { task: `总结习惯养成情况，制定下阶段计划`, pages: "收尾", type: "summary" };
    }

    // Default: Reading (only used for actual book goals)
    if (isReading) {
      const pagesPerDay = Math.ceil(300 / totalDays);
      const startPage = i * pagesPerDay + 1;
      const endPage = Math.min((i + 1) * pagesPerDay, 300);
      const cleanName = goalName.replace(/《|》|读完|看完/g, "").trim();
      if (progress < 0.9) return { task: `阅读《${cleanName}》第${startPage}-${endPage}页`, pages: `P${startPage}-P${endPage}`, type: "reading" };
      if (progress < 0.95) return { task: `全书回顾，做读书笔记`, pages: "全书", type: "notes" };
      return { task: `整理核心观点，写读后感`, pages: "总结", type: "summary" };
    }

    // Generic fallback (unknown goal type)
    if (progress < 0.2) return { task: `制定详细计划，分解子目标`, pages: `第${dayNum}天`, type: "notes" };
    if (progress < 0.7) return { task: `按计划推进：${goalName.slice(0, 12)}（第${dayNum}天）`, pages: `第${dayNum}天`, type: "reading" };
    if (progress < 0.9) return { task: `检验阶段性成果，调整策略`, pages: `第${dayNum}天`, type: "review" };
    return { task: `完成收尾工作，总结经验`, pages: "收尾", type: "summary" };
  };

  for (let i = 0; i < totalDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const { task, pages, type } = getTask(i);
    tasks.push({ day: i + 1, date: dateStr, task, pages, type, completed: false });
  }

  return tasks;
}


// Supervision users helpers
export function loadSupervisionUsers(): SupervisionUser[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(USERS_KEY);
  if (!data) return []; // P0-fix: no mock data — start with empty, real friends only
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveSupervisionUsers(users: SupervisionUser[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function updateUserCheckIn(userId: string, completed: boolean): SupervisionUser[] {
  const users = loadSupervisionUsers();
  const updated = users.map((u) =>
    u.id === userId
      ? { ...u, todayCompleted: completed, lastCheckIn: new Date().toISOString(), streak: completed ? u.streak + 1 : 0 }
      : u
  );
  saveSupervisionUsers(updated);
  return updated;
}
