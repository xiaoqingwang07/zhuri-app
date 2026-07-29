/**
 * 逐日 AI 代理 Worker
 *
 * 端点：
 *   POST /                 AI 拆解目标（两段式：诊断 → 拆解）
 *   POST /suggest-duration 由陪练判断合理周期
 *   POST /adjust           AI 动态调整（落后重排剩余计划）
 *   POST /coach            AI 督促文案（按人格生成）
 *   POST /review           每周 AI 复盘
 *   POST /sync             云端备份（KV，按 device-id）
 *   GET  /get              恢复备份
 *
 * 生成链路的核心设计：
 *   1. 诊断和拆解分成两次调用。诊断开 thinking 深想，拆解拿着诊断结论落地。
 *      一次调用同时干两件事时，后半程任务必然退化成通才填充。
 *   2. 诊断产出受控的 domainKey，据此注入该领域的「军规」（专家不会违反的原则）。
 *   3. 拆解结果做专名校验：任务里不出现目标对象的专有名词就是模板话，判不合格并重写一次。
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

/* ────────────────────────── 领域军规 ────────────────────────── */

type DomainKey =
  | "reading"
  | "fitness"
  | "coding"
  | "language"
  | "exam"
  | "creation"
  | "habit"
  | "career"
  | "life";

const DOMAIN_KEYS: DomainKey[] = [
  "reading",
  "fitness",
  "coding",
  "language",
  "exam",
  "creation",
  "habit",
  "career",
  "life",
];

/**
 * 每个领域里「专家不会违反的原则」。
 * 这些是把通用 LLM 拉到从业者水位的关键约束，比任何「请像专家一样」的措辞都有效。
 */
const DOMAIN_PLAYBOOKS: Record<DomainKey, string> = {
  reading: `【阅读领域军规】
- 必须按这本书自身的结构推进（章/卷/部/幕），禁止用"第X-Y页"这种纯页码切割冒充计划
- 每天要指明读什么内容单元，并配一个当天要回答的问题或要提炼的东西
- 前1-2天做目录扫描/问题意识建立，不要一上来就啃正文
- 叙事类抓人物关系、情节转折、伏笔；论述类抓论点、论据、反例、结构
- 至少安排2次回顾日（把前面读的串起来），最后1-2天做整体输出
- 不确定这本书的具体章节时，第1天安排"扫描目录并记录结构"，后续任务用结构性描述而不是编造章节名`,

  fitness: `【运动训练军规】
- 第1天必须是基线测试，没有基线的训练计划一律不合格
- 遵守渐进超负荷：周增量不超过10%，禁止直线拉升
- 每周至少1个恢复日/低强度日，连续高强度超过3天视为不合格
- 任务要写清可量化参数：距离/组数/次数/配速/心率区间/RPE
- 力量类要区分动作模式（推/拉/下肢/核心），不能天天练同一部位
- 最后阶段安排一次正式测试，与第1天基线可对比
- 有伤病风险信号时优先降量，宁可保守`,

  coding: `【项目/编程军规】
- 第1天定义MVP边界和"做完长什么样"，禁止第1天就写代码
- 必须先跑通一条最小端到端链路（哪怕很丑），再做功能扩展
- 每天要有可运行/可演示的增量，禁止连续多天只做"搭建"不产出
- 环境配置单独占1天并给出卡住时的降级方案（这是新手最大的死亡点）
- 中后期必须留测试和修bug的时间，占比不低于20%
- 任务要写清今天交付什么文件/接口/页面，不能只写"开发核心功能"`,

  language: `【语言训练军规】
- 输入和输出必须配对，只输入不输出的计划一律不合格
- 第1天做基线录音/自测，留作对比
- 遵守间隔重复：新学内容要在第2、4、7天复现
- 每天必须有一次真实产出（说出来/写出来），哪怕只有3句
- 材料难度控制在i+1，明显超纲的材料要降级
- 纠音/改错要单独成块，不能只做输入
- 最后安排复测，与第1天基线可对比`,

  exam: `【备考训练军规】
- 第1天拆考纲和题型分布，明确高频考点，禁止盲目刷题
- 必须由错因驱动：每轮练习后归因（知识点/审题/计算/时间），下一轮针对性补
- 错题必须回炉，间隔3-7天重做
- 中后期必须有限时模拟，且模拟环境接近真实
- 任务要写清题型和数量，不能只写"刷题30分钟"
- 最后阶段以查漏和状态调整为主，禁止在最后几天塞新知识点`,

  creation: `【创作训练军规】
- 参考收集不能超过总周期的20%，避免"只找灵感不动手"
- 必须尽早产出粗糙版本（丑的也算），再迭代打磨
- 技法练习和作品产出要交替，不能只练不做或只做不练
- 每个阶段结束要有一次反馈/自评，并据此修改
- 任务要写清今天产出什么具体物件（草稿/分镜/段落/样片）
- 最后留出打磨和归档时间`,

  habit: `【习惯养成军规】
- 必须设计明确的触发点（时间/地点/前置动作），没有触发点的习惯计划不合格
- 起始动作要小到"不可能失败"（2分钟原则），前3天尤其要轻
- 必须设计环境改造（降低阻力或增加阻力）
- 要预设"断了怎么办"的补救规则，而不是假设不会断
- 中后期逐步加量，但任何一天的最低完成版都要保持极低门槛
- 任务要写清具体动作和场景，不能只写"坚持早起"`,

  career: `【职业/求职军规】
- 先做现状盘点和目标岗位JD拆解，明确差距，再补短板
- 材料（简历/作品集）要早出第一版，然后迭代，不要憋大招
- 必须包含真实外部动作（投递/联系/模拟面试），不能全是准备
- 每个阶段要有可验证产出（一份简历/一次模拟面试/N次投递）
- 任务要写清具体对象和数量`,

  life: `【综合目标军规】
- 必须先把模糊目标翻译成可验收的具体结果
- 第1天做现状盘点和资源准备
- 每天的任务必须是"可以判断做没做完"的具体动作
- 阶段中点安排一次检查和调整
- 禁止出现"继续推进""按计划执行"这类无信息量的任务`,
};

