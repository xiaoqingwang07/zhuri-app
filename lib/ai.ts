import { DayTask } from "./types";

/**
 * P0-1 Security Fix: API Key is NO LONGER hardcoded in frontend.
 * 
 * AI calls go through a proxy Worker to protect the key.
 * Worker URL must be set via the VITE_WORKER_URL environment variable.
 * 
 * To deploy your own worker:
 * 1. Create a free Cloudflare account
 * 2. Deploy the /worker directory using: npx wrangler deploy
 * 3. Set VITE_WORKER_URL=https://your-worker.your-subdomain.workers.dev in your .env
 */

// P0-1: Worker Proxy URL - protect your keys on the backend
const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";

/**
 * Get or create a persistent unique Device ID for cloud sync.
 * Stored in IndexedDB which survives localStorage/cache clears.
 * Falls back to localStorage as secondary storage.
 */
const DEVICE_ID_KEY = "zhuri_device_id";
const IDB_DB_NAME = "zhuri_persist";
const IDB_STORE_NAME = "meta";

// In-memory cache so we don't hit IDB on every request
let _deviceIdCache: string | null = null;

async function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

/** Async version — always returns a valid ID. Call this at app startup. */
export async function getDeviceIdAsync(): Promise<string> {
  if (typeof window === "undefined") return "server";
  if (_deviceIdCache) return _deviceIdCache;

  // 1. Try IndexedDB first (survives cache clears)
  let id = await idbGet(DEVICE_ID_KEY);

  // 2. Fall back to localStorage (for old users migrating)
  if (!id) id = localStorage.getItem(DEVICE_ID_KEY);

  // 3. Generate a new one
  if (!id) id = crypto.randomUUID();

  // Persist in both storages for redundancy
  _deviceIdCache = id;
  await idbSet(DEVICE_ID_KEY, id);
  localStorage.setItem(DEVICE_ID_KEY, id);

  return id;
}

/** Sync version — uses in-memory cache, initialised by getDeviceIdAsync() */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  if (_deviceIdCache) return _deviceIdCache;
  // Last-resort sync fallback (pre-init path)
  const id = localStorage.getItem(DEVICE_ID_KEY) ?? "uninitialised";
  return id;
}

/**
 * AI: Generate tasks for a goal
 */
export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  signal?: AbortSignal
): Promise<DayTask[]> {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": getDeviceId(),
    },
    body: JSON.stringify({ goal, totalDays }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI服务暂时不可用 (${response.status})`);
  }

  const data = await response.json();
  if (data.error) throw new Error(`AI服务异常: ${data.error}`);

  const tasksData = data.tasks || data.days || [];
  const tasks: DayTask[] = tasksData.map((t: any, index: number) => {
    const date = new Date();
    date.setDate(date.getDate() + index);

    return {
      day: t.day || index + 1,
      date: date.toISOString().split("T")[0],
      task: t.task || t.content || "",
      pages: t.pages || "",
      type: t.type || "reading",
      completed: false,
    };
  });

  return tasks;
}

/**
 * CLOUD: Sync current goals/data to Cloudflare KV
 */
export async function saveDataToCloud(data: any): Promise<boolean> {
  try {
    const response = await fetch(`${WORKER_URL}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": getDeviceId(),
      },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (err) {
    console.error("Cloud sync failed:", err);
    return false;
  }
}

/**
 * CLOUD: Load goals/data from Cloudflare KV
 */
export async function loadDataFromCloud(): Promise<any> {
  try {
    const response = await fetch(`${WORKER_URL}/get`, {
      method: "GET",
      headers: {
        "x-device-id": getDeviceId(),
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data && Object.keys(data).length > 0) ? data : null;
  } catch (err) {
    console.error("Cloud loading failed:", err);
    return null;
  }
}
