"use client";

import { useState, useEffect, useRef } from "react";
import { Goal } from "@/lib/types";

interface CertificateProps {
  goal: Goal;
  onClose: () => void;
}

type Orientation = "portrait" | "landscape";

export default function Certificate({ goal, onClose }: CertificateProps) {
  const [canShare, setCanShare] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [orientationApplied, setOrientationApplied] = useState<Orientation>("portrait");
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanShare(true);
    }
  }, []);

  // Detect goal type from name
  const getGoalType = () => {
    const name = goal.name.toLowerCase();
    if (name.includes("读完") || name.includes("阅读") || name.includes("书")) {
      return { type: "reading", icon: "📚", label: "阅读挑战", color: "#4A90D9" };
    }
    if (name.includes("公里") || name.includes("跑步") || name.includes("跑") || name.includes("马拉松")) {
      return { type: "running", icon: "🏃", label: "跑步挑战", color: "#34C759" };
    }
    if (name.includes("学会") || name.includes("学习") || name.includes("掌握")) {
      return { type: "skill", icon: "💻", label: "技能挑战", color: "#AF52DE" };
    }
    if (name.includes("养成") || name.includes("习惯")) {
      return { type: "habit", icon: "✨", label: "习惯挑战", color: "#FF9500" };
    }
    return { type: "default", icon: "🎯", label: "目标挑战", color: "#FF6B35" };
  };

  const goalType = getGoalType();

  // Get unique pattern based on goal name hash
  const getUniquePattern = () => {
    const hash = goal.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const patterns = [
      "radial-gradient(circle at 20% 80%, rgba(255,107,53,0.3) 0%, transparent 50%)",
      "radial-gradient(circle at 80% 20%, rgba(52,199,89,0.3) 0%, transparent 50%)",
      "radial-gradient(circle at 50% 50%, rgba(175,82,222,0.2) 0%, transparent 60%)",
      "radial-gradient(circle at 30% 30%, rgba(74,144,217,0.3) 0%, transparent 40%)",
    ];
    return patterns[hash % patterns.length];
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const words = text.split("");
    const lines = [];
    let currentLine = "";
    for (const char of words) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 3);
  };

  // P2-9: DRY - single drawCertificate function for both portrait and landscape
  const drawCertificate = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#0f0f0f");
    gradient.addColorStop(0.5, "#1a1a1a");
    gradient.addColorStop(1, "#0f0f0f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Unique pattern
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.7;
    const patternGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    patternGradient.addColorStop(0, goalType.color + "30");
    patternGradient.addColorStop(1, "transparent");
    ctx.fillStyle = patternGradient;
    ctx.fillRect(0, 0, w, h);

    // Scale factor for landscape
    const scale = w > h ? h / 1920 : 1;
    const trophySize = Math.round(120 * scale);
    const titleSize = Math.round(60 * scale);
    const subtitleSize = Math.round(36 * scale);
    const goalNameSize = Math.round(48 * scale);
    const statSize = Math.round(32 * scale);
    const badgeEmojiSize = Math.round(48 * scale);
    const badgeNameSize = Math.round(24 * scale);
    const dateSize = Math.round(28 * scale);
    const quoteSize = Math.round(32 * scale);
    const logoSize = Math.round(36 * scale);

    // Trophy icon
    ctx.font = `${trophySize}px serif`;
    ctx.textAlign = "center";
    ctx.fillText("🏆", cx, cy - h * 0.35);

    // Title
    ctx.font = `bold ${titleSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("成就证书", cx, cy - h * 0.27);

    // Subtitle
    ctx.font = `${subtitleSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = goalType.color;
    ctx.fillText(`「${goalType.label}」`, cx, cy - h * 0.22);

    // Goal name
    ctx.font = `bold ${goalNameSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    const goalNameLines = wrapText(ctx, goal.name, w * 0.75);
    const lineHeight = goalNameSize * 1.3;
    goalNameLines.forEach((line, i) => {
      ctx.fillText(line, cx, cy - h * 0.14 + i * lineHeight);
    });

    // Stats
    ctx.fillStyle = "#888888";
    ctx.font = `${statSize}px 'Noto Sans SC', sans-serif`;
    const statsY = cy + h * 0.08;
    ctx.fillText(`完成天数：${goal.totalDays}天`, cx, statsY);
    ctx.fillText(`最长连续：🔥 ${goal.longestStreak}天`, cx, statsY + statSize * 1.4);

    // Badges earned
    ctx.font = `${badgeEmojiSize}px serif`;
    const earnedBadges = goal.badges.filter((b) => b.unlockedAt);
    const badgeGap = badgeEmojiSize * 1.5;
    const badgeStartX = cx - (earnedBadges.length - 1) * badgeGap / 2;
    const badgesY = cy + h * 0.2;
    earnedBadges.forEach((badge, i) => {
      ctx.fillText(badge.emoji, badgeStartX + i * badgeGap, badgesY);
    });

    ctx.font = `${badgeNameSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = "#666666";
    earnedBadges.forEach((badge, i) => {
      ctx.fillText(badge.name, badgeStartX + i * badgeGap, badgesY + badgeEmojiSize * 0.8);
    });

    // Date
    ctx.fillStyle = "#666666";
    ctx.font = `${dateSize}px 'Noto Sans SC', sans-serif`;
    const dateStr = new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    ctx.fillText(dateStr, cx, cy + h * 0.32);

    // Quote
    ctx.font = `italic ${quoteSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = "#555555";
    ctx.fillText("坚持，是最好的天赋", cx, cy + h * 0.38);

    // Logo
    ctx.font = `bold ${logoSize}px 'Noto Sans SC', sans-serif`;
    ctx.fillStyle = goalType.color;
    ctx.fillText("逐日", cx, cy + h * 0.45);
  };

  const getCanvasDimensions = (orient: Orientation) => {
    return orient === "portrait"
      ? { width: 1080, height: 1920 }
      : { width: 1440, height: 810 };
  };

  const handleSave = async () => {
    try {
      const { width, height } = getCanvasDimensions(orientation);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      drawCertificate(ctx, width, height);

      const link = document.createElement("a");
      link.download = `逐日-${goal.name}-${orientation === "portrait" ? "竖版" : "横版"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      console.log('✅ 证书保存 完成');
    } catch (error) {
      console.error("Save failed:", error);
      setShowTip(true);
    }
  };

  const handleShare = async () => {
    const { width, height } = getCanvasDimensions(orientation);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    drawCertificate(ctx, width, height);

    if (navigator.share) {
      try {
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], "逐日成就.png", { type: "image/png" });
            await navigator.share({
              files: [file],
              title: "我在逐日完成了目标",
              text: `我在逐日坚持了${goal.totalDays}天，完成了「${goal.name}」！🏆`,
            });
          }
        });
      } catch (error) {
        console.error("Share failed:", error);
        setShowTip(true);
      }
    } else {
      setShowTip(true);
    }
  };

  const earnedBadges = goal.badges.filter((b) => b.unlockedAt);

  // Update preview when orientation changes
  useEffect(() => {
    const timer = setTimeout(() => setOrientationApplied(orientation), 50);
    return () => clearTimeout(timer);
  }, [orientation]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/90 p-4">
      <div className="bg-[#1a1a1a] rounded-3xl overflow-hidden max-w-sm w-full">
        {/* Certificate Preview */}
        <div
          ref={previewRef}
          className="relative p-8 text-center transition-all duration-300"
          style={{
            background: `linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%), ${getUniquePattern()}`,
            backgroundBlendMode: "normal",
            aspectRatio: orientationApplied === "portrait" ? "9/16" : "16/9",
          }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="text-4xl mb-3">{goalType.icon}</div>
            <div className="text-white text-xl font-bold mb-1">成就证书</div>
            <div className="text-sm mb-4" style={{ color: goalType.color }}>
              {goalType.label}
            </div>
            <div className="text-white text-sm font-medium mb-3 leading-relaxed px-2 text-center">
              {goal.name}
            </div>
            <div className="flex justify-center gap-4 text-xs text-gray-400 mb-4">
              <span>完成 {goal.totalDays} 天</span>
              <span>🔥 {goal.longestStreak} 天连续</span>
            </div>
            <div className="flex justify-center gap-1 mb-4">
              {earnedBadges.map((badge) => (
                <span key={badge.id} className="text-2xl" title={badge.name}>
                  {badge.emoji}
                </span>
              ))}
            </div>
            <div className="text-gray-500 text-xs">
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            <div className="mt-4 text-gray-600 text-xs italic">"坚持，是最好的天赋"</div>
            <div className="mt-3" style={{ color: goalType.color }}>
              <span className="font-bold">逐日</span>
            </div>
          </div>
        </div>

        {/* P2-9: Orientation Toggle */}
        <div className="p-4 bg-[#1a1a1a] border-t border-gray-800">
          <p className="text-xs text-gray-500 text-center mb-2">选择证书比例</p>
          <div className="flex gap-2">
            <button
              onClick={() => setOrientation("portrait")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                orientation === "portrait"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[#2a2a2a] text-gray-400 hover:text-white"
              }`}
            >
              📱 竖版(朋友圈)
            </button>
            <button
              onClick={() => setOrientation("landscape")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                orientation === "landscape"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[#2a2a2a] text-gray-400 hover:text-white"
              }`}
            >
              🌐 横版(小红书)
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-3 bg-[#0f0f0f]">
          {showTip ? (
            <div className="text-center text-sm text-gray-400 mb-2">
              <p>长按证书保存到相册</p>
              <p>然后手动分享到微信</p>
            </div>
          ) : null}

          <button
            onClick={handleSave}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 transition-colors"
          >
            保存到相册
          </button>

          {canShare ? (
            <button
              onClick={handleShare}
              className="w-full py-3 bg-[var(--accent)] text-white font-semibold rounded-xl hover:bg-[var(--accent-light)] transition-colors"
            >
              分享到微信
            </button>
          ) : (
            <button
              onClick={handleShare}
              className="w-full py-3 bg-[var(--accent)] text-white font-semibold rounded-xl hover:bg-[var(--accent-light)] transition-colors"
            >
              分享证书
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 text-gray-500 hover:text-white transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
