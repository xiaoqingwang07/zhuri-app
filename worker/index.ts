/**
 * 逐日 AI 代理 Worker
 *
 * 端点：
 *   POST /        AI 拆解目标（100+ 任务类型）
 *   POST /adjust  AI 动态调整（落后重排剩余计划）
 *   POST /coach   AI 督促文案（按人格生成）
 *   POST /review  每周 AI 复盘
 *   POST /sync    云端备份（KV，按 device-id）
 *   GET  /get     恢复备份
 *
 * 安全：
 *   - 所有 AI 端点按 device-id 每日限流（KV 计数）
 *   - 可选 RevenueCat 订阅校验（配置 RC_API_KEY 后启用，Pro 用户享有更高限额）
 */

declare interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  API_KEY: string;
  ZHURI_DB: KVNamespace;
  /** 与 App 端 config.APP_TOKEN 一致，用于挡住随意刷接口 */
  APP_TOKEN?: string;
  /** 可选：RevenueCat secret API key，配置后启用订阅校验 */
  RC_API_KEY?: string;
}

// 用户密钥为 MiniMax Token Plan（sk-cp- 前缀），走官方 OpenAI 兼容端点
const LLM_API_URL = "https://api.minimaxi.com/v1/chat/completions";
const MODEL = "MiniMax-M3";

const FREE_DAILY_LIMIT = 10;
const PRO_DAILY_LIMIT = 100;

const ALLOWED_ORIGINS = new Set([
  "https://xiaoqingwang07.github.io",
  "http://localhost:3000",
  "http://localhost:8081",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://xiaoqingwang07.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-device-id, x-app-token",
    Vary: "Origin",
  };
}

const GENERATE_SYSTEM_PROMPT = `你是「逐日」的领域陪练教练，不是通用清单生成器。用户给出目标后，你必须先像该领域专家一样理解目标，再拆成每天可执行的训练计划。

【绝对要求】
- 先诊断目标所属领域、目标对象、成功标准、关键里程碑、主要风险和陪练策略，再生成每日任务
- 每个目标都要有对象感。不要把「读《红楼梦》」「读《马斯克传》」「跑5公里」「做一个App」「备考」「练口语」拆成同一种模板
- 任务必须体现领域知识：阅读要结合书的主题/人物/章节/论证结构；运动要体现基线、渐进负荷、恢复和测试；项目要体现MVP、架构、实现、测试、发布；语言要体现输入、跟读、输出、纠音；备考要体现考纲、题型、错因、模拟；创作要体现参考、技法、产出、反馈
- 如果你不确定目标对象的具体内容，不要编造细节。前1-2天应安排建立资料、目录扫描、基线测试或样例分析，再进入专项计划
- 必须先判断目标规模是否匹配用户可投入时间；如果明显不现实，不要硬拆成虚假的每日任务，要把目标降级成可完成的第一阶段、重点章节、导读版或MVP
- 对超大目标（如几天读完大型全集、短期从零完成高强度挑战）要诚实压缩范围，不要安排一天读完多本书这种计划
- 每天1-3个核心动作，任务要具体、可测量、可执行、有挑战但不至于让人放弃
- 每天必须有「最低完成版」，让用户忙/累/拖延时也能不断档
- 根据用户每天可投入时间、基础水平和节奏偏好调整强度
- 任务从简单开始，逐渐增加难度；中间安排轻任务/复盘/恢复；最后1-2天用于总结、验收或缓冲

【任务类型】
根据目标选择合适的任务类型标识（英文小写），例如：
reading notes review summary vocabulary listening speaking writing practice warmup workout stretch recovery race learn project coding debugging design planning research cooking diet tracking meditation journal habit sleep instrument drawing creation photography exam mock networking finance selfcare other

【输出格式】
返回纯JSON，无其他文字：
{
  "analysis": {
    "domain": "目标领域，如阅读理解/运动训练/项目开发/语言训练",
    "subject": "目标对象，如红楼梦/5公里跑/英语口语/个人网站",
    "expertiseAngle": "你作为该领域教练如何理解这个目标，必须具体",
    "successCriteria": ["可验收成功标准1", "可验收成功标准2", "可验收成功标准3"],
    "keyMilestones": ["关键里程碑1", "关键里程碑2", "关键里程碑3"],
    "riskFactors": ["最可能失败的原因1", "最可能失败的原因2"],
    "coachStrategy": "整体陪练策略，不超过60字"
  },
  "tasks": [
    {
      "day":1,
      "task":"标准任务（不超过22字，必须目标专属）",
      "pages":"量化指标或描述",
      "type":"任务类型",
      "durationMinutes":30,
      "difficulty":"easy|normal|hard",
      "minimumTask":"最低完成版（不超过18字）",
      "challengeTask":"状态好时的挑战版（不超过24字）",
      "energy":"light|steady|push",
      "focus":"当天专项重点（不超过18字）",
      "rationale":"为什么今天这样安排（不超过36字）",
      "successCheck":"今天完成的验收标准（不超过30字）",
      "coachTip":"该领域教练提醒（不超过32字）"
    }
  ]
}
day从1开始，tasks天数必须与用户指定一致`;

