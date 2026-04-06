import { DayTask } from "./types";

const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";
const DEVICE_ID_KEY = "zhuri_device_id";
const IDB_DB_NAME = "zhuri_persist";
const IDB_STORE_NAME = "meta";

let _deviceIdCache: string | null = null;

async function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(req.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await openMetaDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await openMetaDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* silent fail */ }
}

export async function getDeviceIdAsync(): Promise<string> {
  if (typeof window === "undefined") return "server";
  if (_deviceIdCache) return _deviceIdCache;
  let id = await idbGet(DEVICE_ID_KEY);
  if (!id) id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) id = crypto.randomUUID();
  _deviceIdCache = id;
  await idbSet(DEVICE_ID_KEY, id);
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  // Sync fallback
  return _deviceIdCache || localStorage.getItem(DEVICE_ID_KEY) || "uninitialised";
}

/**
 * 核心升级：鲁棒的流式 JSON 解析器
 */
export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  signal?: AbortSignal
): Promise<DayTask[]> {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
    body: JSON.stringify({ goal, totalDays }),
    signal,
  });

  if (!response.ok) throw new Error("AI服务暂时不可用");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取AI响应流");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = ""; // 用于处理碎块的缓冲区
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    
    // 最后一行可能是不完整的，留给下一轮处理
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;
        try {
          const data = JSON.parse(dataStr);
          fullText += data.choices[0]?.delta?.content || "";
        } catch (e) { /* 忽略不完整的 JSON 块 */ }
      }
    }
  }

  // 清洗最终结果（去掉 AI 可能带出的 Markdown 标记）
  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    const rawJson = jsonMatch ? jsonMatch[0] : fullText;
    const data = JSON.parse(rawJson);
    const tasksData = data.tasks || data.days || (Array.isArray(data) ? data : []);
    
    return tasksData.map((t: any, index: number) => ({
      day: t.day || index + 1,
      date: new Date(Date.now() + index * 86400000).toISOString().split("T")[0],
      task: t.task || t.content || "执行目标",
      pages: t.pages || "",
      type: t.type || "other",
      completed: false,
    }));
  } catch (e) {
    console.error("Parse Error. Raw text:", fullText);
    throw new Error("AI生成的格式解析失败，请再试一次");
  }
}

export async function saveDataToCloud(data: any): Promise<boolean> {
  try {
    const response = await fetch(`${WORKER_URL}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (err) { return false; }
}

export async function loadDataFromCloud(): Promise<any> {
  try {
    const response = await fetch(`${WORKER_URL}/get`, {
      method: "GET",
      headers: { "x-device-id": getDeviceId() },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data && Object.keys(data).length > 0) ? data : null;
  } catch (err) { return null; }
}
