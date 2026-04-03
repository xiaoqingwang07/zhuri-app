export interface DayTask {
  day: number;
  date: string;
  task: string;
  pages: string;
  type: "reading" | "notes" | "review" | "summary";
  completed: boolean;
  completedAt?: string;
}

export interface Goal {
  id: string;
  name: string;
  description: string;
  totalDays: number;
  startDate: string;
  tasks: DayTask[];
  currentDay: number;
  streak: number;
  longestStreak: number;
  reviveCards: number;
  badges: Badge[];
  status: "active" | "completed";
  completedAt?: string;
  apiKey?: string;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  unlockedAt?: string;
  daysRequired: number;
}

export interface SupervisionUser {
  id: string;
  name: string;
  avatar: string;
  todayCompleted: boolean;
  streak: number;
  lastCheckIn?: string;
}

export const BADGES: Badge[] = [
  { id: "starter", name: "初学者", emoji: "🌱", daysRequired: 3 },
  { id: "persistor", name: "坚持者", emoji: "🔥", daysRequired: 7 },
  { id: "advanced", name: "进阶者", emoji: "⭐", daysRequired: 14 },
  { id: "champion", name: "完成挑战", emoji: "🏆", daysRequired: 20 },
];

export const DEFAULT_BADGES: Badge[] = BADGES.map(b => ({ ...b }));

export const MOCK_USERS: SupervisionUser[] = [
  { id: "1", name: "庆爷", avatar: "🏃", todayCompleted: false, streak: 0 },
  { id: "2", name: "小明", avatar: "🧑‍💻", todayCompleted: false, streak: 0 },
  { id: "3", name: "小红", avatar: "👩‍🎨", todayCompleted: false, streak: 0 },
  { id: "4", name: "阿强", avatar: "👨‍🔧", todayCompleted: false, streak: 0 },
  { id: "5", name: "小李", avatar: "👨‍💼", todayCompleted: false, streak: 0 },
];

export const MAX_GOALS = 3;
