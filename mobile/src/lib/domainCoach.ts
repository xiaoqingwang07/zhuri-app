import { DayTask, DEFAULT_GOAL_PROFILE, GoalAnalysis, GoalProfile } from "./types";

type DomainKey =
  | "reading"
  | "fitness"
  | "coding"
  | "language"
  | "exam"
  | "creation"
  | "habit"
  | "life";

interface TaskDraft {
  task: string;
  pages: string;
  type: string;
}

function subjectFromGoal(goal: string): string {
  const book = goal.match(/《([^》]+)》/)?.[1];
  if (book) return book.trim();
  return goal
    .replace(/^\d+\s*天/, "")
    .replace(/读完|看完|学会|完成|养成|坚持|目标|计划/g, "")
    .trim()
    .slice(0, 28) || goal.slice(0, 28);
}

export function inferGoalDomain(goal: string): DomainKey {
  const g = goal.toLowerCase();
  if (/读|书|阅读|看完|《/.test(goal)) return "reading";
  if (/跑|健身|运动|锻炼|马拉松|公里|游泳|骑车|减肥|减重|增肌|瑜伽/.test(goal)) return "fitness";
  if (/开发|编程|代码|app|程序|网站|项目|上线|功能|产品|python|java|爬虫|小程序|react/i.test(g)) return "coding";
  if (/英语|日语|韩语|法语|语言|口语|听力|单词|雅思|托福|发音|对话/.test(goal)) return "language";
  if (/考试|考研|考公|考证|证书|刷题|申论|行测|四六级|备考|面试/.test(goal)) return "exam";
  if (/写作|小说|文章|画|绘|摄影|视频|剪辑|播客|音乐|吉他|钢琴|作品|创作/.test(goal)) return "creation";
  if (/习惯|早起|冥想|打卡|戒|睡眠|整理|日记|自律/.test(goal)) return "habit";
  return "life";
}

function profileTone(profile: GoalProfile) {
  const level =
    profile.currentLevel === "advanced" ? "已有基础" : profile.currentLevel === "some" ? "有一点基础" : "从入门开始";
  const pace =
    profile.pace === "ambitious" ? "可以安排小冲刺" : profile.pace === "gentle" ? "先稳住，不追求猛" : "稳定推进";
  return `${level}，每天约${profile.dailyMinutes}分钟，${pace}`;
}

function knownReadingAnalysis(subject: string): Partial<GoalAnalysis> | null {
  if (/红楼梦/.test(subject)) {
    return {
      expertiseAngle: "不是按页数硬啃，而是抓住贾府结构、宝黛钗关系、金陵十二钗、诗词判词和家族衰败线。",
      successCriteria: ["能说清贾府主要人物关系", "能复述宝黛钗主线变化", "能用3个细节解释盛极而衰"],
      keyMilestones: ["贾府人物地图", "宝黛钗关系线", "大观园与诗社", "抄检大观园", "主题复盘"],
      riskFactors: ["人物太多导致混乱", "只追剧情忽略伏笔", "前80回与后40回阅读预期不同"],
      coachStrategy: "先搭人物地图，再读关键情节，最后用主题线把细节收束。",
    };
  }
  if (/马斯克|elon|musk/i.test(subject)) {
    return {
      expertiseAngle: "按人生阶段和公司战役读：PayPal、SpaceX、Tesla、Twitter/X，以及第一性原理和高压管理的两面性。",
      successCriteria: ["能复述3场关键商业战役", "能解释第一性原理在产品中的用法", "能辨析高压管理的收益和代价"],
      keyMilestones: ["童年与性格底色", "PayPal与创业方法", "SpaceX/Tesla生死战", "Twitter/X争议", "方法论复盘"],
      riskFactors: ["只看传奇不看代价", "公司线索交叉导致断片", "把传记读成鸡血故事"],
      coachStrategy: "用事件-决策-代价-可迁移经验四格法读，不做盲目崇拜。",
    };
  }
  return null;
}

