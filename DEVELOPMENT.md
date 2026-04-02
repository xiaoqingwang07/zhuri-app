# 逐日 - 开发文档 v0.2

## 一、产品概述

**逐日** — 每天追逐目标，你不是一个人。

帮助用户把大目标拆解成每日可执行的任务，通过 AI 驱动、社交监督、连续打卡奖励，让坚持变得上瘾。

**核心产品逻辑：让用户害怕断掉，而不是给用户退路。**

---

## 二、当前进度

| 模块 | 状态 |
|------|------|
| 目标输入 + AI拆解 | ✅ 完成 |
| 每日打卡 | ✅ 完成 |
| 连续徽章 | ✅ 完成 |
| 监督广场 | ✅ 完成 |
| 多目标并行 | ✅ 完成 |
| 完成纪念卡片 | ✅ 完成（UI） |
| 严格打卡（无补卡） | ✅ 完成 |
| 提醒轰炸 | ❌ 待开发 |
| 复活卡 | ❌ 待开发 |
| 正式部署上线 | ❌ 待完成 |

---

## 三、功能需求清单

### 3.1 必须修复（P0）

#### P0-1：AI生成时加载反馈
**问题：** 点击"开始逐日"后无反馈，用户以为点失败了

**修改位置：** `app/page.tsx` - `createGoal` 函数

**修改方案：**
```tsx
// 1. 按钮文案改为"AI正在拆解目标..."
// 2. 添加加载状态显示
// 3. 超时处理（10秒未响应则使用默认任务）

const handleCreateGoal = async () => {
  setIsCreating(true);
  setError("");
  
  try {
    // 显示加载状态
    let tasks;
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("超时")), 10000)
    );
    
    const aiPromise = generateTasksWithAI(goalName, totalDays);
    tasks = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    setError("AI生成失败，使用默认任务");
    tasks = generateDefaultTasks(totalDays, goalName);
  }
  // ...
}
```

**预计工时：** 1小时

---

#### P0-2：打卡动画和反馈
**问题：** 打卡无仪式感，点一下就结束

**修改位置：** `app/page.tsx` - 打卡按钮

**修改方案：**
```tsx
// 1. 打卡时添加 CSS 动画
// 2. 打卡后显示庆祝文案（2秒后消失）
// 3. 添加粒子效果（可选）

// globals.css 添加：
@keyframes check-success {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); background: var(--success); }
  100% { transform: scale(1); }
}

.check-success {
  animation: check-success 0.5s ease-out;
}

// 打卡成功后显示：
{justCheckedIn && (
  <div className="fixed top-1/3 left-0 right-0 text-center pointer-events-none">
    <p className="text-2xl font-bold text-[var(--success)]">✓ 打卡成功！</p>
    <p className="text-sm text-[var(--text-secondary)]">连续 {streak} 天</p>
  </div>
)}
```

**预计工时：** 2小时

---

#### P0-3：纪念证书真实分享
**问题：** 证书UI是假的，无法真正分享

**修改位置：** 新建 `components/Certificate.tsx`

