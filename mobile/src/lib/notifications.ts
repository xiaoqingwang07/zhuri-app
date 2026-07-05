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
const TODAY_NUDGE_OFFSETS_MIN = [0, 70, 150, 240];
const FUTURE_WINDOW_DAYS = 7;

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
 * 滑动窗口式提醒：
 * - 今天未完成时，安排一组递进提醒，直到用户完成任务后重新调度并取消。
 * - 未来 7 天各安排一条提醒，保证用户不打开 App 也会被拉回来。
 * 优先使用已缓存的 AI 督促文案（今日页会按天生成并缓存），否则用人格兜底文案。
 * 每次打开 App / 打卡 / 改设置时重新调度，窗口自动前移。
 *
 * iOS 不允许 App 禁止用户手动清除通知；这里通过“未完成前多次提醒，完成后停止”
 * 来实现接近的绑定效果。
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
  const unfinishedToday = activeGoals
    .map((goal) => {
      const idx = todayTaskIndex(goal);
      return { goal, idx, task: idx === -1 ? null : goal.tasks[idx] };
    })
    .filter((item) => item.task && !item.task.completed);
  const primary = unfinishedToday[0]?.goal || activeGoals[0];

  const notificationBody = (dateStr: string) => {
    const cachedAI = kvGet(`coach_${primary.id}_${dateStr}_${persona}`);
    const base = cachedAI || fallbackCoachMessage(persona, primary.name);
    const extra =
      unfinishedToday.length > 1
        ? ` 还有 ${unfinishedToday.length} 个目标没收尾。`
        : "";
    return `${base}${extra}`;
  };

  if (unfinishedToday.length > 0) {
    const firstFire = new Date();
    firstFire.setHours(hour, 0, 0, 0);
    const baseTime =
      firstFire.getTime() > now.getTime()
        ? firstFire.getTime()
        : now.getTime() + 5 * 60 * 1000;

    for (const offset of TODAY_NUDGE_OFFSETS_MIN) {
      const fireDate = new Date(baseTime + offset * 60 * 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: offset === 0 ? "逐日 · 今天还没接住" : "逐日 · 别让今天断掉",
          body: notificationBody(today),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        },
      });
    }
  }

  for (let i = 1; i < FUTURE_WINDOW_DAYS; i++) {
    const dateStr = addDays(today, i);
    const fireDate = parseDate(dateStr);
    fireDate.setHours(hour, 0, 0, 0);
    if (fireDate.getTime() <= now.getTime()) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "逐日 · 明天也别断",
        body: notificationBody(dateStr),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  }
}