/* ────────────────────────── 人格 ────────────────────────── */

const COACH_PERSONAS: Record<string, string> = {
  gentle: "你是温柔体贴的好朋友，说话温暖、有共情、带一点可爱，让人感到被支持。",
  strict: "你是毒舌但真心为学员好的教练，说话犀利、直接、一针见血，用激将法推人行动，但不侮辱人格。",
  rational: "你是数据驱动的理性教练，说话简洁精确，用数字和事实说话，给出明确的行动指令。",
};

/** 人格对「计划里的教练提醒/救援话术/复盘」的语气约束 */
const PERSONA_TONE: Record<string, string> = {
  gentle:
    "coachTip 和所有对用户说的话用温柔鼓励的语气：像朋友一样共情，先肯定再建议，不施压。",
  strict:
    "coachTip 和所有对用户说的话用毒舌教练的语气：犀利、直接、一针见血，用激将法但不侮辱人格。",
  rational:
    "coachTip 和所有对用户说的话用理性教练的语气：简洁精确，用数字和事实说话，给明确指令，不煽情。",
};

function personaTone(persona?: string): string {
  return PERSONA_TONE[persona || "gentle"] || PERSONA_TONE.gentle;
}

/* ────────────────────────── Prompts ────────────────────────── */

const DIAGNOSE_SYSTEM_PROMPT = `你是该领域的资深从业者，正在接一个陪练学员。现在只做一件事：诊断这个目标。不要生成每日计划。

【你要做的】
像真正的行家那样判断：这个目标属于什么领域、具体对象是什么、什么才算做到了、必经的里程碑有哪些、最可能死在哪一步、应该用什么策略陪这个人。

【必须遵守】
- 目标对象要具体到名字。是哪本书、哪种运动、什么项目、哪门考试
- 如果你确实知道这个对象（某本具体的书、某项具体运动、某个具体考试），就要体现出你知道：说出它的结构、难点、关键部分
- 如果你不确定对象的具体内容，诚实说明，并把"第一步先建立资料/做基线测试"写进策略，绝不编造章节名、页码、具体数据
- 判断目标规模和用户可投入时间是否匹配。不匹配就在 feasibilityNote 里直说，并给出应该缩到什么范围
- successCriteria 必须是能被检验的，不能是"有所提升"这种空话

【风险判断 — 必须做】
判断这个目标是否触及需要专业人士介入的领域，填进 riskLevel：
- medical：疾病治疗/康复训练/用药/心理干预/孕产/慢性病管理
- extreme_body：极端减重增重、断食、大幅度体成分改变、高强度或高危运动
- financial：投资理财、炒股、加密货币、创业融资等涉及金钱损失的目标
- legal：诉讼、合规、签证等法律事务
- none：以上都不涉及

riskLevel 不是 none 时：
- 计划里绝不能出现具体的医学参数（用药剂量、心率上限、热量数字、体脂目标、康复动作角度）、具体投资标的或法律结论
- 任务要落在「记录、观察、准备问题、执行专业人士已给出的方案、建立习惯」这类安全动作上
- 在 riskNote 里写清用户应该找什么样的专业人士，20-40字

【domainKey 必须从这9个里选一个】
reading（读书/阅读）
fitness（运动/健身/减脂）
coding（编程/项目/产品开发）
language（语言学习）
exam（考试/备考/证书）
creation（写作/绘画/音乐/视频等创作）
habit（习惯养成/戒断/作息）
career（求职/职业发展/技能变现）
life（其他综合目标）

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "domainKey": "上面9个之一",
  "domain": "中文领域名，如阅读理解/运动训练",
  "subject": "目标对象的具体名称",
  "knownSubject": true/false（你是否确实了解这个对象的具体内容）,
  "expertiseAngle": "作为这个领域的行家，你怎么看这个目标。要具体到这个对象本身的特点和难点，60-120字",
  "successCriteria": ["可检验的成功标准1", "标准2", "标准3"],
  "keyMilestones": ["里程碑1", "里程碑2", "里程碑3", "里程碑4"],
  "riskFactors": ["最可能失败的原因1", "原因2"],
  "coachStrategy": "整体陪练策略，不超过60字",
  "feasibilityNote": "规模是否匹配的判断，匹配就写「规模合适」，不匹配要说明并给出建议范围",
  "riskLevel": "medical|extreme_body|financial|legal|none",
  "riskNote": "riskLevel 不是 none 时说明该找什么专业人士，20-40字；none 时返回空字符串"
}`;

