"use client";

import { useState, useEffect } from "react";

interface UserCase {
  id: string;
  name: string;
  avatar: string;
  goal: string;
  duration: number;
  badges: string[];
  streak: number;
}

const DEMO_CASES: UserCase[] = [
  {
    id: "1",
    name: "阿杰",
    avatar: "🏃",
    goal: "100天跑完半马",
    duration: 100,
    badges: ["🌱", "🔥", "⭐", "🏆"],
    streak: 100,
  },
  {
    id: "2",
    name: "小雅",
    avatar: "📚",
    goal: "30天读完《原则》",
    duration: 30,
    badges: ["🌱", "🔥", "⭐"],
    streak: 30,
  },
  {
    id: "3",
    name: "老王",
    avatar: "🎸",
    goal: "60天学会吉他弹唱",
    duration: 60,
    badges: ["🌱", "🔥", "⭐"],
    streak: 45,
  },
  {
    id: "4",
    name: "阿美",
    avatar: "💪",
    goal: "28天养成早起习惯",
    duration: 28,
    badges: ["🌱", "🔥"],
    streak: 28,
  },
  {
    id: "5",
    name: "大卫",
    avatar: "🧘",
    goal: "45天学会冥想",
    duration: 45,
    badges: ["🌱", "🔥", "⭐"],
    streak: 45,
  },
];

export default function UserCases() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % DEMO_CASES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-[var(--text-secondary)]">他们都在悄悄变好</h3>
        <div className="flex gap-1">
          {DEMO_CASES.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === activeIndex ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-[var(--text-tertiary)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative h-[130px] overflow-hidden">
        {DEMO_CASES.map((userCase, i) => {
          const offset = (i - activeIndex + DEMO_CASES.length) % DEMO_CASES.length;
          const isActive = offset === 0;
          const translateX = offset === 0 ? 0 : offset < DEMO_CASES.length / 2 ? 120 : -120;
          const scale = isActive ? 1 : 0.85;
          const opacity = isActive ? 1 : 0.4;

          return (
            <div
              key={userCase.id}
              className="absolute inset-0 transition-all duration-500 ease-out"
              style={{
                transform: `translateX(${translateX}%) scale(${scale})`,
                opacity,
                zIndex: DEMO_CASES.length - Math.abs(offset),
              }}
            >
              <div className="bg-[var(--bg-card)] rounded-2xl p-4 h-full border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{userCase.avatar}</span>
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">{userCase.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      🔥 已坚持 {userCase.streak} 天
                    </p>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-2 line-clamp-1">"{userCase.goal}"</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {userCase.badges.map((badge, j) => (
                      <span key={j} className="text-sm">{badge}</span>
                    ))}
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {userCase.duration}天计划
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center text-[var(--text-tertiary)]">
        你的故事也可以在这里
      </p>
    </div>
  );
}
