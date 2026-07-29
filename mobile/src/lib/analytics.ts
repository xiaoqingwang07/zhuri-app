import { APP_TOKEN, WORKER_URL } from "./config";
import { getDeviceId } from "./device";
import { kvGet, kvSet } from "./db";
import { todayStr } from "./dates";

/**
 * 极简埋点。
 *
 * 目的只有一个：知道用户卡在哪一步。没有这个，之后所有产品决策都是拍脑袋。
 *
 * 三条原则：
 *   1. 只记行为，不记内容。绝不上传目标名称、任务文本、照片、反馈原文 ——
 *      那些是用户的隐私，而且对漏斗分析毫无用处。
 *   2. 永不阻塞、永不报错。埋点挂了是我的问题，不该让用户感知到。
 *   3. 攒着批量发，别为了几个字节频繁唤醒网络。
 */

export type EventName =
  | "app_open"
  | "onboarding_done"
  | "goal_create_start"
  | "goal_create_success"
  | "goal_create_fallback"
  | "first_checkin"
  | "checkin"
  | "rescue_used"
  | "calibrate_used"
  | "photo_added"
  | "share_used"
  | "goal_completed"
  | "paywall_viewed";

interface QueuedEvent {
  name: EventName;
  ts: number;
  /** 只允许数字和短枚举，杜绝把用户内容带出去 */
  props?: Record<string, number | string>;
}

const QUEUE_KEY = "analytics_queue";
const FIRST_SEEN_KEY = "analytics_first_seen";
const LAST_FLUSH_KEY = "analytics_last_flush";
const MAX_QUEUE = 40;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

function readQueue(): QueuedEvent[] {
  try {
    const raw = kvGet(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: QueuedEvent[]): void {
  try {
    kvSet(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
  } catch {
    // 存不下就算了
  }
}

/** 首次使用的日期，用于算留存 */
export function firstSeenDate(): string {
  let d = kvGet(FIRST_SEEN_KEY);
  if (!d) {
    d = todayStr();
    kvSet(FIRST_SEEN_KEY, d);
  }
  return d;
}

/** 距首次使用的天数（第 0 天是当天） */
function dayIndex(): number {
  const first = new Date(`${firstSeenDate()}T00:00:00`).getTime();
  const today = new Date(`${todayStr()}T00:00:00`).getTime();
  return Math.max(0, Math.round((today - first) / 86400000));
}

export function track(name: EventName, props?: Record<string, number | string>): void {
  try {
    const queue = readQueue();
    queue.push({ name, ts: Date.now(), props });
    writeQueue(queue);
    // 队列积够了就顺手发一次，否则等下次启动或定时窗口
    if (queue.length >= 12) void flush();
  } catch {
    // 埋点永远不该影响主流程
  }
}

/** 只在同一天第一次触发，用于「首次打卡」这类里程碑 */
export function trackOnce(name: EventName, props?: Record<string, number | string>): void {
  const key = `analytics_once_${name}`;
  if (kvGet(key)) return;
  kvSet(key, "1");
  track(name, props);
}

export async function flush(force = false): Promise<void> {
  try {
    const last = Number(kvGet(LAST_FLUSH_KEY) || "0");
    if (!force && Date.now() - last < FLUSH_INTERVAL_MS) return;

    const queue = readQueue();
    if (queue.length === 0) return;

    // 先清本地再发：宁可丢一批，也不要因为发送失败反复堆积
    writeQueue([]);
    kvSet(LAST_FLUSH_KEY, String(Date.now()));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(`${WORKER_URL}/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": getDeviceId(),
          "x-app-token": APP_TOKEN,
        },
        body: JSON.stringify({
          events: queue,
          dayIndex: dayIndex(),
          firstSeen: firstSeenDate(),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 网络不通就算了，下次再说
  }
}

/** 每次冷启动调用：记录活跃 + 把攒下的事件发出去 */
export function trackAppOpen(): void {
  firstSeenDate();
  track("app_open", { day: dayIndex() });
  void flush(true);
}