/**
 * 长计划用精简 schema。
 * Cloudflare 在 Worker 约 75 秒没有任何输出时会断开连接，而「诊断 + 30 天完整字段」
 * 实测正好撞线。省掉的 rationale/coachTip 客户端 enrichTaskWithDomainContext 会补，
 * 用户看不出差别，但生成时间能降三分之一。
 */
const COMPACT_THRESHOLD_DAYS = 14;

function planSystemPrompt(
  domainKey: DomainKey,
  persona: string | undefined,
  knownSubject: boolean,
  compact: boolean
): string {
  const taskSchema = compact
    ? `{
      "day":1,
      "task":"当天任务，必须含目标专有信息，不超过22字",
      "pages":"量化指标",
      "type":"任务类型英文小写",
      "durationMinutes":30,
      "difficulty":"easy|normal|hard",
      "minimumTask":"最低完成版，5-10分钟能做完，不超过18字",
      "challengeTask":"状态好时的挑战版，不超过24字",
      "energy":"light|steady|push",
      "focus":"当天重点，不超过12字",
      "successCheck":"验收标准，不超过24字"
    }`
    : `{
      "day":1,
      "task":"当天任务，必须含目标专有信息，不超过22字",
      "pages":"量化指标",
      "type":"任务类型英文小写",
      "durationMinutes":30,
      "difficulty":"easy|normal|hard",
      "minimumTask":"最低完成版，5-10分钟能做完，不超过18字",
      "challengeTask":"状态好时的挑战版，不超过24字",
      "energy":"light|steady|push",
      "focus":"当天专项重点，不超过18字",
      "rationale":"为什么今天这样安排，不超过36字",
      "successCheck":"今天的验收标准，不超过30字",
      "coachTip":"教练提醒，不超过32字"
    }`;

  return `你是该领域的资深教练，诊断已经做完了。现在把诊断结论落成每一天的训练计划。

${DOMAIN_PLAYBOOKS[domainKey]}

【任务撰写铁律】
- 每天的 task 必须出现这个目标对象的专有信息：具体章节/部分/人物/动作名/题型/模块/功能名。禁止出现"推进目标进度""按计划执行""完成今日任务""继续学习"这类没有信息量的话
- 每天不同。如果连续两天的任务换个数字就一样，说明你在偷懒，重写
- 强度要有曲线：开头轻（建立基线和手感）、中段稳步加码、后段有冲刺、中间穿插回顾/恢复、最后收尾验收
- minimumTask 是给"今天很忙很累"的人用的，必须真的很小（5-10分钟能做完），但仍然和当天主题相关
- successCheck 要能被检验：做完能拿出什么、能回答什么问题、能达到什么数字
- rationale 说明为什么今天安排这个，要体现节奏设计的意图
${
  knownSubject
    ? "- 你了解这个对象，任务里要用上它的真实结构和内容"
    : "- 你不完全了解这个对象的细节。前1-2天安排「扫描资料/建立基线」，之后的任务用结构性描述（如「第二部分的核心论证」），绝不编造具体章节名、页码或数据"
}
- ${personaTone(persona)}

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "tasks": [
    ${taskSchema}
  ]
}
day 从1开始，天数必须与要求一致，一天都不能少。${
    compact ? "字段严格控制在字数上限内，宁可短也要把所有天数输出完整。" : ""
  }`;
}

/**
 * 强度校准（upgrade/lighten）和救援（relaxed/steady/sprint）是两件事：
 * 救援是把掉队的人捞回来，校准是根据真实表现调训练量。语气和目标都不同。
 */
const CALIBRATE_SYSTEM_PROMPT = `你是该领域的资深教练。学员没有落后，他一直在按计划完成，但真实反馈显示当前强度不合适，你要重新校准剩余计划的强度。

【核心原则】
- 这不是救援。学员做得很好，不要出现「接回来」「别放弃」「重新开始」这类救援语气
- mode=upgrade：学员完成得比预期轻松，要加码。加量方式是提高单日的深度和挑战性（更难的内容、更高的标准、更大的量），不是简单延长时间
- mode=lighten：学员持续吃力，要减负。降低单日强度但保住目标不变，把难点拆得更碎
- 天数保持不变，改变的是每天的内容和强度
- 加码要有梯度，不能一步跳到极限；减负也不能减到没有训练效果
- 每天的任务仍必须包含目标的专有信息，不能退化成通用描述
- message 要说清你做了什么调整以及为什么，像教练跟学员解释训练计划的变化

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "message": "跟学员解释这次调整（不超过40字）",
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
      "rescueNote":"这天为什么这样调（不超过20字）"
    }
  ]
}`;

