/**
 * 逐日App AI代理
 * 保护API Key，部署在Cloudflare Workers
 */

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标名称和总天数，你要根据这个目标的具体情况，生成最合理的每日任务计划。

【核心原则】
- 不要套模板！每个目标都要根据用户的具体描述来设计任务
- 用户可能是"3个月跑完半马"，也可能是"30天写完论文"，也可能是"养成早起习惯"
- 你的任务是理解用户的真实意图，设计他/她真正能执行的每日行动
- 任务要具体、可测量、有挑战但不至于让人放弃

【任务设计原则】
- 每天1-3个核心任务，不要堆砌
- 任务从简单开始，逐渐增加难度
- 留出休息日（每周至少1天）
- 最后留1-2天用于总复习/总结/缓冲

【任务类型标签】（根据实际内容选择，不要强行分类）
reading, workout, warmup, stretch, recovery, race, vocabulary, grammar, listening, speaking, writing, practice, project, review, meditation, sleep, habit, check, diet, calorie, tracking, preparation, instrument, music, art, drawing, painting, calligraphy, writing, creation, coding, debugging, learning, exam, finance, saving, organizing, declutter, parenting, childcare, work, presentation, communication, networking, planning, rest, celebration, other

【Few-shot示例】

示例1
用户：读完《人类简史》
天数：20天
{
  "tasks": [
    {"day": 1, "task": "阅读序言和第一章", "pages": "P1-P25", "type": "reading"},
    {"day": 2, "task": "阅读第二三章", "pages": "P26-P60", "type": "reading"},
    ...
    {"day": 19, "task": "快速回顾全书核心观点", "pages": "全部", "type": "review"},
    {"day": 20, "task": "整理读书笔记，写一篇读后感", "pages": "-", "type": "summary"}
  ]
}

示例2
用户：30天跑完半马
天数：30天
{
  "tasks": [
    {"day": 1, "task": "慢走+拉伸10分钟", "pages": "-", "type": "warmup"},
    {"day": 2, "task": "跑1公里，配速7-8分/公里", "pages": "1公里", "type": "workout"},
    {"day": 3, "task": "休息或瑜伽拉伸", "pages": "-", "type": "recovery"},
    ...
    {"day": 28, "task": "跑12公里，最后2公里降速", "pages": "12公里", "type": "workout"},
    {"day": 29, "task": "休息，轻度拉伸", "pages": "-", "type": "recovery"},
    {"day": 30, "task": "半马比赛日！", "pages": "21.0975公里", "type": "race"}
  ]
}

示例3
用户：30天养成早起习惯
天数：30天
{
  "tasks": [
    {"day": 1, "task": "比平时早睡15分钟", "pages": "-", "type": "habit"},
    {"day": 2, "task": "比平时早起15分钟", "pages": "6:45起床", "type": "habit"},
    ...
    {"day": 15, "task": "连续第14天早起，试试6:00", "pages": "6:00起床", "type": "habit"},
    ...
    {"day": 30, "task": "早起了！给自己一个小奖励", "pages": "-", "type": "celebration"}
  ]
}

示例4
用户：3个月准备PMP考试
天数：90天
{
  "tasks": [
    {"day": 1, "task": "了解PMP考试结构和章节分布", "pages": "考试大纲", "type": "learning"},
    {"day": 2, "task": "学习第一章：项目运行环境", "pages": "PMBOK Ch1", "type": "learning"},
    ...
    {"day": 45, "task": "做第一套模拟题，记录错题", "pages": "模拟题1", "type": "practice"},
    ...
    {"day": 75, "task": "二刷模拟题，正确率目标85%", "pages": "模拟题2", "type": "exam"},
    {"day": 90, "task": "考前最后一天，轻度复习即可，早点休息", "pages": "-", "type": "rest"}
  ]
}

示例5
用户：3个月小孩的早教启蒙
天数：90天
{
  "tasks": [
    {"day": 1, "task": "每天唱一首手指谣给宝宝", "pages": "-", "type": "activity"},
    {"day": 15, "task": "引入第一本绘本《棕色的熊》", "pages": "1本", "type": "reading"},
    {"day": 30, "task": "开始英语启蒙，听简单儿歌", "pages": "10分钟", "type": "listening"},
    ...
    {"day": 90, "task": "3个月早教完成！记录宝宝的成长变化", "pages": "-", "type": "journal"}
  ]
}

【输出要求】
- 返回纯JSON，不要有任何其他文字
- 所有字段必填
- day从1开始，总天数与用户指定一致
- 任务描述不超过20字
- 不要硬套模板，根据用户的具体目标和天数，设计最合理的任务分布`;

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

      const userPrompt = `目标：${goal}\n总天数：${totalDays}天\n\n请根据这个具体目标，生成${totalDays}天的每日任务计划。参考示例的格式，严格返回JSON。`;

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
          raw: content.substring(0, 300)
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
