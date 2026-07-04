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
  /** 可选：RevenueCat secret API key，配置后启用订阅校验 */
  RC_API_KEY?: string;
}

// 用户密钥为 MiniMax Token Plan（sk-cp- 前缀），走官方 OpenAI 兼容端点
const LLM_API_URL = "https://api.minimaxi.com/v1/chat/completions";
const MODEL = "MiniMax-M3";

const FREE_DAILY_LIMIT = 10;
const PRO_DAILY_LIMIT = 100;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-device-id",
};

const GENERATE_SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标和天数，你要生成最合理的每日任务。

【核心原则】
- 用户目标千变万化，不要套具体例子，而是根据目标类型和任务设计原则来生成
- 任务要具体、可测量、可执行、有挑战但不至于让人放弃
- 每天1-3个核心任务
- 任务从简单开始，逐渐增加难度
- 每周留1-2天休息或轻松任务
- 最后1-2天用于总结/回顾/缓冲

【任务类型】
根据目标选择合适的任务类型标识（英文小写），例如：
reading(阅读) notes(笔记) review(复习) summary(总结) vocabulary(背单词) listening(听力)
speaking(口语) writing(写作) practice(练习) warmup(热身) workout(运动) stretch(拉伸)
recovery(恢复) race(测试) learn(学习) project(项目) coding(编程) debugging(调试)
design(设计) planning(规划) research(调研) cooking(烹饪) diet(饮食) tracking(记录)
meditation(冥想) journal(日记) habit(习惯) sleep(睡眠) instrument(乐器) drawing(绘画)
creation(创作) photography(摄影) exam(做题) mock(模拟考) networking(社交) finance(理财)
selfcare(自我关爱) other(其他)

【任务设计模板】
读书类 → reading + notes + review + summary
运动类 → warmup + workout + stretch + recovery + race
学习类 → learn + practice + review + exam
习惯类 → habit + planning + review + summary
项目类 → planning + learn + coding/design + practice + review
备考类 → learn + practice + review + mock + exam
创作类 → research + drawing + creation + review
语言类 → vocabulary + listening + speaking + reading + writing

【输出格式】
返回纯JSON，无其他文字：
{
  "tasks": [
    {"day":1,"task":"具体任务描述（不超过20字）","pages":"量化指标或描述","type":"任务类型"}
  ]
}
day从1开始，天数与用户指定一致`;

const ADJUST_SYSTEM_PROMPT = `你是目标执行教练。用户的目标执行落后了，你要把他剩余的任务重新编排，帮他回到正轨。

【核心原则】
- 保持目标不变，把未完成的任务内容合理压缩、合并、重排到剩余天数里
- 前几天安排轻松一点的任务，帮用户找回状态（这是关键：让他重新上手，而不是被吓跑）
- 不要简单地把旧任务顺延，要真正重新设计节奏
- 任务总量可以适度精简（砍掉不关键的），确保剩余计划可完成
- 天数与用户指定的剩余天数一致

