/**
 * 逐日App AI代理 - 保护API Key不暴露在前端
 * 部署到Cloudflare Workers
 */

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是一个目标拆解助手。用户会给你一个目标名称和总天数，你要把这个目标拆成每天的小任务。

输出格式要求（严格遵循）：
- days: 总天数
- tasks: 数组，每个任务包含：
  - day: 第几天
  - task: 任务描述（不超过20字）
  - type: "reading" | "notes" | "review" | "summary"
  - pages: 页码范围，如 "P1-P15"

请根据目标类型（读书/跑步/技能/习惯）生成合理的任务分布。
返回纯JSON，不要有其他内容。`;

export default {
  async fetch(request: Request, env: { API_KEY: string }): Promise<Response> {
    const API_KEY = env.API_KEY;
    // Only allow POST
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { goal, totalDays } = body as { goal: string; totalDays: number };

      if (!goal || !totalDays) {
        return new Response(JSON.stringify({ error: "Missing goal or totalDays" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Determine goal type for context
      let goalType = "general";
      if (goal.includes("读") || goal.includes("书")) goalType = "reading";
      else if (goal.includes("跑") || goal.includes("公里")) goalType = "running";
      else if (goal.includes("学") || goal.includes("技能")) goalType = "skill";
      else if (goal.includes("习惯")) goalType = "habit";

      const userPrompt = `目标：${goal}\n总天数：${totalDays}天\n目标类型：${goalType}\n\n请生成${totalDays}天的任务计划，严格遵循JSON格式。`;

      // Call Siliconflow API
      const response = await fetch(SILICONFLOW_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-V3",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: "AI API error", details: errorText }), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      // Extract JSON from response
      let tasks;
      try {
        // Try to find JSON in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          tasks = JSON.parse(jsonMatch[0]);
        } else {
          tasks = JSON.parse(content);
        }
      } catch (parseError) {
        // If parsing fails, return error
        return new Response(JSON.stringify({ 
          error: "Failed to parse AI response",
          raw: content 
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(tasks), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
