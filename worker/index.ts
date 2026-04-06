/**
 * 逐日App AI代理 - 100+任务类型全覆盖
 */

// Type shim for Cloudflare KV — only used during local TS builds.
// At runtime Cloudflare injects the real KVNamespace automatically.
declare interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  delete(key: string): Promise<void>;
}

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标和天数，你要生成最合理的每日任务。

【核心原则】
- 用户目标千变万化，不要套具体例子，而是根据目标类型和任务设计原则来生成
- 任务要具体、可测量、可执行、有挑战但不至于让人放弃
- 每天1-3个核心任务
- 任务从简单开始，逐渐增加难度
- 每周留1-2天休息或轻松任务
- 最后1-2天用于总结/回顾/缓冲

【100种任务类型】

1. reading - 阅读（读多少页/章节）
2. notes - 做笔记（划重点/写感想/摘录）
3. review - 复习回顾（回顾知识点/章节）
4. summary - 总结输出（写读后感/整理框架）
5. vocabulary - 背单词（多少个/复习多少）
6. grammar - 学语法（语法点/练习题）
7. listening - 听力训练（听多少分钟/什么材料）
8. speaking - 口语练习（跟读/录音/对话）
9. writing - 写作（写多少字/什么主题）
10. practice - 技能练习（练习什么/多少遍）
11. warmup - 热身（运动前热身/练习前准备）
12. workout - 正式运动（跑步/力量/具体量）
13. stretch - 拉伸放松（多少分钟/哪些部位）
14. recovery - 恢复休息（休息日/轻运动）
15. race - 比赛/测试（检验成果）
16. learn - 新知识学习（学什么/学几节）
17. project - 项目实践（做什么项目/完成什么）
18. coding - 编程开发（写多少代码/完成什么功能）
19. debugging - 调试修复（修什么bug/测试什么）
20. design - 设计（UI设计/架构设计/方案设计）
21. planning - 规划（定计划/列清单/做方案）
22. research - 调研（调研什么/怎么看/总结什么）
23. organization - 整理（整理什么/断舍离什么）
24. declutter - 收纳（收拾什么区域/归类什么）
25. cleaning - 清洁打扫（打扫哪里/深度清洁什么）
26. cooking - 烹饪做饭（做什么菜/学什么食谱）
27. diet - 饮食控制（吃什么/不吃什么/热量控制）
28. calorie - 热量记录（记录三餐/算热量）
29. meal - 备餐（准备什么/meal prep）
30. tracking - 数据追踪（记什么数据/怎么记）
31. meditation - 冥想（多少分钟/什么方法）
32. mindfulness - 正念练习（关注什么/练习什么）
33. breathing - 呼吸练习（腹式呼吸/多少分钟）
34. journal - 日记/反思（写什么/反思什么）
35. habit - 习惯养成（做什么微行动/坚持什么）
36. check - 检查打卡（检查完成情况/打钩确认）
37. celebration - 庆祝奖励（给自己什么奖励）
38. rest - 充分休息（怎么休息/做什么放松）
39. sleep - 睡眠管理（几点睡/睡前做什么）
40. wakeup - 起床习惯（几点起/起床后做什么）
41. instrument - 乐器练习（练什么/多少遍/多少分钟）
42. scales - 音阶练习（大小调音阶/多少遍）
43. repertoire - 曲目练习（练什么曲子/练什么段落）
44. theory - 乐理学习（学什么知识点）
45. performance - 表演练习（排练/表演什么）
46. drawing - 素描练习（画什么/临摹什么）
47. painting - 油画/水彩（画什么主题/什么技法）
48. sketching - 速写/手绘（写生什么/画什么）
49. color - 色彩练习（配色练习/临摹什么）
50. anatomy - 人体结构（学习解剖/画什么）
51. reference - 参考研究（研究什么参考图/分析什么）
52. creation - 创作（创作什么/完成什么作品）
53. photography - 摄影（拍什么主题/练习什么技法）
54. editing - 修图/剪辑（调色/剪辑/修哪些片）
55. equipment - 器材学习（学什么设备/怎么用）
56. vocabulary - 词汇积累（背什么词/多少个）
57. listening - 听力输入（听什么/听多少）
58. speaking - 口语输出（说什么/练什么话题）
59. reading - 阅读输入（读什么材料/读多少）
60. writing - 写作输出（写什么/写多少字）
61. translation - 翻译练习（翻译什么/中译英还是英译中）
62. exam - 应试做题（做什么题/做多少道）
63. mock - 模拟考试（全真模拟/限时做）
64. review - 错题回顾（回顾什么错题/分析错因）
65. memory - 记忆宫殿（记忆什么内容/用什么方法）
66. speed - 速度训练（限时练习/提速目标）
67. accuracy - 准确率训练（正确率目标/纠错练习）
68. networking - 人脉拓展（联系谁/做什么社交）
69. presentation - 演讲汇报（练习什么演讲/对谁讲）
70. communication - 沟通技巧（练习什么沟通场景）
71. negotiation - 谈判协商（准备什么谈判/预设方案）
72. leadership - 领导力（做什么领导力行动）
73. time - 时间管理（做时间记录/分析时间分配）
74. productivity - 效率提升（用什么方法/提升什么效率）
75. planning - 计划制定（做什么计划/计划什么）
76. finance - 财务知识（学什么财务知识/读什么）
77. investing - 投资实践（学什么投资/做什么投资）
78. saving - 存钱计划（存多少/怎么存）
79. budgeting - 预算管理（做预算/控制支出）
80. accounting - 记账习惯（记什么账/怎么记）
81. tax - 税务规划（了解什么税务/做什么筹划）
82. legal - 法律常识（学什么法律/了解什么权益）
83. parenting - 育儿（陪孩子做什么/育儿方法）
84. childcare - 儿童护理（照顾孩子什么/健康护理）
85. education - 启蒙教育（教什么/怎么教）
86. reading_child - 亲子共读（读什么绘本/讲什么故事）
87. play - 亲子游戏（玩什么游戏/互动什么）
88. growth - 成长记录（记录什么/怎么记录）
89. volunteering - 志愿服务（做什么志愿/服务什么）
90. social - 社交练习（做什么社交/联系谁）
91. public_speaking - 公众表达（练习什么演讲/对多少人讲）
92. confidence - 自信建设（做什么练习/克服什么恐惧）
93. creativity - 创造力培养（做什么创意练习/突破什么）
94. problem - 问题解决（解决什么问题/用什么方法）
95. decision - 决策练习（做什么决定/用什么决策框架）
96. critical - 批判思维（分析什么/用什么思维模型）
97. goal - 目标管理（回顾目标/调整计划）
98. gratitude - 感恩练习（感谢谁/做什么感恩行动）
99. selfcare - 自我关爱（做什么让自己开心/怎么犒劳自己）
100. other - 其他（自定义任务）