export function buildFallbackGoalAnalysis(
  goal: string,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE
): GoalAnalysis {
  const domain = inferGoalDomain(goal);
  const subject = subjectFromGoal(goal);
  const base = `${subject}；${profileTone(profile)}`;

  if (domain === "reading") {
    const known = knownReadingAnalysis(subject);
    return {
      domain: "阅读理解",
      subject,
      expertiseAngle:
        known?.expertiseAngle || "先识别书的结构、核心问题和作者论证方式，再安排阅读、摘录、复述和输出。",
      successCriteria:
        known?.successCriteria || ["能说清全书主线", "能提炼3-5个关键观点", "能写出自己的判断和行动启发"],
      keyMilestones:
        known?.keyMilestones || ["目录和问题意识", "核心章节精读", "观点卡片", "结构复盘", "输出读后感"],
      riskFactors:
        known?.riskFactors || ["只按页数推进但没有理解", "笔记堆积过多", "后半程疲劳放弃"],
      coachStrategy:
        known?.coachStrategy || `围绕「${base}」做精读陪跑：每天有阅读范围，也必须有一句复述或判断。`,
    };
  }

  const map: Record<DomainKey, GoalAnalysis> = {
    reading: {} as GoalAnalysis,
    fitness: {
      domain: "运动训练",
      subject,
      expertiseAngle: "先做基线评估，再用渐进负荷推进，训练、恢复和测试要一起设计。",
      successCriteria: ["能稳定完成目标动作或距离", "训练后恢复可控", "有可记录的数据进步"],
      keyMilestones: ["基线测试", "动作/配速建立", "容量提升", "专项强化", "终测复盘"],
      riskFactors: ["一开始过猛导致受伤", "只训练不恢复", "没有记录无法调整"],
      coachStrategy: `按「${base}」安排强弱交替，宁可稳一点，也不能把身体练崩。`,
    },
    coding: {
      domain: "项目/编程",
      subject,
      expertiseAngle: "像做真实项目一样拆：需求边界、技术方案、最小可用版本、实现、测试、发布反馈。",
      successCriteria: ["能跑通核心功能", "有可演示成果", "知道下一版要优化什么"],
      keyMilestones: ["需求拆解", "技术骨架", "核心功能", "测试修复", "发布复盘"],
      riskFactors: ["一上来做太大", "卡在环境配置", "只写功能不验证"],
      coachStrategy: `把「${base}」压成一个可以交付的 MVP，每天都产出可见增量。`,
    },
    language: {
      domain: "语言训练",
      subject,
      expertiseAngle: "输入和输出必须配对：词汇、听力、跟读、口语/写作输出、错题复盘一起走。",
      successCriteria: ["能完成目标场景表达", "听说读写至少一项有明显进步", "有可复用表达库"],
      keyMilestones: ["基线录音/测试", "高频输入", "跟读模仿", "场景输出", "复测"],
      riskFactors: ["只背不说", "材料太难", "缺少复听和纠音"],
      coachStrategy: `围绕「${base}」每天制造一次真实输出，避免只收集资料。`,
    },
    exam: {
      domain: "备考训练",
      subject,
      expertiseAngle: "先拆考纲和题型，再用薄弱点驱动刷题，错题本和模拟测试决定后续安排。",
      successCriteria: ["明确高频考点", "错题能复盘归因", "模拟表现趋于稳定"],
      keyMilestones: ["考纲扫描", "题型基线", "模块训练", "限时模拟", "错题回炉"],
      riskFactors: ["盲目刷题", "不复盘错因", "临近考试才做限时训练"],
      coachStrategy: `按「${base}」少做无效努力，每天都要留下一个可修正的错因。`,
    },
    creation: {
      domain: "创作训练",
      subject,
      expertiseAngle: "创作目标要同时拆灵感输入、技法练习、作品产出和反馈迭代。",
      successCriteria: ["有可展示作品", "能说清创作意图", "至少完成一次修改迭代"],
      keyMilestones: ["参考收集", "技法练习", "草稿/样片", "反馈修改", "发布归档"],
      riskFactors: ["只找灵感不动手", "过早追求完美", "没有反馈闭环"],
      coachStrategy: `围绕「${base}」保证每天有小产出，先完成再打磨。`,
    },
    habit: {
      domain: "习惯养成",
      subject,
      expertiseAngle: "习惯不是靠意志硬扛，要设计触发点、最低动作、环境阻力和复盘机制。",
      successCriteria: ["能在固定触发点行动", "中断后能恢复", "完成记录可持续"],
      keyMilestones: ["触发点设计", "最低动作", "环境改造", "连续执行", "复盘固化"],
      riskFactors: ["目标动作太大", "没有固定场景", "漏一天后直接放弃"],
      coachStrategy: `把「${base}」改造成低摩擦动作，让用户先赢下开始。`,
    },
    life: {
      domain: "综合目标",
      subject,
      expertiseAngle: "先定义可验收结果，再拆成调研、执行、反馈和复盘四个阶段。",
      successCriteria: ["每天有可见进展", "阶段结果能被验收", "能根据反馈调整"],
      keyMilestones: ["目标澄清", "资源准备", "关键执行", "验收调整", "总结迁移"],
      riskFactors: ["目标太虚", "动作不可衡量", "缺少反馈"],
      coachStrategy: `先把「${base}」落成可检查动作，再按天推进。`,
    },
  };

  return map[domain];
}

function pick<T>(items: T[], index: number, total: number): T {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  return items[Math.min(items.length - 1, Math.floor(ratio * items.length))];
}

