import { Goal, DayTask, BADGES, DEFAULT_BADGES, SupervisionUser, MOCK_USERS } from "./types";

const GOALS_KEY = "zhuri_goals";
const USERS_KEY = "zhuri_supervision_users";

export function saveGoals(goals: Goal[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function loadGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(GOALS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
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
    badges,
    currentDay: newCurrentDay,
    status,
    completedAt,
  };
}

export function generateDefaultTasks(totalDays: number, bookName: string): DayTask[] {
  // Default task template if no AI generation
  const tasks: DayTask[] = [];
  const pagesPerDay = Math.ceil(300 / totalDays); // Assuming ~300 pages

  for (let i = 0; i < totalDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];

    let task = "";
    let pages = "";
    let type: DayTask["type"] = "reading";

    if (i < totalDays - 2) {
      // Regular reading days
      const startPage = i * pagesPerDay + 1;
      const endPage = Math.min((i + 1) * pagesPerDay, 300);
      pages = `P${startPage}-P${endPage}`;
      // Strip 《》 from bookName to avoid double brackets like 《读完《人类简史》》
      const cleanName = bookName.replace(/《|》/g, "");
      task = `阅读《${cleanName}》第${startPage}-${endPage}页`;
      type = "reading";
    } else if (i === totalDays - 2) {
      // Review day
      task = `回顾全书，做读书笔记`;
      pages = "全书";
      type = "notes";
    } else {
      // Summary day
      task = `整理全书核心观点，写一篇读后感`;
      pages = "总结";
      type = "summary";
    }

    tasks.push({
      day: i + 1,
      date: dateStr,
      task,
      pages,
      type,
      completed: false,
    });
  }

  return tasks;
}

// Supervision users helpers
export function loadSupervisionUsers(): SupervisionUser[] {
  if (typeof window === "undefined") return MOCK_USERS;
  const data = localStorage.getItem(USERS_KEY);
  if (!data) return MOCK_USERS;
  try {
    return JSON.parse(data);
  } catch {
    return MOCK_USERS;
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
