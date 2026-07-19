# 逐日

> AI 目标陪练：先理解目标，再陪你每天推进。

逐日不是一个简单的打卡清单，也不是“把目标丢给 AI 生成一张计划表”。

它的核心目标是：让用户每天只面对今天最该做的一步；忙的时候有最低完成版，掉队的时候能被救回来，完成后还能通过反馈让计划越来越贴近自己。

## 当前版本重点

- **领域专家式拆解**：AI 会先分析目标领域、对象、成功标准、关键风险和陪练策略，再生成计划。
- **可行性判断**：对明显离谱的目标会先拦截或建议降级，例如短期读完超大部头、从零完成过载训练等。
- **每天只看今天**：首页聚焦今日主任务、专项重点、验收标准和最低完成版。
- **完成反馈**：打卡不只是点完成，会记录实际耗时、难度、卡点和明天是否要调整。
- **落后救援**：断了不用重开，AI 可以把剩余任务重新排成从今天开始的节奏。
- **通知绑定**：未完成时会安排递进提醒，完成当日任务后停止后续提醒。
- **复盘导向**：复盘页查看执行节奏、领先/落后情况和每周 AI 建议。

## 为什么不用直接问 ChatGPT / 豆包 / 千问？

通用聊天机器人擅长回答问题，但不会天然承担“持续陪你执行”的产品职责。

逐日要解决的是连续执行：

- 它会保存目标、计划、反馈和完成记录。
- 它每天主动提醒，而不是等用户想起来再打开。
- 它知道你昨天做得难不难、卡在哪里。
- 它会在你掉队后重排计划，而不是让你重新问一遍。
- 它把目标拆解、今日执行、反馈、救援和复盘放在同一个闭环里。

一句话：聊天机器人帮你想清楚，逐日要陪你做下去。

## 产品主线

```text
创建目标
  -> AI 领域诊断
  -> 可执行计划
  -> 今日任务
  -> 完成反馈
  -> 通知提醒
  -> 落后救援
  -> 每周复盘
```

## 免费版与 Plus

核心陪跑功能优先保持免费，包括：

- AI 生成陪跑计划
- 今日任务与最低完成版
- 每日提醒
- 完成反馈
- 落后救援
- 最多 3 个目标同时进行

Plus 当前已交付：

- 12 个目标并行
- 更高 AI 调用额度
- 成就证书去水印分享

复活卡当前只作为免费救援机制，不做单独售卖和广告变现。

## 技术架构

```text
.
├── mobile/   Expo + React Native iOS App
├── worker/   Cloudflare Worker AI proxy
├── docs/     上架、产品策略、质量评测文档
└── app/      早期 Web 版本代码
```

主要技术：

- **Mobile**：Expo SDK 54、React Native、expo-router、TypeScript
- **Local storage**：SQLite / KV wrapper
- **AI proxy**：Cloudflare Worker + MiniMax OpenAI-compatible API
- **Payments**：RevenueCat wrapper，当前未配置上线 key
- **Notifications**：expo-notifications，本地提醒滑动窗口

## 本地开发

### iOS App

```bash
cd mobile
npm install
npx expo start
```

Expo Go 可用于基础体验测试。通知和内购在 Expo Go 中有原生限制，完整验证需要 dev client 或 TestFlight。

常用检查：

```bash
cd mobile
npm run typecheck
npm run lint
```

### Worker

```bash
cd worker
npx wrangler deploy
```

Worker secret 不写入仓库，需要在 Cloudflare 中配置：

```bash
npx wrangler secret put API_KEY
```

## 质量评测

AI 计划质量评测集见：

- [docs/plan-quality-eval.md](docs/plan-quality-eval.md)

每次调整模型、prompt 或目标拆解逻辑，都应该检查：

- 是否有目标对象感
- 是否避免模板化
- 是否强度可执行
- 是否有最低完成版和验收标准
- 是否能处理不现实目标

## 上架资料

- [docs/launch-guide.md](docs/launch-guide.md)
- [docs/app-store-listing.md](docs/app-store-listing.md)
- [docs/revive-card-design.md](docs/revive-card-design.md)

## License

MIT
