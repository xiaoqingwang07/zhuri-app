"use client";

import { useState, useEffect } from "react";
import { loadGoals } from "@/lib/store";

// 虚拟激励用户 — 看起来像真实用户在坚持
const MOCK_USER_CASES = [
  {
    emoji: "🏃",
    name: "阿杰",
    goal: "100天跑完半马",
    days: 23,
    detail: "累计跑了87公里",
  },
  {
    emoji: "📚",
    name: "小雅",
    goal: "30天读完《原则》",
    days: 12,
    detail: "读完了14章，做了18条笔记",
  },
  {
    emoji: "🎸",
    name: "老王",
    goal: "60天学会吉他弹唱",
    days: 45,
    detail: "已学会5首歌，正在练第6首",
  },
];

export default function UserCases() {
  const [stats, setStats] = useState({ goals: 0, completedDays: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const goals = loadGoals();
    const completedDays = goals.reduce(
      (acc, g) => acc + g.tasks.filter((t) => t.completed).length,
      0
    );
    setStats({ goals: goals.length, completedDays });
  }, []);

  if (!mounted) return null;

  // 用户有目标时 → 显示自己的真实数据
  if (stats.goals > 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-2xl p-5 shadow-card card-enter">
        <p className="text-xs text-center text-[var(--text-tertiary)] mb-4 font-medium tracking-wide">
          📊 你的数据
        </p>
        <div className="flex justify-around">
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--accent)] font-display">{stats.goals}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">个目标</p>
          </div>
          <div className="w-px bg-[var(--border)]" />
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--accent)] font-display">{stats.completedDays}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">天打卡</p>
          </div>
        </div>
      </div>
    );
  }

  // 用户没有目标时 → 显示激励性虚拟用户
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-5 shadow-card space-y-3">
      <div className="text-center mb-3">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">他们都在悄悄变好</p>
      </div>
      <div className="space-y-3">
        {MOCK_USER_CASES.map((user, idx) => (
          <div
            key={idx}
            className="bg-[var(--bg-secondary)] rounded-xl p-4 flex items-start gap-4 card-enter"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center text-xl flex-shrink-0">
              {user.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{user.name}</span>
                <span className="text-xs bg-[var(--accent)]/15 text-[var(--accent)] px-2 py-0.5 rounded-full font-medium">
                  🔥 已坚持 {user.days} 天
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1 truncate">"{user.goal}"</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{user.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-center text-[var(--text-tertiary)] pt-2">
        你的故事也可以在这里
      </p>
    </div>
  );
}
