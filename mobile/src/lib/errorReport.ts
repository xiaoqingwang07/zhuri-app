import { APP_TOKEN, WORKER_URL } from "./config";
import { getDeviceId } from "./device";

/**
 * 错误上报。
 *
 * 在这之前，用户那边白屏、崩溃、AI 一直失败，我都无从知晓 ——
 * 只能等用户主动来说「不好用」，而大多数人不会说，直接卸载。
 *
 * 同样只报错误本身，不带任何用户内容。
 */

let reportedCount = 0;
/** 一次会话最多报这么多条，防止某个循环里的错误把接口打爆 */
const MAX_PER_SESSION = 8;

export async function reportError(
  error: unknown,
  context?: string
): Promise<void> {
  if (reportedCount >= MAX_PER_SESSION) return;
  reportedCount++;

  try {
    const err = error as Error;
    const message = String(err?.message || error || "unknown").slice(0, 300);
    const stack = String(err?.stack || "").slice(0, 1200);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      await fetch(`${WORKER_URL}/error`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": getDeviceId(),
          "x-app-token": APP_TOKEN,
        },
        body: JSON.stringify({ message, stack, context }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 上报失败本身绝不能再抛错
  }
}

/**
 * 挂上全局兜底：没被 catch 的异常至少留个记录。
 * 注意不阻断默认行为 —— 开发时仍要能看到红屏。
 */
export function installErrorReporting(): void {
  const g = globalThis as any;
  if (g.__zhuriErrorHandlerInstalled) return;
  g.__zhuriErrorHandlerInstalled = true;

  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    void reportError(error, isFatal ? "fatal" : "global");
    prev?.(error, isFatal);
  });
}
