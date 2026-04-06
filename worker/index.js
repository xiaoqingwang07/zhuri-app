/**
 * 逐日App AI代理 - 纯JS版（用于 Cloudflare Dashboard 直接部署）
 */

const SILICONFLOW_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是目标拆解教练。用户会给你一个目标和天数，你要生成最合理的每日任务。

【核心原则】
- 用户目标千变万化，根据目标类型和任务设计原则来生成个性化任务
- 任务要具体、可测量、可执行
- 每天1个核心任务
- 任务从简单开始，逐渐增加难度
- 最后1-2天用于总结/回顾

【输出格式】
返回纯JSON，无其他文字：
{
  "tasks": [
    {"day":1,"task":"具体任务描述（不超过20字）","pages":"量化指标","type":"任务类型"}
  ]
}
day从1开始，天数与用户指定一致

任务类型可选：reading/notes/review/summary/practice/coding/workout/habit/learn/other`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-device-id",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
        JSON.parse(data);
        await env.ZHURI_DB.put(`user:${deviceId}`, data, {
          metadata: { updatedAt: new Date().toISOString() }
        });
        return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
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

    // --- Endpoint: AI Generate (POST /) ---
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const API_KEY = env.API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "Server config error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const { goal, totalDays } = await request.json();
      const API_KEY = env.API_KEY;

      const model = totalDays > 30 ? "Qwen/Qwen2.5-72B-Instruct" : "deepseek-ai/DeepSeek-V3";
      
      const systemPrompt = `你是一个目标拆解教练。输出严格的JSON列表，不要废话。格式: {"tasks":[{"day":1,"task":"详情","pages":"量化","type":"learn"}]}。语言:中文。`;
      const userPrompt = `目标:${goal},天数:${totalDays}。按天顺序生成，不可遗漏。`;

      const aiResponse = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          temperature: 0.7,
          stream: true, // 开启流式输出
        }),
      });

      if (!aiResponse.ok) return new Response("AI API Busy", { status: 503, headers: corsHeaders });

      // 把 AI 的流直接转发给前端
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const reader = aiResponse.body.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // 简单转发 SSE 原始数据
            await writer.write(encoder.encode(chunk));
          }
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          writer.close();
        }
      })();

      return new Response(readable, {
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/event-stream", 
          "Cache-Control": "no-cache", 
          "Connection": "keep-alive" 
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
  },
};
