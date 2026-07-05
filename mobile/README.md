# 逐日 iOS App

Expo + React Native 构建的 AI 目标陪练 App。

## 产品定位

逐日不是普通 Todo，也不是一次性 AI 计划生成器。

它围绕“持续执行”设计：

- 创建目标时先做领域诊断和可行性判断
- 每天只呈现今日主任务、专项重点和最低完成版
- 完成时记录真实反馈
- 落后时 AI 重排剩余计划
- 每周根据执行数据做复盘

## 核心功能

- **目标问诊**：一句话输入目标，默认轻问诊，高级设置可调基础、节奏和时间分布。
- **AI 领域拆解**：返回目标领域、对象、成功标准、关键里程碑、风险和陪练策略。
- **可行性拦截**：明显不现实的目标会被提示降级，而不是硬拆成虚假计划。
- **今日陪练面板**：今日主任务、预计时长、专项重点、验收标准、最低完成版。
- **完成反馈**：记录实际耗时、难度、卡点和明天调整偏好。
- **提醒滑动窗口**：未完成时持续提醒，完成后停止后续提醒。
- **落后救援**：轻松追回、稳定追回、冲刺追回三种重排模式。
- **复盘页**：查看领先/落后、近 7 天执行和每周 AI 复盘。
- **Plus 弱入口**：核心陪跑免费，Plus 聚焦多目标、证明档案、深度复盘。

## 开发

```bash
npm install
npx expo start
```

常用检查：

```bash
npm run typecheck
npm run lint
```

## Expo Go 测试说明

Expo Go 可以测试核心流程：

- Onboarding
- 创建目标
- AI 生成计划
- 今日任务
- 完成反馈
- 目标详情
- 复盘页

注意：

- `expo-notifications` 在 Expo Go 中能力不完整，完整通知体验需要 dev client 或 TestFlight。
- `react-native-purchases` 需要原生模块，在 Expo Go 中会自动降级为免费模式。
- 内购完整测试需要 RevenueCat 配置 + dev client / TestFlight。

## 目录结构

```text
src/
  app/
    (tabs)/
      index.tsx       今日陪练面板
      calendar.tsx    复盘页
      settings.tsx    设置 / 提醒 / Plus
    create.tsx        创建目标与计划确认
    goal/[id].tsx     目标详情 / 落后救援 / 证书
    onboarding.tsx    首次引导
    paywall.tsx       Plus 介绍
  components/         通用 UI、动效、证书
  lib/
    ai.ts             AI 生成 / 重排 / 督促 / 复盘
    domainCoach.ts    本地域名识别与兜底计划
    feasibility.ts    目标可行性判断
    store.ts          打卡、反馈、streak、徽章、复活卡
    notifications.ts  本地提醒调度
    purchases.ts      RevenueCat 封装
    types.ts          核心类型
  theme/              颜色、圆角、间距
```

## 上架前配置

1. `src/lib/purchases.ts` 填入 `REVENUECAT_IOS_API_KEY`
2. Cloudflare Worker 部署最新版：

```bash
cd ../worker
npx wrangler deploy
```

3. 确认 Worker secret 已配置：

```bash
npx wrangler secret put API_KEY
```

更多上架资料见：

- [../docs/launch-guide.md](../docs/launch-guide.md)
- [../docs/app-store-listing.md](../docs/app-store-listing.md)
