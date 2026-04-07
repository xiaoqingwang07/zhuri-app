import { DayTask } from "./types";

const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";
const DEVICE_ID_KEY = "zhuri_device_id";
const CUSTOM_API_KEY_STORAGE = "zhuri_custom_api_key";
const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标和天数，你要生成最合理的每日任务计划。

【核心原则】
- 用户目标千变万化，不要套具体例子，而是根据目标类型和任务设计原则来生成
- 任务要具体、可测量、可执行、有挑战但不至于让人放弃
- 每天1-3个核心任务
- 任务从简单开始，逐渐增加难度
- 最后1-2天用于总结/回顾/缓冲

【输出格式】
返回纯JSON，无其他文字：
{
  "tasks": [
    {"day":1,"task":"具体任务描述（不超过20字）","pages":"量化指标或描述","type":"任务类型"}
  ]
}
day从1开始，天数与用户指定一致`;

export async function getDeviceIdAsync(): Promise<string> {
  const id = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getDeviceId(): string {
  return localStorage.getItem(DEVICE_ID_KEY) || "uninitialised";
}

function getCustomApiKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(CUSTOM_API_KEY_STORAGE) || null;
}

function parseTasks(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data.tasks) return data.tasks;
  if (data.days) return data.days;
  return [];
}

function mapToDayTask(t: any, index: number): DayTask {
  return {
    day: t.day || index + 1,
    date: new Date(Date.now() + index * 86400000).toISOString().split("T")[0],
    task: t.task || t.content || "计划进度中",
    pages: t.pages || "",
    type: t.type || "learn",
    completed: false,
  };
}

// P1-1: Call AI with user's custom key if provided, otherwise use built-in worker proxy
export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  signal?: AbortSignal
): Promise<DayTask[]> {
  const customKey = getCustomApiKey();

  if (customKey) {
    // P1-1: Use user's own API key directly (bypass worker proxy)
    const response = await fetch(SILICONFLOW_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `目标：${goal}\n总天数：${totalDays}天\n\n根据这个目标，生成${totalDays}天的每日任务计划，严格返回JSON。` },
        ],
        temperature: 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI 服务出错：${response.status} — ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      return parseTasks(parsed).map(mapToDayTask);
    } catch {
      throw new Error("AI 返回格式解析失败，请重试");
    }
  }

  // Default: use built-in worker proxy
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
    body: JSON.stringify({ goal, totalDays }),
    signal,
  });

  if (!response.ok) throw new Error("AI的大脑卡住了，请重试");

  const data = await response.json();
  return parseTasks(data).map(mapToDayTask);
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
