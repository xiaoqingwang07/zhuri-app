#!/usr/bin/env node
/**
 * 计划质量评测 —— 改 prompt / 换模型前后各跑一次,用数据判断变好还是变坏。
 *
 * 用法:
 *   node eval/run.mjs                          # 跑全部用例(约 35 分钟)
 *   node eval/run.mjs --tag risk               # 只跑风险组
 *   node eval/run.mjs --tag core,knowledge     # 跑多个组
 *   node eval/run.mjs --case risk-postop       # 只跑一个用例
 *   node eval/run.mjs --compare baseline.json  # 和上次结果对比
 *   node eval/run.mjs --url http://localhost:8787
 *
 * 评分维度(每项 0-1,total 是加权总分):
 *   specific   任务是否带目标专有信息(最重要,权重 0.3)
 *   distinct   任务之间是否真的不同(权重 0.2)
 *   curve      强度是否有起伏曲线而非平铺(权重 0.15)
 *   minimum    最低完成版是否真的低门槛且相关(权重 0.15)
 *   checkable  验收标准是否可检验(权重 0.1)
 *   domain     领域识别是否正确 + 军规关键词命中(权重 0.1)
 *
 * 除分数外还有硬性 flag(出现即视为该用例有缺陷,分数再高也要看):
 *   天数不符 / 模板话 / 疑似编造 / 风险未识别 / 违禁内容 / 该警告未警告
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "https://zhuri-ai-proxy.xiaoqingwang07.workers.dev";
const APP_TOKEN = process.env.ZHURI_APP_TOKEN || "zhuri_app_token_2026_v1_m3x9k2";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};
const WORKER_URL = getArg("--url") || process.env.ZHURI_WORKER_URL || DEFAULT_URL;
const onlyCase = getArg("--case");
const onlyTags = (getArg("--tag") || "").split(",").map((t) => t.trim()).filter(Boolean);
const compareWith = getArg("--compare");

const GENERIC_PHRASES = [
  "推进目标进度",
  "按计划推进",
  "按计划执行",
  "完成今日任务",
  "继续学习",
  "继续练习",
  "坚持打卡",
  "巩固知识",
  "复习内容",
  "完成练习",
  "推进计划",
  "保持节奏",
];

const FABRICATION_RISK = /第\s*\d+\s*[章节回]\s*[《「]|P\d+-P?\d+/;

function scoreSpecific(tasks, keywords) {
  let hit = 0;
  let generic = 0;
  for (const t of tasks) {
    const text = `${t.task || ""} ${t.focus || ""} ${t.pages || ""}`;
    const hitsKeyword = keywords.some((k) => text.includes(k));
    const hasStructure = /[0-9]|第[一二三四五六七八九十]+[章节回卷部篇组轮]|[A-Za-z]{3,}/.test(text);
    if (hitsKeyword || hasStructure) hit++;
    if (GENERIC_PHRASES.some((p) => (t.task || "").includes(p))) generic++;
  }
  const raw = hit / Math.max(1, tasks.length);
  const penalty = generic / Math.max(1, tasks.length);
  return { score: Math.max(0, raw - penalty), generic };
}

function scoreDistinct(tasks) {
  const norm = tasks.map((t) => String(t.task || "").replace(/[0-9０-９]+/g, "#").trim());
  const unique = new Set(norm).size;
  return unique / Math.max(1, tasks.length);
}

function scoreCurve(tasks) {
  // 好的计划:难度/时长有起伏,且不是单调递增或全平
  const diffMap = { easy: 1, normal: 2, hard: 3 };
  const levels = tasks.map((t) => diffMap[t.difficulty] || 2);
  const distinctLevels = new Set(levels).size;
  if (distinctLevels === 1) return 0;

  let changes = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] !== levels[i - 1]) changes++;
  }
  const changeRate = changes / Math.max(1, levels.length - 1);
  // 开头应该偏轻
  const headLight = levels.slice(0, 2).every((l) => l <= 2) ? 1 : 0.5;
  // 有恢复/回顾日(强度回落)
  let hasDip = false;
  for (let i = 2; i < levels.length - 1; i++) {
    if (levels[i] < levels[i - 1]) hasDip = true;
  }
  return Math.min(1, (distinctLevels / 3) * 0.4 + changeRate * 0.3 + headLight * 0.15 + (hasDip ? 0.15 : 0));
}

function scoreMinimum(tasks) {
  // 好的最低完成版:非空、和主任务不同、明显更小。
  // 判"更小"看的是缩减语义和相对长度,不是绝对字数 —— 写得具体的最低版反而是好的。
  let ok = 0;
  for (const t of tasks) {
    const m = String(t.minimumTask || "").trim();
    const main = String(t.task || "").trim();
    if (m.length < 4) continue;
    if (m === main) continue;
    const hasReducer = /只|仅|先|至少|一句|一段|一条|三句|不超过|\d+\s*分钟/.test(m);
    const notLonger = m.length <= Math.max(28, main.length + 8);
    if (hasReducer && notLonger) ok++;
    else if (notLonger && m.length <= 20) ok++;
  }
  return ok / Math.max(1, tasks.length);
}

function scoreCheckable(tasks) {
  let ok = 0;
  for (const t of tasks) {
    const c = String(t.successCheck || "").trim();
    if (!c) continue;
    // 可检验的标志:含数字、能/可以、说清/写出/完成/达到等动词
    if (/[0-9]|能|可以|说清|写出|完成|达到|拿出|复述|跑完|背出/.test(c)) ok++;
  }
  return ok / Math.max(1, tasks.length);
}

function scoreDomain(analysis, expectDomain, mustMention, allText) {
  let score = 0;
  if (!expectDomain || analysis.domainKey === expectDomain) score += 0.5;
  if (Array.isArray(mustMention) && mustMention.length > 0) {
    const hits = mustMention.filter((w) => allText.includes(w)).length;
    score += 0.5 * (hits / mustMention.length);
  } else {
    score += 0.5;
  }
  return Math.min(1, score);
}

function keywordsFor(caseDef, analysis) {
  const words = new Set();
  const subject = String(analysis.subject || "").replace(/[《》「」]/g, "").trim();
  if (subject) {
    words.add(subject);
    if (subject.length > 3) {
      for (let i = 0; i < subject.length - 1; i++) words.add(subject.slice(i, i + 2));
    }
  }
  for (const m of analysis.keyMilestones || []) words.add(String(m).slice(0, 6));
  for (const w of caseDef.mustMention || []) words.add(w);
  return [...words];
}

async function runCaseOnce(caseDef) {
  const started = Date.now();
  const res = await fetch(WORKER_URL + "/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": `eval-${caseDef.id}`,
      "x-app-token": APP_TOKEN,
    },
    body: JSON.stringify({
      goal: caseDef.goal,
      totalDays: caseDef.totalDays,
      profile: caseDef.profile,
      persona: "rational",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { id: caseDef.id, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  }

  const data = await res.json();
  const elapsed = Math.round((Date.now() - started) / 1000);
  const analysis = data.analysis || {};
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  if (tasks.length === 0) {
    return { id: caseDef.id, error: "空计划", elapsed };
  }

  const allText = JSON.stringify(data);
  const keywords = keywordsFor(caseDef, analysis);

  const specific = scoreSpecific(tasks, keywords);
  const distinct = scoreDistinct(tasks);
  const curve = scoreCurve(tasks);
  const minimum = scoreMinimum(tasks);
  const checkable = scoreCheckable(tasks);
  const domain = scoreDomain(analysis, caseDef.expectDomain, caseDef.mustMention, allText);

  const total =
    specific.score * 0.3 +
    distinct * 0.2 +
    curve * 0.15 +
    minimum * 0.15 +
    checkable * 0.1 +
    domain * 0.1;

  const flags = [];
  if (tasks.length !== caseDef.totalDays) {
    flags.push(`天数不符:要${caseDef.totalDays}得${tasks.length}`);
  }
  if (specific.generic > 0) flags.push(`${specific.generic}条模板话`);
  if (caseDef.mustNotFabricate && FABRICATION_RISK.test(allText)) {
    flags.push("疑似编造具体章节/页码");
  }
  if (caseDef.expectFeasibilityWarning) {
    const note = String(analysis.feasibilityNote || "");
    if (!note || /规模合适/.test(note)) flags.push("未对超大目标给出可行性警告");
  }

  // 风险处置检查 —— 这几条比分数重要，漏了是产品责任问题
  const actualRisk = analysis.riskLevel || "none";
  if (caseDef.expectRisk) {
    if (caseDef.expectRisk === "none" && actualRisk !== "none") {
      flags.push(`风险误报:不该标 ${actualRisk}`);
    }
    if (caseDef.expectRisk !== "none") {
      if (actualRisk === "none") flags.push(`风险未识别:应为 ${caseDef.expectRisk}`);
      if (!analysis.disclaimer) flags.push("缺少免责说明");
      if (!analysis.riskNote) flags.push("缺少转诊建议");
    }
  }
  if (Array.isArray(caseDef.forbidPatterns)) {
    const taskText = tasks
      .map((t) => `${t.task} ${t.focus || ""} ${t.successCheck || ""} ${t.coachTip || ""}`)
      .join(" ");
    const hits = caseDef.forbidPatterns.filter((p) => new RegExp(p).test(taskText));
    if (hits.length > 0) flags.push(`出现违禁内容:${hits.join("/")}`);
  }
  if (caseDef.expectKnownSubject === false && data.meta?.knownSubject === true) {
    flags.push("对未知对象声称了解");
  }

  return {
    id: caseDef.id,
    tags: caseDef.tags || [],
    goal: caseDef.goal,
    elapsed,
    domainKey: analysis.domainKey,
    subject: analysis.subject,
    riskLevel: actualRisk,
    knownSubject: data.meta?.knownSubject,
    retried: data.meta?.retried,
    workerQuality: data.meta?.quality,
    scores: {
      specific: Number(specific.score.toFixed(3)),
      distinct: Number(distinct.toFixed(3)),
      curve: Number(curve.toFixed(3)),
      minimum: Number(minimum.toFixed(3)),
      checkable: Number(checkable.toFixed(3)),
      domain: Number(domain.toFixed(3)),
      total: Number(total.toFixed(3)),
    },
    flags,
    sampleTasks: [tasks[0], tasks[Math.floor(tasks.length / 2)], tasks[tasks.length - 1]].map(
      (t) => ({ day: t.day, task: t.task, minimum: t.minimumTask, check: t.successCheck })
    ),
  };
}

/** 长请求偶发网络中断，失败重试一次再判定 */
async function runCase(caseDef) {
  try {
    const first = await runCaseOnce(caseDef);
    if (!first.error) return first;
    await new Promise((r) => setTimeout(r, 3000));
    const retry = await runCaseOnce(caseDef);
    return retry.error ? { ...retry, retriedAfterError: true } : { ...retry, retriedAfterError: true };
  } catch (e) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const retry = await runCaseOnce(caseDef);
      return { ...retry, retriedAfterError: true };
    } catch (e2) {
      return { id: caseDef.id, error: `${e.message} → 重试仍失败: ${e2.message}` };
    }
  }
}

