import { DayTask } from "./types";

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

const API_KEY = "sk-vzalrqeohnovvgnkdacjlsfxyzrxobfjlhxcghuhfzlfszhq";
const API_URL = "https://api.siliconflow.cn/v1/chat/completions";
const MODEL = "deepseek-ai/DeepSeek-V3";

export async function generateTasksWithAI(
  goal: string,
  totalDays: number,
  signal?: AbortSignal
): Promise<DayTask[]> {
  const userPrompt = `目标：${goal}\n天数：${totalDays}天\n\n请生成${totalDays}天的每日阅读任务。确保：\n- 任务循序渐进\n- 涵盖全书主要内容\n- 最后1-2天用于回顾总结\n- 直接返回JSON，不要其他内容`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal, // P0-1: AbortController integration
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API错误: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("AI未返回有效内容");
  }

  // Parse JSON from response
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from the text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("AI返回内容格式错误");
    }
  }

  const tasksData = parsed.tasks || parsed.days || [];
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
