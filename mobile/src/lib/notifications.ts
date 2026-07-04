import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { fallbackCoachMessage } from "./ai";
import { kvGet, kvSet } from "./db";
import { addDays, parseDate, todayStr } from "./dates";
import { Goal, PersonaId } from "./types";
import { todayTaskIndex } from "./store";

/** 本地通知调度是纯原生能力，Web 平台（含 Expo Go 网页预览）没有对应实现 */
const NOTIFICATIONS_SUPPORTED = Platform.OS !== "web";

const REMINDER_HOUR_KEY = "reminder_hour";
const REMINDER_ENABLED_KEY = "reminder_enabled";
export const DEFAULT_REMINDER_HOUR = 21;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function getReminderHour(): number {
  const raw = kvGet(REMINDER_HOUR_KEY);
  return raw ? Number(raw) : DEFAULT_REMINDER_HOUR;
}

export function setReminderHour(hour: number): void {
  kvSet(REMINDER_HOUR_KEY, String(hour));
}

export function isReminderEnabled(): boolean {
  return kvGet(REMINDER_ENABLED_KEY) !== "0";
}

export function setReminderEnabled(enabled: boolean): void {
  kvSet(REMINDER_ENABLED_KEY, enabled ? "1" : "0");
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!NOTIFICATIONS_SUPPORTED) return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

/**
 * 滑动窗口式提醒：为未来 7 天各安排一条提醒。
 * 优先使用已缓存的 AI 督促文案（今日页会按天生成并缓存），否则用人格兜底文案。
 * 每次打开 App / 打卡 / 改设置时重新调度，窗口自动前移。
 */
export async function rescheduleReminders(
  persona: PersonaId,
  goals: Goal[]
): Promise<void> {
  if (!NOTIFICATIONS_SUPPORTED) return;
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!isReminderEnabled()) return;
  const activeGoals = goals.filter((g) => g.status === "active");
  if (activeGoals.length === 0) return;

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const hour = getReminderHour();
  const today = todayStr();
  const now = new Date();
  const primary = activeGoals[0];

  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(today, i);
    const fireDate = parseDate(dateStr);
    fireDate.setHours(hour, 0, 0, 0);
    if (fireDate.getTime() <= now.getTime()) continue;

    // 今天已打卡就不用再提醒今天
    if (i === 0) {
      const idx = todayTaskIndex(primary);
      if (idx === -1 || primary.tasks[idx]?.completed) continue;
    }

    const cachedAI = kvGet(`coach_${primary.id}_${dateStr}_${persona}`);
    const body = cachedAI || fallbackCoachMessage(persona, primary.name);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "逐日 · 今日任务待完成",
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  }
}
