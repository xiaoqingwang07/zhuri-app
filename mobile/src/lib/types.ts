export interface DayTask {
  day: number;
  date: string; // YYYY-MM-DD
  task: string;
  pages: string; // 量化指标
  type: string; // AI 可返回 100+ 种类型，保持开放
  completed: boolean;
  completedAt?: string;
  revived?: boolean; // 通过复活卡补救
  durationMinutes?: number;
  difficulty?: "easy" | "normal" | "hard";
  minimumTask?: string;
  challengeTask?: string;
  energy?: "light" | "steady" | "push";
  rescueNote?: string;
  proofUri?: string;
  proofSummary?: string;
  proofVerifiedAt?: string;
  focus?: string;
  rationale?: string;
  successCheck?: string;
  coachTip?: string;
  actualMinutes?: number;
  feedbackDifficulty?: "too_easy" | "just_right" | "too_hard";
  blocker?: string;
  adjustmentPreference?: "keep" | "lighter" | "harder";
  feedbackAt?: string;
}

export interface CheckInFeedback {
  actualMinutes: number;
  difficulty: "too_easy" | "just_right" | "too_hard";
  blocker?: string;
  adjustmentPreference: "keep" | "lighter" | "harder";
}

export interface GoalProfile {
  dailyMinutes: number;
  currentLevel: "beginner" | "some" | "advanced";
  pace: "gentle" | "steady" | "ambitious";
  weekdayMode: "same" | "weekend_more" | "workday_more";
}

export interface GoalAnalysis {
  domain: string;
  subject: string;
  expertiseAngle: string;
  successCriteria: string[];
  keyMilestones: string[];
  riskFactors: string[];
  coachStrategy: string;
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  daysRequired: number;
  unlockedAt?: string;
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
  createdAt: string;
  profile?: GoalProfile;
  analysis?: GoalAnalysis;
  /** AI 动态调整过的次数 */
  adjustCount?: number;
  lastAdjustedAt?: string;
}

export type PersonaId = "gentle" | "strict" | "rational";

export interface Persona {
  id: PersonaId;
  name: string;
  emoji: string;
  description: string;
  sample: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "gentle",
    name: "温柔鼓励",
    emoji: "🌸",
    description: "像好朋友一样，温暖地陪你坚持",
    sample: "今天也辛苦啦，还差一步就完成今日任务了，我陪你～",
  },
  {
    id: "strict",
    name: "毒舌教练",
    emoji: "🔥",
    description: "不留情面，用犀利的话推你前进",
    sample: "又想拖到明天？目标不会自己完成，现在就去做。",
  },
  {
    id: "rational",
    name: "数据理性",
    emoji: "📊",
    description: "用数据说话，理性分析你的进度",
    sample: "当前完成率 71%，落后计划 2 天，今日完成可回升至 76%。",
  },
];

export const BADGES: Badge[] = [
  { id: "starter", name: "初学者", emoji: "🌱", daysRequired: 3 },
  { id: "persistor", name: "坚持者", emoji: "🔥", daysRequired: 7 },
  { id: "advanced", name: "进阶者", emoji: "⭐", daysRequired: 14 },
  { id: "habit", name: "习惯养成", emoji: "🎯", daysRequired: 21 },
  { id: "champion", name: "王者归来", emoji: "🏆", daysRequired: 30 },
  { id: "legend", name: "长期主义", emoji: "💎", daysRequired: 60 },
];

export const MAX_GOALS_PRO = 12;
export const MAX_GOALS_FREE = 3;
export const FREE_AI_QUOTA_PER_MONTH = 30;

export interface GoalTemplate {
  id: string;
  emoji: string;
  title: string;
  goal: string;
  days: number;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { id: "reading", emoji: "📚", title: "读完一本书", goal: "读完《原则》这本书", days: 21 },
  { id: "running", emoji: "🏃", title: "跑步养成", goal: "养成跑步习惯，能连续跑5公里", days: 30 },
  { id: "english", emoji: "🗣️", title: "英语口语", goal: "每天练英语口语，能流利日常对话", days: 30 },
  { id: "earlybird", emoji: "🌅", title: "早起挑战", goal: "养成每天6:30早起的习惯", days: 21 },
  { id: "coding", emoji: "💻", title: "学习编程", goal: "学会Python基础，能写简单爬虫", days: 30 },
  { id: "meditation", emoji: "🧘", title: "冥想练习", goal: "养成每天冥想15分钟的习惯", days: 14 },
];

export const DEFAULT_GOAL_PROFILE: GoalProfile = {
  dailyMinutes: 30,
  currentLevel: "beginner",
  pace: "steady",
  weekdayMode: "same",
};