【输出格式】
返回纯JSON，无其他文字：
{
  "message": "一句给用户的鼓励话，说明你是怎么调整的（不超过40字）",
  "tasks": [
    {"day":1,"task":"具体任务描述（不超过20字）","pages":"量化指标","type":"任务类型"}
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** 每日限流：返回 null 表示放行，否则返回错误响应 */
async function rateLimit(env: Env, deviceId: string | null): Promise<Response | null> {
  if (!deviceId) return json({ error: "Missing x-device-id header" }, 400);

  const today = new Date().toISOString().split("T")[0];
  const key = `rl:${deviceId}:${today}`;
  const count = Number((await env.ZHURI_DB.get(key)) || "0");

  const pro = await isProUser(env, deviceId);
  const limit = pro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (count >= limit) {
    return json({ error: "今日 AI 次数已达上限，明天再来吧", code: "rate_limited" }, 429);
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
  temperature = 0.7
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
      max_tokens: 4096,
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
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractJSON(content: string): any {
  const cleaned = stripThinking(content);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const deviceId = request.headers.get("x-device-id");

    // --- 云端备份 ---
    if (url.pathname === "/sync" && (request.method === "POST" || request.method === "PUT")) {
      if (!deviceId) return json({ error: "Missing x-device-id header" }, 400);
      try {
        const data = await request.text();
        JSON.parse(data);
        if (data.length > 512 * 1024) return json({ error: "Payload too large" }, 413);
        await env.ZHURI_DB.put(`user:${deviceId}`, data, {
          metadata: { updatedAt: new Date().toISOString() },
        });
        return json({ success: true, timestamp: new Date().toISOString() });
      } catch {
        return json({ error: "Invalid data format or KV error" }, 500);
      }
    }

    if (url.pathname === "/get" && request.method === "GET") {
      if (!deviceId) return json({ error: "Missing x-device-id header" }, 400);
      const data = await env.ZHURI_DB.get(`user:${deviceId}`);
      return new Response(data || "{}", {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    if (!env.API_KEY) {
      return json({ error: "API Key not configured" }, 500);
    }

    // 所有 AI 端点统一限流
    const limited = await rateLimit(env, deviceId);
    if (limited) return limited;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    try {
      // --- AI 动态调整 ---
      if (url.pathname === "/adjust") {
        const { goal, missedCount, completedCount, remainingTasks, remainingDays } = body;
        if (!goal || !Array.isArray(remainingTasks) || !remainingDays) {
          return json({ error: "Missing goal / remainingTasks / remainingDays" }, 400);
        }
        const userPrompt =
          `目标：${goal}\n` +
          `已完成 ${completedCount || 0} 天，落后 ${missedCount || 0} 天。\n` +
          `未完成的任务清单：\n${remainingTasks
            .slice(0, 120)
            .map((t: any, i: number) => `${i + 1}. ${t.task}${t.pages ? `（${t.pages}）` : ""}`)
            .join("\n")}\n\n` +
          `请把这些任务重新编排成 ${remainingDays} 天的新计划，严格返回JSON。`;
        const content = await callLLM(env, ADJUST_SYSTEM_PROMPT, userPrompt);
        return json(extractJSON(content));
      }

      // --- AI 督促文案 ---
      if (url.pathname === "/coach") {
        const { persona, goalName, streak, completionRate, missedCount, daysLeft, todayTask } = body;
        const personaPrompt = COACH_PERSONAS[persona] || COACH_PERSONAS.gentle;
        const userPrompt =
          `用户目标：${goalName}\n今日任务：${todayTask}\n` +
          `连续打卡：${streak} 天，完成率 ${completionRate}%，落后 ${missedCount} 天，剩余 ${daysLeft} 天。\n` +
          `写一句督促用户今天完成任务的话（30字以内，只返回这句话本身，不要引号和解释）。`;
        const content = await callLLM(env, personaPrompt, userPrompt, 0.9);
        return json({ message: content.trim().replace(/^["“」『]+|["”」』]+$/g, "").slice(0, 60) });
      }

      // --- 每周 AI 复盘 ---
      if (url.pathname === "/review") {
        const { stats } = body;
        if (!Array.isArray(stats) || stats.length === 0) {
          return json({ error: "Missing stats" }, 400);
        }
        const userPrompt =
          `用户本周执行数据：\n${stats
            .map(
              (s: any) =>
                `目标「${s.name}」：本周完成 ${s.weekCompleted}/${s.weekTotal} 天，当前连续 ${s.streak} 天，总完成率 ${s.totalRate}%`
            )
            .join("\n")}\n\n生成本周复盘，严格返回JSON。`;
        const content = await callLLM(env, REVIEW_SYSTEM_PROMPT, userPrompt);
        return json(extractJSON(content));
      }

      // --- AI 拆解（默认端点，兼容旧版 Web 客户端） ---
      const { goal, totalDays } = body;
      if (!goal || !totalDays) {
        return json({ error: "Missing goal or totalDays" }, 400);
      }
      if (Number(totalDays) > 365) {
        return json({ error: "totalDays too large" }, 400);
      }
      const userPrompt = `目标：${goal}\n总天数：${totalDays}天\n\n根据这个目标，选择合适的任务类型组合，生成${totalDays}天的每日任务计划，严格返回JSON。`;
      const content = await callLLM(env, GENERATE_SYSTEM_PROMPT, userPrompt);
      try {
        return json(extractJSON(content));
      } catch {
        return json({ error: "Failed to parse AI response", raw: content.substring(0, 300) }, 500);
      }
    } catch (error: any) {
      return json({ error: error.message }, 500);
    }
  },
};
