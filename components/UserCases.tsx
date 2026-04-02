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
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-[var(--text-secondary)]">看看他们怎么做到的</h3>
        <div className="flex gap-1">
          {DEMO_CASES.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activeIndex ? "w-4 bg-[var(--accent)]" : "bg-gray-600"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="relative h-[140px] overflow-hidden">
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
              <div className="bg-[var(--bg-secondary)] rounded-xl p-4 h-full">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{userCase.avatar}</span>
                  <div>
                    <p className="font-semibold">{userCase.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      🔥 连续 {userCase.streak} 天
                    </p>
                  </div>
                </div>
                <p className="text-sm mb-2 line-clamp-1">{userCase.goal}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {userCase.badges.map((badge, j) => (
                      <span key={j} className="text-lg">{badge}</span>
                    ))}
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    坚持 {userCase.duration} 天
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center text-[var(--text-secondary)]">
        更多真实案例即将上线
      </p>
    </div>
  );
}
