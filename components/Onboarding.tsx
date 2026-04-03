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
        <div className="absolute top-6 right-6 z-10">
          <button
            onClick={onComplete}
            className="px-4 py-1.5 rounded-full text-sm text-[var(--text-secondary)] hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
          >
            跳过
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="text-8xl mb-8 animate-bounce">{slides[step].icon}</div>
          <h1 className="text-3xl font-bold text-white mb-2">{slides[step].title}</h1>
          <p className="text-lg mb-4" style={{ color: "var(--accent)" }}>
            {slides[step].subtitle}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            {slides[step].description}
          </p>
        </div>
      </div>

      <div className="p-8 space-y-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-4">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-[var(--accent)]"
                  : i < step
                  ? "bg-[var(--accent)]"
                  : "bg-gray-600"
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        <button
          onClick={() => (step < slides.length - 1 ? setStep(step + 1) : onComplete())}
          className="w-full py-4 bg-[var(--accent)] text-white font-semibold rounded-2xl hover:bg-[var(--accent-light)] transition-colors text-lg"
        >
          {step < slides.length - 1 ? "下一步" : "开始逐日"}
        </button>

        {/* Step counter */}
        <p className="text-center text-xs text-[var(--text-secondary)]">
          {step + 1} / {slides.length}
        </p>
      </div>
    </div>
  );
}
