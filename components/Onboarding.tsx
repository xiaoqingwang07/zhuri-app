"use client";

import { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
}

const CONFETTI_COLORS = ["#ff6b35", "#22c55e", "#fbbf24", "#ef4444", "#8b5cf6", "#f97316", "#06b6d4"];

function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * 360;
    const distance = 100 + Math.random() * 200;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const size = 6 + Math.random() * 10;
    const isCircle = i % 3 === 0;
    const isStrip = i % 3 === 1;
    const shapeClass = isCircle ? "circle" : isStrip ? "strip" : "";
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance * 0.6 + 150;

    return (
      <div
        key={i}
        className={`confetti-burst-piece ${shapeClass}`}
        style={{
          width: size,
          height: isStrip ? size * 2.5 : size,
          backgroundColor: color,
          animationDelay: `${Math.random() * 0.2}s`,
          ["--dx" as string]: `${dx}px`,
          ["--dy" as string]: `${dy}px`,
          ["--r" as string]: `${Math.random() * 720 - 360}deg`,
        }}
      />
    );
  });

  // P2-4: After confetti plays, call onDone
  setTimeout(onDone, 1800);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ overflow: "hidden" }}
    >
      {pieces}
    </div>
  );
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

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

  const handleFinish = () => {
    setShowConfetti(true);
  };

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)] flex flex-col z-50">
      {/* P2-4: Confetti burst on completion */}
      {showConfetti && <ConfettiBurst onDone={onComplete} />}

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
          <div className="text-7xl mb-10" style={{ animation: "emoji-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}>
            {slides[step].icon}
          </div>
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

        {/* Action button - P2-4: Confetti on finish */}
        <button
          onClick={() => (step < slides.length - 1 ? setStep(step + 1) : handleFinish())}
          className="w-full py-3.5 bg-[var(--accent)] text-white font-medium rounded-xl hover:bg-[var(--accent-light)] transition-all text-base active:scale-95"
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