【任务设计模板】

根据用户目标类型，选择合适的任务类型组合：

【读书类 → reading + notes + review + summary】
每天读一定页数，做笔记，最后总结

【运动类 → warmup + workout + stretch + recovery + race】
热身 → 正式运动 → 拉伸 → 休息 → 测试成果

【学习类 → learn + practice + review + exam】
学新知识 → 练习 → 复习 → 考试检验

【习惯类 → habit + check + celebration + rest】
微行动 → 打卡确认 → 奖励 → 休息

【项目类 → planning + learn + coding/design + practice + review】
规划 → 学技能 → 实践 → 练习 → 回顾

【备考类 → learn + practice + review + mock + exam】
学知识点 → 做题 → 错题回顾 → 模拟 → 正式考试

【创作类 → reference + sketching + creation + editing + final】
研究参考 → 草图 → 创作 → 修改 → 定稿

【语言类 → vocabulary + listening + speaking + reading + writing】
背单词 → 听力 → 口语 → 阅读 → 写作

【理财类 → tracking + budgeting + saving + investing + review】
记账 → 预算 → 存钱 → 投资 → 复盘

【社交类 → networking + communication + relationship + event】
拓展人脉 → 沟通练习 → 关系维护 → 参加活动

【输出格式】
返回纯JSON，无其他文字：
{
  "tasks": [
    {"day":1,"task":"具体任务描述（不超过20字）","pages":"量化指标或描述","type":"任务类型"}
  ]
}
day从1开始，天数与用户指定一致`;

export default {
  async fetch(request: Request, env: { API_KEY: string; ZHURI_DB: KVNamespace }): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS Headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-device-id",
    };

    // Handle Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const deviceId = request.headers.get("x-device-id");

    // --- Endpoint: Sync Data (Save) ---
    if (url.pathname === "/sync" && (request.method === "POST" || request.method === "PUT")) {
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "Missing x-device-id header" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      try {
        const data = await request.text();
        // Validation: Expecting JSON string
        JSON.parse(data); 
        await env.ZHURI_DB.put(`user:${deviceId}`, data, {
          metadata: { updatedAt: new Date().toISOString() }
        });
        return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString() }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: "Invalid data format or KV error" }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    // --- Endpoint: Load Data (Get) ---
    if (url.pathname === "/get" && request.method === "GET") {
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "Missing x-device-id header" }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      const data = await env.ZHURI_DB.get(`user:${deviceId}`);
      return new Response(data || "{}", { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // --- Endpoint: AI Generate (Default) ---
    const API_KEY = env.API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "API Key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const { goal, totalDays } = body as { goal: string; totalDays: number };

      if (!goal || !totalDays) {
        return new Response(JSON.stringify({ error: "Missing goal or totalDays" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userPrompt = `目标：${goal}\n总天数：${totalDays}天\n\n根据这个目标，选择合适的任务类型组合，生成${totalDays}天的每日任务计划，严格返回JSON。`;

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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(tasks), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
