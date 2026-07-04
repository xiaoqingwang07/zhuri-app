# 逐日 iOS App

「说出你的目标，AI 教练管到底」——用 Expo (React Native) 构建的原生 App。

## 核心功能

- **AI 智能拆解**：一句话目标 → N 天可执行的每日任务计划（可重生成、单条编辑）
- **AI 动态调整**（杀手锏）：落后时一键让 AI 重排剩余计划，不用推倒重来
- **AI 教练人格**：温柔鼓励 / 毒舌教练 / 数据理性，督促文案按真实进度生成
- **每周 AI 复盘**：本周亮点 + 下周建议
- **打卡激励**：连续 streak、6 档徽章、复活卡补救、成就证书分享图
- **商业化**：逐日 Pro 订阅 + 复活卡内购（RevenueCat）

## 开发

```bash
npm install
npm run ios        # iOS 模拟器（需要 Xcode）
npm run lint       # ESLint
npm run typecheck  # TypeScript
```

注意：`react-native-purchases` 需要原生模块，在 Expo Go 中会自动降级为免费模式；
完整测试内购需要 dev client 或 TestFlight 构建。

## 构建与上架

见 [../docs/launch-guide.md](../docs/launch-guide.md) 和 [../docs/app-store-listing.md](../docs/app-store-listing.md)。

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --latest
```

## 目录结构

```
src/
  app/            # expo-router 路由
    (tabs)/       # 今日 / 日历 / 设置
    create.tsx    # 创建目标（AI 拆解流程）
    goal/[id].tsx # 目标详情（复活卡 / AI 重排 / 证书）
    paywall.tsx   # 付费墙
    onboarding.tsx
  components/     # UI 组件（Confetti、BadgeModal、Certificate…）
  lib/            # 业务逻辑
    db.ts         # SQLite 存储
    store.ts      # 打卡 / streak / 徽章 / 复活卡
    ai.ts         # AI 拆解 / 调整 / 督促 / 复盘（走 Cloudflare Worker）
    entitlements.ts # Pro 状态与免费配额
    purchases.ts  # RevenueCat 封装
    notifications.ts # 本地提醒（7 天滑动窗口）
  theme/          # 颜色 / 圆角 / 间距
```

## 上架前必填配置

1. `src/lib/purchases.ts` → `REVENUECAT_IOS_API_KEY`（RevenueCat iOS Public Key）
2. Worker 部署最新版（新增 /adjust /coach /review 端点）：`cd ../worker && npx wrangler deploy`