const ADJUST_SYSTEM_PROMPT = `你是目标执行教练。用户的目标执行落后了，你要把他剩余的任务重新编排，帮他回到正轨。

【核心原则】
- 保持目标不变，把未完成的任务内容合理压缩、合并、重排到剩余天数里
- 前几天安排轻松一点的任务，帮用户找回状态（这是关键：让他重新上手，而不是被吓跑）
- 用户不是失败了，只是掉队了；语气要像救援陪跑，不要羞辱或制造负罪感
- rescueMode=relaxed 时降低强度、允许更多轻任务；steady 时保持原节奏；sprint 时合并低价值任务、提高强度但不能过载
- 不要简单地把旧任务顺延，要真正重新设计节奏
- 任务总量可以适度精简（砍掉不关键的），确保剩余计划可完成
- 天数与用户指定的剩余天数一致

【输出格式】
返回纯JSON，无其他文字：
{
  "message": "一句给用户的鼓励话，说明你是怎么调整的（不超过40字）",
  "tasks": [
    {
      "day":1,
      "task":"具体任务描述（不超过20字）",
      "pages":"量化指标",
      "type":"任务类型",
      "durationMinutes":30,
      "difficulty":"easy|normal|hard",
      "minimumTask":"最低完成版（不超过18字）",
      "challengeTask":"状态好时的挑战版（不超过24字）",
      "energy":"light|steady|push",
      "rescueNote":"为什么这样调（不超过20字）"
    }
  ]
}`;

const COACH_PERSONAS: Record<string, string> = {
  gentle: "你是温柔体贴的好朋友，说话温暖、有共情、带一点可爱，让人感到被支持。",
  strict: "你是毒舌但真心为学员好的教练，说话犀利、直接、一针见血，用激将法推人行动，但不侮辱人格。",
  rational: "你是数据驱动的理性教练，说话简洁精确，用数字和事实说话，给出明确的行动指令。",
};

const REVIEW_SYSTEM_PROMPT = `你是目标执行教练，为用户生成每周执行复盘。基于用户提供的数据，输出简洁有洞察的复盘。

【输出格式】
返回纯JSON，无其他文字：
{
  "summary": "本周整体执行情况总结（60字以内，有温度、有数据）",
  "highlights": ["本周做得好的地方，1-3条，每条20字以内"],
  "suggestions": ["下周具体可执行的建议，1-3条，每条25字以内"]
}`;