const ADJUST_SYSTEM_PROMPT = `你是目标执行教练。用户的目标执行落后了，你要把他剩余的任务重新编排，帮他回到正轨。

【核心原则】
- 保持目标不变，把未完成的任务内容合理压缩、合并、重排到剩余天数里
- 前几天安排轻松一点的任务，帮用户找回状态（这是关键：让他重新上手，而不是被吓跑）
- 用户不是失败了，只是掉队了；语气要像救援陪跑，不要羞辱或制造负罪感
- rescueMode=relaxed 时降低强度、允许更多轻任务；steady 时保持原节奏；sprint 时合并低价值任务、提高强度但不能过载
- 不要简单地把旧任务顺延，要真正重新设计节奏
- 任务总量可以适度精简（砍掉不关键的），确保剩余计划可完成
- 每天的任务仍必须包含目标的专有信息，不能退化成"继续推进"
- 天数与用户指定的剩余天数一致

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "message": "一句给用户的话，说明你是怎么调整的（不超过40字）",
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

const REVIEW_SYSTEM_PROMPT = `你是目标执行教练，为用户生成每周执行复盘。基于用户提供的数据，输出简洁有洞察的复盘。

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "summary": "本周整体执行情况总结（60字以内，有温度、有数据）",
  "highlights": ["本周做得好的地方，1-3条，每条20字以内"],
  "suggestions": ["下周具体可执行的建议，1-3条，每条25字以内"]
}`;

const DURATION_SYSTEM_PROMPT = `你是该领域的资深从业者。用户说了一个目标但不确定该给自己多少天。用你的专业判断给出建议。

【要求】
- 基于这个目标的真实难度和用户每天能投入的时间来算，不要拍脑袋给整数
- 说明理由要具体：这个目标必须经过哪几个阶段，每个阶段大概要多久
- 给3个选项：保守（更容易坚持）、推荐、紧凑（有挑战）
- 如果用户的目标本身规模不合理，在 warning 里直说，并给出应该缩小到什么范围