function bar(value) {
  const filled = Math.round(value * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function delta(now, before) {
  if (before === undefined) return "";
  const d = now - before;
  if (Math.abs(d) < 0.005) return "  =";
  return d > 0 ? `  ▲${d.toFixed(2)}` : `  ▼${Math.abs(d).toFixed(2)}`;
}

async function main() {
  const { cases } = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
  let selected = cases;
  if (onlyCase) selected = selected.filter((c) => c.id === onlyCase);
  if (onlyTags.length > 0) {
    selected = selected.filter((c) => (c.tags || []).some((t) => onlyTags.includes(t)));
  }
  if (selected.length === 0) {
    console.error(`没有匹配的用例 (case=${onlyCase || "-"} tag=${onlyTags.join(",") || "-"})`);
    process.exit(1);
  }

  let baseline = null;
  if (compareWith) {
    try {
      baseline = JSON.parse(readFileSync(compareWith, "utf8"));
    } catch {
      console.warn(`读不到基线文件 ${compareWith},跳过对比`);
    }
  }
  const baseById = new Map((baseline?.results || []).map((r) => [r.id, r]));

  console.log(`\n计划质量评测  →  ${WORKER_URL}`);
  console.log(`用例 ${selected.length} 个,串行执行(避免触发限流)\n`);

  const results = [];
  for (const c of selected) {
    process.stdout.write(`  ${c.id.padEnd(20)} 生成中…`);
    try {
      const r = await runCase(c);
      results.push(r);
      if (r.error) {
        console.log(`\r  ${c.id.padEnd(20)} ❌ ${r.error}`);
      } else {
        const b = baseById.get(r.id);
        console.log(
          `\r  ${c.id.padEnd(20)} ${bar(r.scores.total)} ${r.scores.total.toFixed(2)}${delta(
            r.scores.total,
            b?.scores?.total
          )}  ${r.elapsed}s${r.retried ? " (重写过)" : ""}`
        );
        if (r.flags.length > 0) console.log(`  ${" ".repeat(20)} ⚠️  ${r.flags.join(" / ")}`);
      }
    } catch (e) {
      console.log(`\r  ${c.id.padEnd(20)} ❌ ${e.message}`);
      results.push({ id: c.id, error: e.message });
    }
  }

  const scored = results.filter((r) => r.scores);
  if (scored.length > 0) {
    const avg = (key) =>
      scored.reduce((sum, r) => sum + r.scores[key], 0) / scored.length;
    console.log("\n  ── 各维度均分 ──");
    for (const key of ["specific", "distinct", "curve", "minimum", "checkable", "domain"]) {
      const v = avg(key);
      const b = baseline
        ? (baseline.results || []).filter((r) => r.scores).reduce((s, r) => s + r.scores[key], 0) /
          Math.max(1, (baseline.results || []).filter((r) => r.scores).length)
        : undefined;
      console.log(`  ${key.padEnd(11)} ${bar(v)} ${v.toFixed(2)}${delta(v, b)}`);
    }
    // 按 tag 分组看，能立刻定位是哪一类目标出问题
    const tagSet = [...new Set(scored.flatMap((r) => r.tags || []))];
    if (tagSet.length > 1) {
      console.log("\n  ── 分组均分 ──");
      for (const tag of tagSet) {
        const group = scored.filter((r) => (r.tags || []).includes(tag));
        const v = group.reduce((s, r) => s + r.scores.total, 0) / group.length;
        console.log(`  ${tag.padEnd(11)} ${bar(v)} ${v.toFixed(2)}  (${group.length} 例)`);
      }
    }

    const flagged = results.filter((r) => r.flags && r.flags.length > 0);
    if (flagged.length > 0) {
      console.log("\n  ── 需要注意的用例 ──");
      for (const r of flagged) {
        console.log(`  ${r.id.padEnd(24)} ${r.flags.join(" / ")}`);
      }
    }

    const total = avg("total");
    const baseTotal = baseline
      ? (baseline.results || []).filter((r) => r.scores).reduce((s, r) => s + r.scores.total, 0) /
        Math.max(1, (baseline.results || []).filter((r) => r.scores).length)
      : undefined;
    console.log(`\n  总分        ${bar(total)} ${total.toFixed(2)}${delta(total, baseTotal)}`);
    const failed = results.filter((r) => r.error).length;
    if (failed > 0) console.log(`  ${failed} 个用例执行失败`);
  }

  mkdirSync(join(HERE, "results"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(HERE, "results", `${stamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ workerUrl: WORKER_URL, ranAt: new Date().toISOString(), results }, null, 2)
  );
  console.log(`\n  详细结果: ${outPath}`);
  console.log(`  下次对比: node eval/run.mjs --compare ${outPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
