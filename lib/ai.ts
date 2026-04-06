import { DayTask } from "./types";

const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";
const DEVICE_ID_KEY = "zhuri_device_id";

export async function getDeviceIdAsync(): Promise<string> {
  const id = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceId(): string {
  return localStorage.getItem(DEVICE_ID_KEY) || "uninitialised";
}

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

  if (!response.ok) throw new Error("AI的大脑卡住了，请重试");

  const data = await response.json();
  let tasksData = [];
  if (Array.isArray(data)) {
    tasksData = data;
  } else if (data.tasks) {
    tasksData = data.tasks;
  } else if (data.days) {
    tasksData = data.days;
  }

  return tasksData.map((t: any, index: number) => ({
    day: t.day || index + 1,
    date: new Date(Date.now() + index * 86400000).toISOString().split("T")[0],
    task: t.task || t.content || "计划进度中",
    pages: t.pages || "",
    type: t.type || "learn",
    completed: false,
  }));
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
