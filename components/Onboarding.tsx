"use client";

import { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);

  const slides = [
    {
      icon: "🎯",
      title: "逐日",
      subtitle: "你敢想，我敢拆",
      description: "再大的目标，拆成每一天的小任务，就没有完成不了的",
    },
    {
      icon: "🤖",
      title: "AI帮你规划",
      subtitle: "写下来，剩下的交给我",
      description: "告诉逐日你的目标，AI在3秒内帮你拆好每天该做什么",
    },
    {
      icon: "🔥",
      title: "一个人走得快，一群人走得远",
      subtitle: "逐日不孤独",
      description: "社交监督 + 连续徽章 + 见证人机制——让坚持变成一件有仪式感的事",
    },
  ];

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col z-50">
      {/* Skip button - top right, always visible */}
      {step < slides.length - 1 && (
        <div className="absolute top-8 right-6 z-10">
          <button
            onClick={onComplete}
            className="px-4 py-1.5 rounded-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
          >
            跳过
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <div className="text-7xl mb-10 animate-bounce">{slides[step].icon}</div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-3 tracking-tight">{slides[step].title}</h1>
          <p className="text-base mb-4" style={{ color: "var(--accent)" }}>
            {slides[step].subtitle}
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {slides[step].description}
          </p>
        </div>
      </div>

      <div className="p-8 space-y-4 max-w-sm mx-auto w-full">
        {/* Progress dots - Apple style thin pills */}
        <div className="flex justify-center gap-2 mb-6">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-[var(--accent)]"
                  : i < step
                  ? "w-1.5 bg-[var(--accent)]"
                  : "w-1.5 bg-[var(--text-tertiary)]"
              }`}
            />
          ))}
        </div>

        {/* Action button - Apple style, full width, no heavy shadow */}
        <button
          onClick={() => (step < slides.length - 1 ? setStep(step + 1) : onComplete())}
          className="w-full py-3.5 bg-[var(--accent)] text-white font-medium rounded-xl hover:bg-[var(--accent-light)] transition-all text-base"
          style={{ letterSpacing: '0.01em' }}
        >
          {step < slides.length - 1 ? "下一步" : "开始逐日"}
        </button>

        {/* Step counter */}
        <p className="text-center text-xs text-[var(--text-tertiary)]">
          {step + 1} / {slides.length}
        </p>
      </div>
    </div>
  );
}