【输出格式】
返回纯JSON，无其他文字。字符串内部如需引用或强调，一律用中文引号「」，绝不能出现英文双引号，否则 JSON 会损坏：
{
  "recommendedDays": 21,
  "reason": "为什么是这个天数，要说清阶段划分，60字以内",
  "options": [
    {"days": 30, "label": "宽松", "desc": "每天负担更小，更容易坚持完，20字以内"},
    {"days": 21, "label": "推荐", "desc": "强度和可行性平衡，20字以内"},
    {"days": 14, "label": "紧凑", "desc": "需要更专注，20字以内"}
  ],
  "warning": "目标规模有问题时的提醒，没问题就返回空字符串"
}`;

/* ────────────────────────── 工具 ────────────────────────── */

declare interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

/**
 * 保活式流式响应。
 *
 * Cloudflare 在 Worker 约 70-75 秒没有向客户端写出任何数据时会切断连接，
 * 而「诊断 + 长计划拆解」正好落在这个区间，实测会随机失败。
 *
 * 这里立刻返回一个流并每 8 秒写一个空格保活，生成完再写真正的 JSON。
 * JSON 允许前导空白，客户端 res.json() 直接就能解析，无需任何改动。
 *
 * 代价：状态码必须在开流时确定，所以错误也走 200，body 里带 error 字段。
 */
function streamJSON(
  ctx: ExecutionContext,
  request: Request,
  work: () => Promise<unknown>
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  ctx.waitUntil(
    (async () => {
      const heartbeat = setInterval(() => {
        writer.write(encoder.encode(" ")).catch(() => {});
      }, 8000);
      try {
        const result = await work();
        clearInterval(heartbeat);
        await writer.write(encoder.encode(JSON.stringify(result)));
      } catch (error: any) {
        clearInterval(heartbeat);
        await writer
          .write(encoder.encode(JSON.stringify({ error: error?.message || "生成失败" })))
          .catch(() => {});
      } finally {
        await writer.close().catch(() => {});
      }
    })()
  );

  return new Response(readable, {
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

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
  maxTokens = 8192,
  thinking = false
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
      // MiniMax-M3 只接受 adaptive / disabled；adaptive 让模型自行决定是否深想
      thinking: { type: thinking ? "adaptive" : "disabled" },
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
    // 兜底：去掉任何残留（含未闭合）的 think 标签本身
    .replace(/<\/?think(?:ing)?>/gi, "")
    .trim();
}

// 从指定位置起用括号配对扫描出一个完整 JSON 对象，
// 正确跳过字符串字面量里的花括号，避免贪婪匹配吞掉多余文本或半截 JSON。
function balancedJsonFrom(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tokensForPlanDays(totalDays: number, compact = false): number {
  // 完整字段每天实测约 170-200 token，精简 schema 约 110-130。
  // 拆解阶段 thinking 是关的（诊断阶段才开），所以不必像单段式那样为思考留额度，
  // 但底线仍留足 —— 给少了会被截断成「要30天只给26天」，这是用户直接可见的缺陷。
  const perDay = compact ? 160 : 220;
  return Math.min(16384, Math.max(6144, 1600 + Number(totalDays) * perDay));
}

/**
 * 补齐被截断的 JSON。
 * 长计划输出到一半被 max_tokens 砍掉时,直接 JSON.parse 会整个失败,
 * 但前面已经生成好的任务是可用的 —— 截到最后一个完整对象再补闭合符,能救回大部分。
 */
function repairTruncatedJSON(raw: string): string | null {
  let inString = false;
  let escape = false;
  let lastClose = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "}" || ch === "]") lastClose = i;
  }
  if (lastClose === -1) return null;

  const head = raw.slice(0, lastClose + 1);

  // 重新扫描这段,算出还有哪些括号没闭合
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let tail = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    tail += stack[i] === "{" ? "}" : "]";
  }
  // 去掉可能残留的尾随逗号
  return head.replace(/,\s*$/, "") + tail;
}

/** 从 JSON.parse 的报错里取出出错位置 */
function errorPosition(err: unknown): number {
  const msg = String((err as Error)?.message || "");
  const m = msg.match(/position (\d+)/i);
  return m ? Number(m[1]) : -1;
}

function extractJSON(content: string): any {
  let cleaned = stripThinking(content);
  // 模型常把 JSON 包在 ```json ... ``` 代码块里，先取块内内容。
  // 被 max_tokens 截断时收尾的 ``` 会丢失，所以补一条只剥开头围栏的退路。
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  else cleaned = cleaned.replace(/^\s*```(?:json)?\s*/i, "").trim();

  // 主路径：依次尝试每个 '{' 作为起点做括号配对，
  // 能跳过推理文本里残留的散花括号，也不会像贪婪正则那样吞掉多余内容
  for (let i = cleaned.indexOf("{"); i !== -1; i = cleaned.indexOf("{", i + 1)) {
    const candidate = balancedJsonFrom(cleaned, i);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // 该起点不是合法 JSON，试下一个
    }
  }

  // 兜底一：整段被 max_tokens 截断，括号配对永远收不了尾 —— 补齐闭合符。
  // 前面已经生成好的任务是可用的，救回来比整个失败强。
  const start = cleaned.indexOf("{");
  const raw = start === -1 ? cleaned : cleaned.slice(start);
  const repaired = repairTruncatedJSON(raw);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch {
      // 落到兜底二
    }
  }

  // 兜底二：中间就有语法错（多是字符串里混入未转义的引号）。
  // 从出错位置往前砍掉，保住前面已经完整的那部分任务。
  try {
    return JSON.parse(raw);
  } catch (err) {
    const pos = errorPosition(err);
    if (pos > 0 && pos < raw.length) {
      const head = repairTruncatedJSON(raw.slice(0, pos));
      if (head) {
        try {
          return JSON.parse(head);
        } catch {
          // 救不回来
        }
      }
    }
    throw err;
  }
}

function sanitizeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
  return list.length > 0 ? list : fallback;
}

function normalizeDomainKey(raw: unknown): DomainKey {
  const key = String(raw || "").trim().toLowerCase();
  return (DOMAIN_KEYS as string[]).includes(key) ? (key as DomainKey) : "life";
}

/* ─────────────────── 高风险领域 ─────────────────── */

type RiskLevel = "none" | "medical" | "extreme_body" | "financial" | "legal";

const RISK_LEVELS: RiskLevel[] = ["none", "medical", "extreme_body", "financial", "legal"];

/**
 * 触及这些领域时，AI 给的不是专业意见，用户必须知道这一点。
 * 模型判断可能漏，所以再叠一层关键词兜底 —— 宁可多提示，不可漏提示。
 */
const RISK_PATTERNS: { level: RiskLevel; pattern: RegExp }[] = [
  {
    level: "medical",
    pattern:
      /(治疗|康复|复健|抑郁|焦虑|失眠症|糖尿病|高血压|癌|化疗|术后|孕|怀孕|备孕|哺乳|吃药|用药|服药|戒断反应|自闭|多动症|厌食|暴食症|心理咨询|精神)/,
  },
  {
    level: "extreme_body",
    pattern:
      /(断食|辟谷|极限|暴汗|催吐|脱水|急速减|快速减\s*\d{2,}|减重\s*(1[5-9]|[2-9]\d)|增肌\s*(1[5-9]|[2-9]\d)|全马|超马|铁人三项|自由潜)/,
  },
  {
    level: "financial",
    pattern: /(炒股|股票|基金|理财|投资|加密货币|比特币|虚拟币|期货|杠杆|融资|副业赚|月入\s*\d|暴富)/,
  },
  { level: "legal", pattern: /(诉讼|打官司|起诉|labor仲裁|劳动仲裁|签证|移民|合规审查|专利申请)/ },
];

const RISK_DISCLAIMERS: Record<Exclude<RiskLevel, "none">, string> = {
  medical:
    "这个目标涉及健康和医疗。逐日只能陪你执行，不能替代医生或专业治疗方案。开始前请咨询医生，并以医嘱为准。",
  extreme_body:
    "这个目标涉及较高强度的身体改变。逐日不提供医学或运动处方，请先确认自己的身体状况，必要时咨询医生或专业教练。",
  financial:
    "这个目标涉及金钱和投资。逐日不提供任何投资建议，也不对收益或损失负责。请自行判断风险，必要时咨询持牌专业人士。",
  legal:
    "这个目标涉及法律事务。逐日提供的内容不构成法律意见，请以执业律师或相关机构的意见为准。",
};

/** 模型判断 + 关键词兜底，取更严格的那个 */
function resolveRisk(rawLevel: unknown, goal: string): { level: RiskLevel; disclaimer: string } {
  const fromModel = String(rawLevel || "none").trim().toLowerCase();
  let level: RiskLevel = (RISK_LEVELS as string[]).includes(fromModel)
    ? (fromModel as RiskLevel)
    : "none";

  if (level === "none") {
    for (const rule of RISK_PATTERNS) {
      if (rule.pattern.test(goal)) {
        level = rule.level;
        break;
      }
    }
  }

  return {
    level,
    disclaimer: level === "none" ? "" : RISK_DISCLAIMERS[level],
  };
}

/* ─────────────────── 计划质量校验（专名密度） ─────────────────── */

/** 出现即扣分的模板话 */
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

/** 从目标和诊断里抽出「应该出现在任务里」的关键词 */
function subjectKeywords(subject: string, analysis: any): string[] {
  const words = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (t.length >= 2) words.add(t);
  };

  const cleanSubject = String(subject || "")
    .replace(/[《》「」【】]/g, "")
    .trim();
  if (cleanSubject) {
    push(cleanSubject);
    // 中文长词切成 2-3 字片段，便于部分匹配
    if (cleanSubject.length > 3) {
      for (let i = 0; i < cleanSubject.length - 1; i++) {
        push(cleanSubject.slice(i, i + 2));
      }
    }
  }
  for (const m of sanitizeList(analysis?.keyMilestones, [])) push(m.slice(0, 6));
  return [...words];
}

interface QualityReport {
  /** 含专有信息的任务占比 0-1 */
  specificRate: number;
  /** 命中模板话的任务数 */
  genericCount: number;
  /** 重复任务数（去掉数字后完全相同） */
  duplicateCount: number;
  pass: boolean;
  reasons: string[];
}

function assessPlan(tasks: any[], subject: string, analysis: any): QualityReport {
  const keywords = subjectKeywords(subject, analysis);
  const seen = new Map<string, number>();
  let specific = 0;
  let generic = 0;
  let duplicate = 0;

  for (const t of tasks) {
    const text = `${t?.task || ""} ${t?.focus || ""} ${t?.pages || ""}`;

    // 专有信息：命中关键词，或含数字/章节/序号等结构性标记
    const hitsKeyword = keywords.some((k) => text.includes(k));
    const hasStructure = /[0-9０-９]|第[一二三四五六七八九十百]+[章节回卷部篇天组轮]|[A-Za-z]{3,}/.test(
      text
    );
    if (hitsKeyword || hasStructure) specific++;

    if (GENERIC_PHRASES.some((p) => String(t?.task || "").includes(p))) generic++;

    const norm = String(t?.task || "").replace(/[0-9０-９]+/g, "#").trim();
    const count = (seen.get(norm) || 0) + 1;
    seen.set(norm, count);
    if (count > 1) duplicate++;
  }

  const total = Math.max(1, tasks.length);
  const specificRate = specific / total;
  const reasons: string[] = [];
  if (specificRate < 0.7) reasons.push(`只有 ${Math.round(specificRate * 100)}% 的任务带目标专有信息`);
  if (generic > 0) reasons.push(`${generic} 条任务使用了模板话`);
  if (duplicate > total * 0.2) reasons.push(`${duplicate} 条任务和别的天重复`);

  return {
    specificRate,
    genericCount: generic,
    duplicateCount: duplicate,
    pass: reasons.length === 0,
    reasons,
  };
}

function mapTask(t: any, index: number, dailyMinutes: number) {
  const duration = Number(t?.durationMinutes || t?.duration || dailyMinutes);
  const difficulty = ["easy", "normal", "hard"].includes(t?.difficulty)
    ? t.difficulty
    : index < 2
      ? "easy"
      : "normal";
  return {
    day: t?.day || index + 1,
    task: String(t?.task || t?.content || "").trim(),
    pages: t?.pages || "",
    type: t?.type || "practice",
    durationMinutes: Math.max(8, Math.min(180, duration)),
    difficulty,
    minimumTask: t?.minimumTask || t?.minimum || "",
    challengeTask: t?.challengeTask || t?.challenge || t?.task || "",
    energy: t?.energy || (difficulty === "hard" ? "push" : difficulty === "easy" ? "light" : "steady"),
    focus: t?.focus,
    rationale: t?.rationale,
    successCheck: t?.successCheck,
    coachTip: t?.coachTip,
  };
}

/* ────────────────────────── 主处理 ────────────────────────── */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      // --- 陪练建议周期 ---
      if (url.pathname === "/suggest-duration") {
        const { goal, profile } = body;
        if (!goal) return json({ error: "Missing goal" }, 400, request);
        const userPrompt =
          `目标：${goal}\n` +
          `用户每天可投入 ${profile?.dailyMinutes || 30} 分钟，基础 ${profile?.currentLevel || "beginner"}，节奏偏好 ${profile?.pace || "steady"}。\n` +
          `请给出周期建议，严格返回JSON。`;
        const content = await callLLM(env, DURATION_SYSTEM_PROMPT, userPrompt, 0.6, 1536, true);
        const data = extractJSON(content);
        const options = Array.isArray(data?.options) ? data.options.slice(0, 3) : [];
        return json(
          {
            recommendedDays: Math.max(3, Math.min(365, Number(data?.recommendedDays) || 21)),
            reason: String(data?.reason || ""),
            options: options.map((o: any) => ({
              days: Math.max(3, Math.min(365, Number(o?.days) || 21)),
              label: String(o?.label || ""),
              desc: String(o?.desc || ""),
            })),
            warning: String(data?.warning || ""),
          },
          200,
          request
        );
      }

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
          persona,
          analysis,
        } = body;
        if (!goal || !Array.isArray(remainingTasks) || !remainingDays) {
          return json({ error: "Missing goal / remainingTasks / remainingDays" }, 400, request);
        }
        const domainKey = normalizeDomainKey(analysis?.domainKey);
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
        const isCalibration = rescueMode === "upgrade" || rescueMode === "lighten";
        const userPrompt =
          `目标：${goal}\n` +
          (isCalibration
            ? `已完成 ${completedCount || 0} 天，没有落后。校准模式：${rescueMode}。\n`
            : `已完成 ${completedCount || 0} 天，落后 ${missedCount || 0} 天。\n救援模式：${rescueMode || "steady"}。\n`) +
          `用户画像：每天可投入 ${profile?.dailyMinutes || 30} 分钟，基础 ${profile?.currentLevel || "beginner"}，节奏偏好 ${profile?.pace || "steady"}，日程模式 ${profile?.weekdayMode || "same"}。\n` +
          feedbackBlock +
          `未完成的任务清单：\n${remainingTasks
            .slice(0, 120)
            .map((t: any, i: number) => `${i + 1}. ${t.task}${t.pages ? `（${t.pages}）` : ""}`)
            .join("\n")}\n\n` +
          (isCalibration
            ? `请把这 ${remainingDays} 天的计划按 ${rescueMode === "upgrade" ? "加码" : "减负"} 重新校准强度，天数不变，严格返回JSON。`
            : `请把这些任务重新编排成 ${remainingDays} 天的新计划，严格返回JSON。`);
        const basePrompt = isCalibration ? CALIBRATE_SYSTEM_PROMPT : ADJUST_SYSTEM_PROMPT;
        const systemPrompt = `${basePrompt}\n\n${DOMAIN_PLAYBOOKS[domainKey]}\n\n【语气】${personaTone(persona)}`;
        // 重排同样耗时，走保活流避免长计划被断连
        return streamJSON(ctx, request, async () => {
          const content = await callLLM(
            env,
            systemPrompt,
            userPrompt,
            0.7,
            tokensForPlanDays(Number(remainingDays) || 14)
          );
          return extractJSON(content);
        });
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
          { message: stripThinking(content).trim().replace(/^["“」『]+|["”」』]+$/g, "").slice(0, 60) },
          200,
          request
        );
      }

      // --- 每周 AI 复盘 ---
      if (url.pathname === "/review") {
        const { stats, persona } = body;
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
        const content = await callLLM(
          env,
          `${REVIEW_SYSTEM_PROMPT}\n\n【语气】${personaTone(persona)}`,
          userPrompt,
          0.7,
          2048
        );
        return json(extractJSON(content), 200, request);
      }

      // --- 两段式拆解（默认端点） ---
      const { goal, totalDays, profile, persona } = body;
      if (!goal || !totalDays) {
        return json({ error: "Missing goal or totalDays" }, 400, request);
      }
      if (Number(totalDays) > 365) {
        return json({ error: "totalDays too large" }, 400, request);
      }

      // 生成耗时长，走保活流，否则会被 Cloudflare 断连。
      // 单段式那版的「缺 tasks 视为失败」检查已在 generatePlan 内部保留。
      return streamJSON(ctx, request, () => generatePlan(env, goal, Number(totalDays), profile, persona));
    } catch (error: any) {
      return json({ error: error.message }, 500, request);
    }
  },
};

async function generatePlan(
  env: Env,
  goal: string,
  totalDays: number,
  profile: any,
  persona: string | undefined
): Promise<unknown> {
  const days = Number(totalDays);
  const dailyMinutes = Number(profile?.dailyMinutes) || 30;
  const profileLine = `用户画像：每天可投入 ${dailyMinutes} 分钟，基础 ${profile?.currentLevel || "beginner"}，节奏偏好 ${profile?.pace || "steady"}，日程模式 ${profile?.weekdayMode || "same"}。`;

  const startedAt = Date.now();

  // 第一段：诊断（adaptive thinking 深想）
  // token 上限要给思考过程留足空间，否则 JSON 会被截在半截
  const diagRaw = await callLLM(
    env,
    DIAGNOSE_SYSTEM_PROMPT,
    `目标：${goal}\n计划周期：${days}天\n${profileLine}\n\n请诊断这个目标，严格返回JSON。`,
    0.5,
    6144,
    true
  );
  let diag: any;
  try {
    diag = extractJSON(diagRaw);
  } catch {
    // 诊断解析失败不能让整个生成失败：退回最小诊断，拆解阶段仍能工作
    diag = {};
  }
  const domainKey = normalizeDomainKey(diag?.domainKey);
  const subject = String(diag?.subject || goal).trim();
  const knownSubject = diag?.knownSubject !== false;

  const risk = resolveRisk(diag?.riskLevel, goal);
  const analysis = {
    domainKey,
    domain: String(diag?.domain || "综合目标"),
    subject,
    expertiseAngle: String(diag?.expertiseAngle || ""),
    successCriteria: sanitizeList(diag?.successCriteria, ["能拿出可检验的阶段成果"]),
    keyMilestones: sanitizeList(diag?.keyMilestones, ["建立基线", "核心推进", "验收复盘"]),
    riskFactors: sanitizeList(diag?.riskFactors, ["中途失去节奏"]),
    coachStrategy: String(diag?.coachStrategy || ""),
    feasibilityNote: String(diag?.feasibilityNote || ""),
    riskLevel: risk.level,
    riskNote: String(diag?.riskNote || ""),
    disclaimer: risk.disclaimer,
  };

  // 第二段：按诊断结论 + 领域军规拆解
  const planUser =
    `目标：${goal}\n总天数：${days}天\n${profileLine}\n\n` +
    `【诊断结论】\n` +
    `领域：${analysis.domain}\n` +
    `对象：${analysis.subject}\n` +
    `专家视角：${analysis.expertiseAngle}\n` +
    `成功标准：${analysis.successCriteria.join("；")}\n` +
    `关键里程碑：${analysis.keyMilestones.join(" → ")}\n` +
    `主要风险：${analysis.riskFactors.join("；")}\n` +
    `陪练策略：${analysis.coachStrategy}\n` +
    `可行性：${analysis.feasibilityNote}\n` +
    (risk.level !== "none"
      ? `\n【安全约束 · 必须遵守】这是 ${risk.level} 类高风险目标。任务中禁止出现任何具体的医学/生理/投资/法律参数（剂量、心率上限、热量数字、体脂率目标、康复角度、投资标的、法律结论）。只安排记录、观察、准备问题、执行专业人士已给方案、建立习惯这类安全动作。\n`
      : "") +
    `\n请据此生成 ${days} 天的每日计划，严格返回JSON。`;

  const compact = days > COMPACT_THRESHOLD_DAYS;
  const sysPrompt = planSystemPrompt(domainKey, persona, knownSubject, compact);

  // 解析彻底失败时重生成一次：单纯的 JSON 语法坏掉不该让用户白等一分钟
  let plan: any;
  let planRaw = await callLLM(env, sysPrompt, planUser, 0.7, tokensForPlanDays(days, compact));
  try {
    plan = extractJSON(planRaw);
  } catch {
    planRaw = await callLLM(
      env,
      sysPrompt,
      `${planUser}\n\n注意：上一次输出的 JSON 无法解析。请确保是严格合法的 JSON，字符串内不要出现英文双引号。`,
      0.6,
      tokensForPlanDays(days, compact)
    );
    plan = extractJSON(planRaw);
  }

  let tasks = (Array.isArray(plan) ? plan : plan?.tasks || []).map((t: any, i: number) =>
    mapTask(t, i, dailyMinutes)
  );

  // 天数残缺是硬缺陷：JSON 修复能从坏掉的输出里救回一部分，
  // 但「要21天给8天」比直接失败更隐蔽，必须重生成而不是将就。
  let truncated = false;
  if (tasks.length > 0 && tasks.length < days * 0.9) {
    truncated = true;
    try {
      const fixRaw = await callLLM(
        env,
        sysPrompt,
        `${planUser}\n\n注意：上一次只输出了 ${tasks.length} 天，不完整。必须输出完整的 ${days} 天，字段可以更简短，但一天都不能少。`,
        0.6,
        tokensForPlanDays(days, true)
      );
      const fixPlan = extractJSON(fixRaw);
      const fixTasks = (Array.isArray(fixPlan) ? fixPlan : fixPlan?.tasks || []).map(
        (t: any, i: number) => mapTask(t, i, dailyMinutes)
      );
      if (fixTasks.length > tasks.length) tasks = fixTasks;
    } catch {
      // 重生成失败就保留能救回的部分
    }
  }

  // 质量校验：不合格就带着具体问题重写一次。
  // 但重写要再花一整轮生成时间，长计划上会把总时长推到连接被断开的区间，
  // 所以只在还有时间预算时才重写 —— 一版稍差的计划远好过一个失败的请求。
  let quality = assessPlan(tasks, subject, analysis);
  let retried = false;
  const elapsedMs = Date.now() - startedAt;
  const hasRetryBudget = elapsedMs < 45000;
  let skippedRetry = false;

  if (!quality.pass && tasks.length > 0 && !hasRetryBudget) {
    skippedRetry = true;
  }
  if (!quality.pass && tasks.length > 0 && hasRetryBudget) {
    retried = true;
    const retryUser =
      `${planUser}\n\n【上一版被判不合格】\n${quality.reasons.join("；")}\n` +
      `请重写。每一天的 task 都必须带上「${subject}」的具体内容或结构信息，禁止出现模板话，禁止两天雷同。`;
    try {
      planRaw = await callLLM(env, sysPrompt, retryUser, 0.85, tokensForPlanDays(days, compact));
      const retryPlan = extractJSON(planRaw);
      const retryTasks = (Array.isArray(retryPlan) ? retryPlan : retryPlan?.tasks || []).map(
        (t: any, i: number) => mapTask(t, i, dailyMinutes)
      );
      const retryQuality = assessPlan(retryTasks, subject, analysis);
      // 只在确实变好时才采用重写结果
      if (retryTasks.length > 0 && retryQuality.specificRate >= quality.specificRate) {
        tasks = retryTasks;
        quality = retryQuality;
      }
    } catch {
      // 重写失败保留第一版
    }
  }

  if (tasks.length === 0) {
    throw new Error("AI 返回了空计划");
  }

  return {
    analysis,
    tasks,
    meta: {
      twoStage: true,
      domainKey,
      knownSubject,
      retried,
      skippedRetry,
      truncated,
      dayCount: tasks.length,
      elapsedMs: Date.now() - startedAt,
      quality: {
        specificRate: Number(quality.specificRate.toFixed(2)),
        genericCount: quality.genericCount,
        duplicateCount: quality.duplicateCount,
        pass: quality.pass,
      },
    },
  };
}
