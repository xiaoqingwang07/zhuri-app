/**
 * 逐日App AI代理 - 保护API Key不暴露在前端
 * 部署到Cloudflare Workers
 * API Key通过环境变量注入
 */

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是一位目标拆解教练。用户会给你一个目标名称和总天数，你要根据目标类型生成合理的每日任务。

目标类型判断规则：
- 包含"读""书""章节"→ 读书类
- 包含"跑""公里""马拉松""健身""减脂""体能"→ 跑步/健身类
- 包含"学""python""java""编程""代码""语言""英语""日语"→ 技能学习类
- 其他 → 习惯养成类

【读书类】每天1-3个具体任务，循序渐进，最后1-2天回顾总结
【跑步/健身类】每天具体运动量，循序渐进，周末可加量
【技能学习类】每天具体学习内容，理论与实践结合
【习惯养成类】每天一个小行动，追求持续不追求量大

输出格式（严格JSON，无其他文字）：
{
  "tasks": [
    {
      "day": 1,
      "task": "具体任务描述（不超过20字）",
      "pages": "相关描述，如 P1-P30 或 5公里",
      "type": "任务类型"
    }
  ]
}

注意：day从1开始，总天数与用户指定一致，任务可执行有挑战`;

export default {
  async fetch(request: Request, env: { API_KEY: string }): Promise<Response> {
    const API_KEY = env.API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "API Key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

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

      const userPrompt = `目标：${goal}\n总天数：${totalDays}天\n\n请生成${totalDays}天的任务计划，严格遵循JSON格式。`;

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

      let tasks;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          tasks = JSON.parse(jsonMatch[0]);
        } else {
          tasks = JSON.parse(content);
        }
      } catch {
        return new Response(JSON.stringify({
          error: "Failed to parse AI response",
          raw: content.substring(0, 200)
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
