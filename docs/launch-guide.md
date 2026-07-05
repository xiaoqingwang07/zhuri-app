# 逐日 iOS 上架完整指引

从零到 App Store 的每一步。标 👤 的需要你本人操作（账号/付款类），其余都可以随时叫我做。

## 第一阶段：账号准备（现在就可以开始，审核要等 1-2 天）

### 👤 1. 注册 Apple Developer 账号（$99/年）

1. 访问 https://developer.apple.com/programs/enroll/
2. 用你的 Apple ID 登录（建议开启双重认证，必需）
3. 选择「个人（Individual）」类型
4. 支付 $99 年费（约 ¥688，支持银联/Visa）
5. 等待审核通过（通常 24-48 小时，会发邮件通知）

### 👤 2. 注册 RevenueCat 账号（免费）

1. 访问 https://app.revenuecat.com/signup 注册
2. 创建项目「zhuri」，添加 iOS App（Bundle ID: `com.zhuri.app`）
3. 拿到 iOS Public API Key（形如 `appl_xxxx`）
4. 把 Key 发给我，或自己填到 `mobile/src/lib/purchases.ts` 的 `REVENUECAT_IOS_API_KEY`

### 👤 3. 注册 Expo 账号（免费）

1. 访问 https://expo.dev/signup 注册
2. 在 `mobile/` 目录运行 `npx eas login` 登录

## 第二阶段：App Store Connect 配置（开发者账号通过后）

### 👤 4. 创建 App

1. 登录 https://appstoreconnect.apple.com
2. 「我的 App」→「+」→「新建 App」
3. 平台 iOS，名称「逐日 - AI目标教练」，Bundle ID 选 `com.zhuri.app`（先在 developer.apple.com → Identifiers 中创建），SKU 填 `zhuri001`

### 👤 5. 创建内购品项

按 [app-store-listing.md](app-store-listing.md) 的「内购品项」表格，在 App Store Connect → 功能 → App 内购买项目中创建 2 个订阅品项，然后到 RevenueCat 后台：
1. 创建 Entitlement `pro`
2. 创建 Offering（默认），挂上月度/年度两个 Package

### 👤 6. 签署协议

App Store Connect → 协议、税务和银行业务：签署付费 App 协议，填银行收款账户（这一步不做，内购无法上线）。

## 第三阶段：构建与提交（我来做为主）

### 7. 构建 TestFlight 包

```bash
cd mobile
npx eas build --platform ios --profile production
# 首次会引导创建证书（选自动管理），需要你输入 Apple ID 授权
npx eas submit --platform ios --latest
```

### 8. TestFlight 真机测试

App Store Connect → TestFlight → 添加你自己为内部测试员，手机装 TestFlight 应用即可安装体验。重点测试：创建目标（AI 拆解）、打卡、提醒、订阅沙盒购买。

### 9. 填写商店信息并提交审核

按 [app-store-listing.md](app-store-listing.md) 填写描述、关键词、截图、隐私标签，选择构建版本，提交审核。首次审核通常 1-3 天。

## 后端部署（Worker 更新，我来做）

Worker 新增了 /adjust、/coach、/review 端点和限流，需要重新部署：

```bash
cd worker
npx wrangler deploy
# 如果提示 KV 未绑定，在 wrangler.toml 中取消注释 kv_namespaces 并填入 ID
# 确认 secret 存在：npx wrangler secret list
# 配置订阅校验（可选）：npx wrangler secret put RC_API_KEY  # 填 RevenueCat 的 secret key（sk_ 开头）
```

隐私政策页面部署：把代码推到 GitHub main 分支，Pages CI 会自动发布
https://xiaoqingwang07.github.io/zhuri-app/privacy.html 和 /terms.html。

## 常见被拒原因与我们的对策

| 审核点 | 我们的处理 |
|--------|-----------|
| 3.1.2 订阅信息不全 | 付费墙已含价格、试用说明、自动续订说明、恢复购买按钮 |
| 5.1.1 强制注册 | 无账号系统，全功能免注册可用 |
| 隐私政策链接失效 | 上架前确认 GitHub Pages 已部署 |
| AI 生成内容 | 描述中注明"AI 生成内容仅供参考"（服务条款第一条） |
| 最低功能要求 | 核心闭环完整：拆解→打卡→统计→复盘 |

## 上线后的增长与收入建议（v1.1 方向）

1. 小红书/抖音发「AI 帮我把 30 天目标拆好了」类内容引流（附成就证书截图）
2. 证书分享图自带 App 名称水印（免费版），形成自传播
3. 观察数据后再做：好友监督（真后端）、Widget 小组件、Apple Watch 打卡
4. ASO：上线两周后根据搜索词报告迭代关键词
