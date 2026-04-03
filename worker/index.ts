/**
 * 逐日App AI代理
 * 保护API Key，部署在Cloudflare Workers
 */

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标名称和总天数，你要根据目标类型生成合理的每日任务。

【目标类型判断规则】
按关键词判断类型（按优先级）：
1. 包含"读""书""章节""阅读" → 读书类
2. 包含"跑""公里""马拉松""健身""减脂""体能""瑜伽""拉伸""运动""HIIT" → 运动健身类
3. 包含"学""python""java""编程""代码""语言""英语""日语""韩语""德语""法语""背单词""词汇""雅思""托福""GRE""GMAT""考研" → 语言学习类
4. 包含"早起""早睡""作息""睡眠""习惯养成" → 作息调整类
5. 包含"冥想""正念""禅""放松""压力""焦虑""心理""心理健康" → 心理冥想类
6. 包含"减脂""减肥""瘦身""体重""饮食""控糖""低碳""轻断食""热量" → 饮食控制类
7. 包含"乐器""吉他""钢琴""架子鼓""小提琴""笛子""音乐""练琴""唱歌""声乐" → 乐器练习类
8. 包含"画画""绘画""素描""油画""水彩""板绘""插画""手绘""书法""练字" → 艺术创作类
9. 包含"写作""写书""小说""文章""日更""创作""文笔""博客""公众号""内容创作" → 写作创作类
10. 包含"编程""开发""网站""App""前端""后端""全栈""算法""刷题""LeetCode""项目""实战" → 技术编程类
11. 包含"考证""考试""CPA"" CFA ""司法""医师""教资""公务员""建造师""PMP""CFA""FRM""执照" → 备考考证类
12. 包含"理财""存钱""储蓄""投资""基金""股票""财务自由""记账""预算""还债""存钱计划" → 财务理财类
13. 包含"断舍离""整理""收纳""极简""家居""清洁""打扫""收纳" → 生活整理类
14. 包含"亲子""育儿""陪孩子""教育""阅读启蒙""数学启蒙""英语启蒙""早教" → 亲子教育类
15. 包含"工作""职场""PPT""演讲""沟通""汇报""管理""领导力""效率""时间管理""OKR""KPI""晋升" → 职场提升类
16. 包含"考证""考试""期末""中考""高考""中考""高考""一模""二模""复习""备考""刷题""错题" → 学生备考类
17. 其他 → 习惯养成类

【各类型任务设计原则】

【读书类】
- 每天1-3个具体任务（读多少页/章节/做什么笔记）
- 循序渐进，最后1-2天回顾总结
- type: reading/notes/review/summary

【运动健身类】
- 每天具体运动量（公里数/时长/组数/重量）
- 循序渐进，热身和拉伸不可少
- 周末可适当加量
- type: workout/warmup/stretch/recovery/race

【语言学习类】
- 每天具体学习量（单词数/语法点/听力时长/口语练习）
- 听说读写均衡安排
- 定期复习（艾宾浩斯记忆曲线）
- type: vocabulary/grammar/listening/speaking/reading/writing/review

【作息调整类】
- 每天微调（早睡/早起5-15分钟）
- 配合睡前仪式（不看手机、泡脚等）
- type: sleep/wakeup/habit/routine

【心理冥想类】
- 每天5-30分钟冥想/正念练习
- 配合情绪记录
- type: meditation/journal/mindfulness/rest/breathing

【饮食控制类】
- 每天具体饮食目标（热量/碳水/蛋白质）
- 记录饮食内容
- type: diet/calorie/tracking/meal/preparation

【乐器练习类】
- 每天练习时长和内容（音阶/曲子/练习曲）
- 循序渐进，从简单开始
- type: practice/warmup/scales/repertoire/theory

【艺术创作类】
- 每天练习内容（临摹/写生/创作）
- 保持创作节奏
- type: practice/sketch/creation/reference/study

【写作创作类】
- 每天写作量（字数/篇数）
- 话题或自由写作
- type: writing/editing/revision/research/reading/planning

【技术编程类】
- 每天学习内容（知识点/章节/练习题）
- 项目驱动，边学边做
- type: learn/practice/project/review/debug/refactor

【备考考证类】
- 每天学习章节/知识点/题量
- 配合做题和错题回顾
- type: learn/practice/review/mock/exam/rest

【财务理财类】
- 每天/每周记账
- 储蓄计划执行
- type: tracking/saving/investing/budget/review

【生活整理类】
- 每天整理一个小区域
- 断舍离记录
- type: organize/declutter/clean/maintenance

【亲子教育类】
- 每天亲子互动内容
- 记录孩子成长
- type: activity/reading/play/learning/journal

【职场提升类】
- 每天一个具体行动（学一个知识点/做一个任务）
- 碎片化学习
- type: learn/practice/presentation/communication/networking/rest

【学生备考类】
- 每天学习计划（章节/知识点/题量）
- 配合复习和休息
- type: learn/practice/review/mock/exam/rest/sleep

【习惯养成类】
- 每天一个小行动（具体可测量）
- 追求持续，不追求量大
- type: habit/check/journal/celebrate/rest

【通用格式要求】
- 返回纯JSON，不要有任何其他文字
- 所有字段必填
- day从1开始，总天数与用户指定一致
- 任务描述不超过20字
- 确保任务可执行、有挑战但不至于无法完成

【输出格式】
{
  "tasks": [
    {
      "day": 1,
      "task": "具体任务描述（不超过20字）",
      "pages": "相关描述或量化指标",
      "type": "任务类型（参考上方类型列表）"
    }
  ]
}`;

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
