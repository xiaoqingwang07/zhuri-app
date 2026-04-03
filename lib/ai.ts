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

const WORKER_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";

const SYSTEM_PROMPT = `你是一位专业的阅读教练，擅长将大目标拆解为每日可执行的任务。

你需要根据用户提供的目标，生成循序渐进的每日阅读任务。

要求：
1. 每天1-3个具体任务
2. 任务从易到难，循序渐进
3. 估算合理的页数范围
4. 最后留1-2天用于全书回顾和总结
5. 输出必须是有效的JSON数组

输出格式：
{
  "tasks": [
    {
      "day": 1,
      "task": "具体任务描述",
      "pages": "P1-P30",
      "type": "reading" | "notes" | "review" | "summary"
    }
  ]
}`;

export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  signal?: AbortSignal
): Promise<DayTask[]> {
  // P0-1: Use worker proxy - key is protected on the backend
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ goal, totalDays }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI服务暂时不可用，请稍后重试 (${response.status})`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`AI服务暂时不可用: ${data.error}`);
  }

  // Parse the tasks from worker response
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