function json(data: unknown, status = 200, request?: Request): Response {
  const headers = request ? corsHeaders(request) : {
    "Access-Control-Allow-Origin": "https://xiaoqingwang07.github.io",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-device-id, x-app-token",
  };
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function requireAppToken(request: Request, env: Env): Response | null {
  const expected = env.APP_TOKEN;
  if (!expected) return null; // 未配置时兼容旧部署，上线务必配置
  const token = request.headers.get("x-app-token");
  if (token !== expected) {
    return json({ error: "Unauthorized", code: "bad_token" }, 401, request);
  }
  return null;
}

/** 每日限流：返回 null 表示放行，否则返回错误响应 */
async function rateLimit(
  env: Env,
  deviceId: string | null,
  request: Request
): Promise<Response | null> {
  if (!deviceId) return json({ error: "Missing x-device-id header" }, 400, request);

  const today = new Date().toISOString().split("T")[0];
  const key = `rl:${deviceId}:${today}`;
  const count = Number((await env.ZHURI_DB.get(key)) || "0");

  const pro = await isProUser(env, deviceId);
  const limit = pro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (count >= limit) {
    return json(
      { error: "今日 AI 次数已达上限，明天再来吧", code: "rate_limited" },
      429,
      request
    );
  }
  await env.ZHURI_DB.put(key, String(count + 1), { expirationTtl: 172800 });
  return null;
}

/** RevenueCat 订阅校验（可选，未配置 RC_API_KEY 时跳过，结果缓存 1 小时） */
async function isProUser(env: Env, deviceId: string): Promise<boolean> {
  if (!env.RC_API_KEY) return false;
  const cacheKey = `pro:${deviceId}`;
  const cached = await env.ZHURI_DB.get(cacheKey);
  if (cached !== null) return cached === "1";

  let pro = false;
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`,
      { headers: { Authorization: `Bearer ${env.RC_API_KEY}` } }
    );
    if (res.ok) {
      const data: any = await res.json();
      const entitlements = data?.subscriber?.entitlements || {};
      const proEnt = entitlements.pro;
      pro = !!proEnt && (!proEnt.expires_date || new Date(proEnt.expires_date) > new Date());
    }
  } catch {
    // 校验失败按免费处理
  }
  await env.ZHURI_DB.put(cacheKey, pro ? "1" : "0", { expirationTtl: 3600 });
  return pro;
}

async function callLLM(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  maxTokens = 8192
): Promise<string> {
  const response = await fetch(LLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
    }),
  });
  if (!response.ok) {
    throw new Error(`LLM API ${response.status}: ${await response.text()}`);
  }
  const data: any = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function stripThinking(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

function tokensForPlanDays(totalDays: number): number {
  // 富任务字段多，按天数抬高上限，避免长计划半截 JSON
  return Math.min(16384, Math.max(4096, 800 + Number(totalDays) * 140));
}

function extractJSON(content: string): any {
  const cleaned = stripThinking(content);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const unauthorized = requireAppToken(request, env);
    if (unauthorized) return unauthorized;

    const deviceId = request.headers.get("x-device-id");

    // --- 云端备份 ---
    if (url.pathname === "/sync" && (request.method === "POST" || request.method === "PUT")) {
      if (!deviceId) return json({ error: "Missing x-device-id header" }, 400, request);
      try {
        const data = await request.text();
        JSON.parse(data);
        if (data.length > 512 * 1024) return json({ error: "Payload too large" }, 413, request);
        await env.ZHURI_DB.put(`user:${deviceId}`, data, {
          metadata: { updatedAt: new Date().toISOString() },
        });
        return json({ success: true, timestamp: new Date().toISOString() }, 200, request);
      } catch {
        return json({ error: "Invalid data format or KV error" }, 500, request);
      }
    }

    if (url.pathname === "/get" && request.method === "GET") {
      if (!deviceId) return json({ error: "Missing x-device-id header" }, 400, request);
      const data = await env.ZHURI_DB.get(`user:${deviceId}`);
      return new Response(data || "{}", {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, request);
    }
    if (!env.API_KEY) {
      return json({ error: "API Key not configured" }, 500, request);
    }

    // 所有 AI 端点统一限流
    const limited = await rateLimit(env, deviceId, request);
    if (limited) return limited;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, request);
    }

    try {
      // --- AI 动态调整 ---
      if (url.pathname === "/adjust") {
        const {
          goal,
          missedCount,
          completedCount,
          remainingTasks,
          remainingDays,
          profile,
          rescueMode,
          recentFeedback,
        } = body;
        if (!goal || !Array.isArray(remainingTasks) || !remainingDays) {
          return json({ error: "Missing goal / remainingTasks / remainingDays" }, 400, request);
        }
        const feedbackBlock =
          Array.isArray(recentFeedback) && recentFeedback.length > 0
            ? `最近完成反馈：\n${recentFeedback
                .slice(0, 5)
                .map(
                  (f: any, i: number) =>
                    `${i + 1}. 第${f.day || "?"}天「${f.task || ""}」难度=${f.difficulty || "未知"}，实际${f.actualMinutes || "?"}分钟，卡点=${f.blocker || "无"}，希望明天=${f.preference || "keep"}`
                )
                .join("\n")}\n请据此调整强度与任务颗粒度。\n`
            : "";
        const userPrompt =
          `目标：${goal}\n` +
          `已完成 ${completedCount || 0} 天，落后 ${missedCount || 0} 天。\n` +
          `救援模式：${rescueMode || "steady"}。\n` +
          `用户画像：每天可投入 ${profile?.dailyMinutes || 30} 分钟，基础 ${profile?.currentLevel || "beginner"}，节奏偏好 ${profile?.pace || "steady"}，日程模式 ${profile?.weekdayMode || "same"}。\n` +
          feedbackBlock +
          `未完成的任务清单：\n${remainingTasks
            .slice(0, 120)
            .map((t: any, i: number) => `${i + 1}. ${t.task}${t.pages ? `（${t.pages}）` : ""}`)
            .join("\n")}\n\n` +
          `请把这些任务重新编排成 ${remainingDays} 天的新计划，严格返回JSON。`;
        const content = await callLLM(
          env,
          ADJUST_SYSTEM_PROMPT,
          userPrompt,
          0.7,
          tokensForPlanDays(Number(remainingDays) || 14)
        );
        return json(extractJSON(content), 200, request);
      }

      // --- AI 督促文案 ---
      if (url.pathname === "/coach") {
        const { persona, goalName, streak, completionRate, missedCount, daysLeft, todayTask } = body;
        const personaPrompt = COACH_PERSONAS[persona] || COACH_PERSONAS.gentle;
        const userPrompt =
          `用户目标：${goalName}\n今日任务：${todayTask}\n` +
          `连续打卡：${streak} 天，完成率 ${completionRate}%，落后 ${missedCount} 天，剩余 ${daysLeft} 天。\n` +
          `写一句督促用户今天完成任务的话（30字以内，只返回这句话本身，不要引号和解释）。`;
        const content = await callLLM(env, personaPrompt, userPrompt, 0.9, 256);
        return json(
          { message: content.trim().replace(/^["“」『]+|["”」』]+$/g, "").slice(0, 60) },
          200,
          request
        );
      }

      // --- 每周 AI 复盘 ---
      if (url.pathname === "/review") {
        const { stats } = body;
        if (!Array.isArray(stats) || stats.length === 0) {
          return json({ error: "Missing stats" }, 400, request);
        }
        const userPrompt =
          `用户本周执行数据：\n${stats
            .map(
              (s: any) =>
                `目标「${s.name}」：本周完成 ${s.weekCompleted}/${s.weekTotal} 天，当前连续 ${s.streak} 天，总完成率 ${s.totalRate}%`
            )
            .join("\n")}\n\n生成本周复盘，严格返回JSON。`;
        const content = await callLLM(env, REVIEW_SYSTEM_PROMPT, userPrompt, 0.7, 2048);
        return json(extractJSON(content), 200, request);
      }

      // --- AI 拆解（默认端点，兼容旧版 Web 客户端） ---
      const { goal, totalDays, profile } = body;
      if (!goal || !totalDays) {
        return json({ error: "Missing goal or totalDays" }, 400, request);
      }
      if (Number(totalDays) > 365) {
        return json({ error: "totalDays too large" }, 400, request);
      }
      const compactHint =
        Number(totalDays) > 45
          ? "周期较长：analysis 精简；每天字段尽量短，仍必须包含 task/minimumTask/successCheck/type/day。\n"
          : "";
      const userPrompt =
        `目标：${goal}\n总天数：${totalDays}天\n` +
        `用户画像：每天可投入 ${profile?.dailyMinutes || 30} 分钟，基础 ${profile?.currentLevel || "beginner"}，节奏偏好 ${profile?.pace || "steady"}，日程模式 ${profile?.weekdayMode || "same"}。\n` +
        compactHint +
        `\n请先做领域专家诊断，再生成${totalDays}天的每日陪跑计划。每天都要体现目标对象本身，而不是通用模板；每天都要有最低完成版、标准任务、挑战版、专项重点、安排理由、验收标准和教练提醒。严格返回JSON。`;
      const content = await callLLM(
        env,
        GENERATE_SYSTEM_PROMPT,
        userPrompt,
        0.7,
        tokensForPlanDays(Number(totalDays))
      );
      try {
        return json(extractJSON(content), 200, request);
      } catch {
        return json(
          { error: "Failed to parse AI response", raw: content.substring(0, 300) },
          500,
          request
        );
      }
    } catch (error: any) {
      return json({ error: error.message }, 500, request);
    }
  },
};