export function buildDomainTaskDraft(goal: string, index: number, totalDays: number): TaskDraft | null {
  const domain = inferGoalDomain(goal);
  const subject = subjectFromGoal(goal);
  const day = index + 1;

  if (domain === "reading" && /红楼梦/.test(subject)) {
    const tasks: TaskDraft[] = [
      { task: "画出贾府人物地图", pages: "人物关系", type: "reading" },
      { task: "精读宝黛钗初见线", pages: "宝黛钗", type: "reading" },
      { task: "梳理刘姥姥视角", pages: "阶层对照", type: "notes" },
      { task: "阅读大观园与诗社", pages: "大观园", type: "reading" },
      { task: "分析抄检大观园", pages: "转折事件", type: "review" },
      { task: "整理十二钗命运线", pages: "人物命运", type: "notes" },
      { task: "复盘盛衰主题", pages: "全书主题", type: "summary" },
    ];
    return pick(tasks, index, totalDays);
  }

  if (domain === "reading" && /马斯克|elon|musk/i.test(subject)) {
    const tasks: TaskDraft[] = [
      { task: "梳理童年与性格底色", pages: "早期经历", type: "reading" },
      { task: "复盘PayPal创业战", pages: "PayPal", type: "notes" },
      { task: "拆解SpaceX生死局", pages: "SpaceX", type: "reading" },
      { task: "分析Tesla关键决策", pages: "Tesla", type: "review" },
      { task: "辨析Twitter/X争议", pages: "Twitter/X", type: "review" },
      { task: "提炼第一性原理", pages: "方法论", type: "notes" },
      { task: "写下可迁移经验", pages: "总结", type: "summary" },
    ];
    return pick(tasks, index, totalDays);
  }

  if (domain === "fitness") {
    const tasks: TaskDraft[] = [
      { task: "做一次基线测试", pages: "配速/次数", type: "warmup" },
      { task: "练动作和呼吸节奏", pages: `第${day}天`, type: "practice" },
      { task: "完成渐进训练", pages: `第${day}天`, type: "workout" },
      { task: "安排恢复和拉伸", pages: "恢复日", type: "recovery" },
      { task: "完成一次阶段测试", pages: "终测", type: "race" },
    ];
    return pick(tasks, index, totalDays);
  }

  if (domain === "coding") {
    const tasks: TaskDraft[] = [
      { task: "写清MVP需求边界", pages: "需求清单", type: "planning" },
      { task: "搭建可运行骨架", pages: "项目骨架", type: "coding" },
      { task: "实现核心路径", pages: "核心功能", type: "coding" },
      { task: "测试并修复问题", pages: "Bug清单", type: "debugging" },
      { task: "整理演示和下一版", pages: "发布复盘", type: "summary" },
    ];
    return pick(tasks, index, totalDays);
  }

  if (domain === "language") {
    const tasks: TaskDraft[] = [
      { task: "录一段基线表达", pages: "1分钟", type: "speaking" },
      { task: "精听并跟读材料", pages: "听说输入", type: "listening" },
      { task: "做场景口语输出", pages: "场景表达", type: "speaking" },
      { task: "复盘高频错误", pages: "错句清单", type: "review" },
      { task: "完成复测录音", pages: "对比复测", type: "summary" },
    ];
    return pick(tasks, index, totalDays);
  }

  if (domain === "exam") {
    const tasks: TaskDraft[] = [
      { task: "拆考纲和题型", pages: "考点地图", type: "planning" },
      { task: "做模块基础题", pages: "基础题", type: "exam" },
      { task: "攻克薄弱题型", pages: "错题模块", type: "practice" },
      { task: "限时完成一组题", pages: "限时练", type: "mock" },
      { task: "复盘错因和策略", pages: "错题本", type: "review" },
    ];
    return pick(tasks, index, totalDays);
  }

  return null;
}

export function enrichTaskWithDomainContext(
  goal: string,
  task: DayTask,
  index: number,
  totalDays: number,
  profile: GoalProfile = DEFAULT_GOAL_PROFILE,
  analysis = buildFallbackGoalAnalysis(goal, profile)
): DayTask {
  const milestone = pick(analysis.keyMilestones, index, totalDays);
  const risk = pick(analysis.riskFactors, index, totalDays);
  return {
    ...task,
    focus: task.focus || milestone,
    rationale: task.rationale || `今天先处理「${milestone}」，比泛泛推进更容易形成真实进展。`,
    successCheck: task.successCheck || `能说清或展示「${milestone}」的一个具体结果。`,
    coachTip: task.coachTip || `别追求一次做完，避开「${risk}」，先把今天这一步做扎实。`,
  };
}