**修改方案：**
```tsx
// 1. 使用 html2canvas 将 DOM 转成图片
// 2. 提供"保存到相册"和"分享到微信"按钮
// 3. 微信分享调用 Web Share API

import html2canvas from 'html2canvas';

const Certificate = ({ goalData }) => {
  const handleSave = async () => {
    const element = document.getElementById('certificate');
    const canvas = await html2canvas(element);
    const link = document.createElement('a');
    link.download = `逐日-${goalData.name}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      const element = document.getElementById('certificate');
      const canvas = await html2canvas(element);
      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'certificate.png', { type: 'image/png' });
        await navigator.share({
          files: [file],
          title: '我在逐日完成了目标',
          text: `我在逐日坚持了${goalData.days}天，完成了「${goalData.name}」！`
        });
      });
    } else {
      // 降级：提示用户长按保存
      alert("请长按证书保存到相册");
    }
  };

  return (
    <div id="certificate" className="certificate-card">
      {/* 精美证书设计 */}
    </div>
  );
};
```

**预计工时：** 4小时

---

### 3.2 体验优化（P1）

#### P1-1：首次使用引导
**问题：** 用户第一次打开不知道干什么

**修改位置：** 新建 `components/Onboarding.tsx`

**修改方案：**
```tsx
// 首次打开检测 localStorage 中是否有数据
// 如果没有，显示3页引导：

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  
  const slides = [
    { title: "逐日", subtitle: "每天追逐目标，你不是一个人", icon: "🏃" },
    { title: "AI智能拆解", subtitle: "输入目标，AI帮你规划每一天", icon: "🤖" },
    { title: "坚持打卡", subtitle: "连续打卡解锁徽章，和朋友互相监督", icon: "🔥" },
  ];
  
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span className="text-8xl">{slides[step].icon}</span>
          <h1 className="text-3xl font-bold mt-4">{slides[step].title}</h1>
          <p className="text-[var(--text-secondary)] mt-2">{slides[step].subtitle}</p>
        </div>
      </div>
      <div className="p-6">
        <div className="flex justify-center gap-2 mb-4">
          {slides.map((_, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${i === step ? 'bg-white' : 'bg-gray-600'}`} />
          ))}
        </div>
        <button onClick={() => step < 2 ? setStep(step + 1) : onComplete()} className="w-full bg-[var(--accent)] py-3 rounded-xl">
          {step < 2 ? "下一步" : "开始使用"}
        </button>
      </div>
    </div>
  );
};
```

**预计工时：** 3小时

---

#### P1-2：预设目标模板
**问题：** 用户不知道该填什么

**修改位置：** `app/page.tsx` - 创建目标表单

**修改方案：**
```tsx
// 在输入框下方添加预设模板：
const templates = [
  { name: "📚 读书计划", placeholder: "20天内读完《xxx》", days: 20 },
  { name: "🏃 跑步计划", placeholder: "30天完成100公里", days: 30 },
  { name: "💻 技能学习", placeholder: "30天学会Python", days: 30 },
  { name: "📝 习惯养成", placeholder: "21天养成xxx习惯", days: 21 },
];

// UI:
<div className="flex flex-wrap gap-2 mb-4">
  {templates.map((t) => (
    <button
      key={t.name}
      onClick={() => {
        setGoalName(t.placeholder);
        setTotalDays(t.days);
      }}
      className="px-3 py-1.5 bg-[var(--bg-primary)] rounded-full text-xs text-[var(--text-secondary)] hover:text-white"
    >
      {t.name}
    </button>
  ))}
</div>
```

**预计工时：** 1小时

---

#### P1-3：任务展示优化
**问题：** 一次性展示20天任务，有压迫感

**修改位置：** `app/page.tsx` - 日历Tab

**修改方案：**
```tsx
// 今日任务：只显示今天的
// 日历Tab：只显示近7天 + 远的折叠

<div className="mb-4">
  <h3 className="font-semibold mb-2">最近7天</h3>
  <div className="grid grid-cols-7 gap-1">
    {activeGoal.tasks.slice(0, 7).map((task) => (
      <div className={...}>...</div>
    ))}
  </div>
</div>

<button 
  onClick={() => setShowAllDays(!showAllDays)}
  className="text-sm text-[var(--accent)]"
>
  {showAllDays ? "收起" : `查看全部${totalDays}天`}
</button>
```

**预计工时：** 2小时

---

### 3.3 社交功能（P1）

#### P1-4：邀请朋友功能
**问题：** 监督广场是假数据

**修改方案：**
```tsx
// 1. 生成分享链接（包含用户ID）
// 2. 朋友打开链接后加入同一个"监督组"
// 3. 使用 URL Scheme 或 deep link

// 分享按钮：
const handleInvite = () => {
  const inviteUrl = `${window.location.origin}/join/${userId}`;
  navigator.clipboard.writeText(inviteUrl);
  alert("邀请链接已复制！分享给朋友即可一起监督");
};
```

**预计工时：** 4小时（需要后端支持）

---

### 3.4 提醒轰炸（P2）

#### P2-1：每日提醒通知
**问题：** 用户断了之后没有持续骚扰

**修改方案：**
```tsx
// 使用 Web Push API
// 用户授权后，可以发送推送通知

const requestNotificationPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('逐日', {
        body: '今天你还没打卡，坚持住！',
        icon: '/icon.png'
      });
    }
  }
};

// 定时检查：如果当天未打卡，在21:00发送提醒
useEffect(() => {
  const checkAndNotify = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = activeGoal?.tasks.filter(t => t.date === today);
    const completed = todayTasks?.every(t => t.completed);
    
    if (!completed && new Date().getHours() >= 21) {
      new Notification('逐日 - 打卡提醒', {
        body: '今天还剩1小时，你的连续天数危险了！',
      });
    }
  };
  
  const interval = setInterval(checkAndNotify, 60 * 60 * 1000); // 每小时检查
  return () => clearInterval(interval);
}, [activeGoal]);
```

**预计工时：** 4小时

---

### 3.5 复活卡（P2）

#### P2-2：钻石系统
**修改方案：**
```tsx
interface User {
  diamonds: number;
  resurrectionCards: number;
}

// 复活卡使用：
const useResurrectionCard = () => {
  if (user.resurrectionCards > 0) {
    setUser({ ...user, resurrectionCards: user.resurrectionCards - 1 });
    // 保护今天不断
  } else {
    alert('没有复活卡了，明天继续加油！');
  }
};

// 充值钻石：
const buyDiamonds = async (amount: number) => {
  // 后续对接支付
};
```

**预计工时：** 6小时（含支付对接）

---

## 四、技术债务

### 4.1 数据存储
**当前：** LocalStorage（单设备）

**问题：** 用户换设备数据丢失，多设备不同步

**建议：** 后续接入 Supabase / Firebase

---

### 4.2 API Key 安全
**当前：** Key 硬编码在前端代码

**问题：** Key 暴露在浏览器中

**建议：** 后续将 AI 调用移到后端 API Route

```tsx
// app/api/generate/route.ts
export async function POST(req: Request) {
  const { goal, days } = await req.json();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.SILICONFLOW_KEY // 服务端环境变量
    },
    body: JSON.stringify({ model, messages })
  });
  return response.json();
}
```

---

### 4.3 部署
**当前：** localhost.run tunnel（临时）

**待完成：**
1. 注册 Vercel 账号
2. 连接 GitHub
3. 部署上线
4. 配置自定义域名（GoalPace.cn）

---

## 五、里程碑规划

### M1：MVP完成（1天）
- [x] 目标输入 + AI拆解
- [x] 每日打卡
- [x] 连续徽章
- [x] 监督广场
- [x] 多目标并行
- [x] 完成卡片
- [ ] P0-1: 加载反馈
- [ ] P0-2: 打卡动画
- [ ] P0-3: 证书分享
- [ ] P1-1: 首次引导
- [ ] P1-2: 预设模板

### M2：内测上线（2-3天）
- [ ] P1-3: 任务展示优化
- [ ] P1-4: 邀请朋友
- [ ] Vercel 部署
- [ ] 庆爷 + 4朋友内测

### M3：提醒系统（1周）
- [ ] P2-1: 每日提醒通知
- [ ] P2-2: 钻石/复活卡

### M4：正式发布
- [ ] 后端 API 重构
- [ ] 多设备同步
- [ ] App 版本（React Native）

---

## 六、快捷链接

| 资源 | 地址 |
|------|------|
| 代码仓库 | `~/.openclaw/workspace/zhuri-app/` |
| 产品文档 | `~/.openclaw/workspace/memory/2026-04-02.md` |
| 硅基流动API | https://account.siliconflow.cn |
| 设计稿 | 待补充 |

---

## 七、待庆爷确认

1. **证书设计**：需要你提供具体的设计要求或参考案例
2. **预设模板**：上面4个模板是否合适？
3. **内测时间**：明晚回家后能开始内测吗？
4. **Vercel账号**：是否需要我帮你注册？

---

_文档版本：v0.2_
_最后更新：2026-04-02_
