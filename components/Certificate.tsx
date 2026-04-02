"use client";

import { useState, useEffect } from "react";
import { Goal } from "@/lib/types";

interface CertificateProps {
  goal: Goal;
  onClose: () => void;
}

export default function Certificate({ goal, onClose }: CertificateProps) {
  const [canShare, setCanShare] = useState(false);
  const [showTip, setShowTip] = useState(false);

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

  // Get decorative elements based on goal type
  const renderDecorations = () => {
    if (goalType.type === "reading") {
      return (
        <div className="absolute top-4 left-4 text-4xl opacity-20">📖</div>
      );
    }
    if (goalType.type === "running") {
      return (
        <div className="absolute top-4 left-4 text-4xl opacity-20">🏅</div>
      );
    }
    if (goalType.type === "skill") {
      return (
        <div className="absolute top-4 left-4 text-4xl opacity-20">💡</div>
      );
    }
    return null;
  };

  const handleSave = async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d")!;
      
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
      gradient.addColorStop(0, "#0f0f0f");
      gradient.addColorStop(0.5, "#1a1a1a");
      gradient.addColorStop(1, "#0f0f0f");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1920);

      // Unique pattern
      const patternGradient = ctx.createRadialGradient(540, 960, 0, 540, 960, 800);
      patternGradient.addColorStop(0, goalType.color + "30");
      patternGradient.addColorStop(1, "transparent");
      ctx.fillStyle = patternGradient;
      ctx.fillRect(0, 0, 1080, 1920);

      // Trophy icon
      ctx.font = "120px serif";
      ctx.textAlign = "center";
      ctx.fillText("🏆", 540, 280);

      // Title
      ctx.font = "bold 60px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("成就证书", 540, 400);

      // Subtitle
      ctx.font = "36px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = goalType.color;
      ctx.fillText(`「${goalType.label}」`, 540, 480);

      // Goal name
      ctx.font = "bold 48px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "#FFFFFF";
      const goalNameLines = wrapText(ctx, goal.name, 800);
      goalNameLines.forEach((line, i) => {
        ctx.fillText(line, 540, 600 + i * 60);
      });

      // Stats
      ctx.fillStyle = "#888888";
      ctx.font = "32px 'Noto Sans SC', sans-serif";
      ctx.fillText(`完成天数：${goal.totalDays}天`, 540, 900);
      ctx.fillText(`最长连续：🔥 ${goal.longestStreak}天`, 540, 970);

      // Badges earned
      ctx.font = "48px serif";
      const earnedBadges = goal.badges.filter(b => b.unlockedAt);
      const badgeX = 540 - (earnedBadges.length - 1) * 70;
      earnedBadges.forEach((badge, i) => {
        ctx.fillText(badge.emoji, badgeX + i * 140, 1150);
      });

      // Badge names
      ctx.font = "24px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "#666666";
      earnedBadges.forEach((badge, i) => {
        const x = badgeX + i * 140;
        ctx.fillText(badge.name, x, 1200);
      });

      // Date
      ctx.fillStyle = "#666666";
      ctx.font = "28px 'Noto Sans SC', sans-serif";
      const dateStr = new Date().toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      ctx.fillText(dateStr, 540, 1400);

      // Quote
      ctx.font = "italic 32px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "#555555";
      ctx.fillText("坚持，是最好的天赋", 540, 1550);

      // Logo
      ctx.font = "bold 36px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = goalType.color;
      ctx.fillText("逐日", 540, 1750);

      // Download
      const link = document.createElement("a");
      link.download = `逐日-${goal.name}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Save failed:", error);
      setShowTip(true);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d")!;
        
        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
        gradient.addColorStop(0, "#0f0f0f");
        gradient.addColorStop(0.5, "#1a1a1a");
        gradient.addColorStop(1, "#0f0f0f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, 1920);

        const patternGradient = ctx.createRadialGradient(540, 960, 0, 540, 960, 800);
        patternGradient.addColorStop(0, goalType.color + "30");
        patternGradient.addColorStop(1, "transparent");
        ctx.fillStyle = patternGradient;
        ctx.fillRect(0, 0, 1080, 1920);

        ctx.font = "120px serif";
        ctx.textAlign = "center";
        ctx.fillText("🏆", 540, 280);

        ctx.font = "bold 60px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("成就证书", 540, 400);

        ctx.font = "36px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = goalType.color;
        ctx.fillText(`「${goalType.label}」`, 540, 480);

        ctx.font = "bold 48px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = "#FFFFFF";
        const goalNameLines = wrapText(ctx, goal.name, 800);
        goalNameLines.forEach((line, i) => {
          ctx.fillText(line, 540, 600 + i * 60);
        });

        ctx.fillStyle = "#888888";
        ctx.font = "32px 'Noto Sans SC', sans-serif";
        ctx.fillText(`完成天数：${goal.totalDays}天`, 540, 900);
        ctx.fillText(`最长连续：🔥 ${goal.longestStreak}天`, 540, 970);

        ctx.font = "48px serif";
        const earnedBadges = goal.badges.filter(b => b.unlockedAt);
        const badgeX = 540 - (earnedBadges.length - 1) * 70;
        earnedBadges.forEach((badge, i) => {
          ctx.fillText(badge.emoji, badgeX + i * 140, 1150);
        });

        ctx.font = "24px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = "#666666";
        earnedBadges.forEach((badge, i) => {
          const x = badgeX + i * 140;
          ctx.fillText(badge.name, x, 1200);
        });

        ctx.fillStyle = "#666666";
        ctx.font = "28px 'Noto Sans SC', sans-serif";
        const dateStr = new Date().toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        ctx.fillText(dateStr, 540, 1400);

        ctx.font = "italic 32px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = "#555555";
        ctx.fillText("坚持，是最好的天赋", 540, 1550);

        ctx.font = "bold 36px 'Noto Sans SC', sans-serif";
        ctx.fillStyle = goalType.color;
        ctx.fillText("逐日", 540, 1750);

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

  const earnedBadges = goal.badges.filter((b) => b.unlockedAt);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/90 p-4">
      <div className="bg-[#1a1a1a] rounded-3xl overflow-hidden max-w-sm w-full">
        {/* Certificate Preview */}
        <div
          className="relative p-8 text-center"
          style={{
            background: `linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%), ${getUniquePattern()}`,
            backgroundBlendMode: "normal",
          }}
        >
          {renderDecorations()}
          
          <div className="text-6xl mb-4">{goalType.icon}</div>
          <div className="text-white text-2xl font-bold mb-2">成就证书</div>
          <div className="text-sm mb-6" style={{ color: goalType.color }}>
            {goalType.label}
          </div>
          
          <div className="text-white text-lg font-medium mb-4 leading-relaxed px-2">
            {goal.name}
          </div>
          
          <div className="flex justify-center gap-6 text-sm text-gray-400 mb-6">
            <span>完成 {goal.totalDays} 天</span>
            <span>🔥 {goal.longestStreak} 天连续</span>
          </div>
          
          <div className="flex justify-center gap-2 mb-6">
            {earnedBadges.map((badge) => (
              <span key={badge.id} className="text-3xl" title={badge.name}>
                {badge.emoji}
              </span>
            ))}
          </div>
          
          <div className="text-gray-500 text-sm">
            {new Date().toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
          
          <div className="mt-6 text-gray-600 text-sm italic">"坚持，是最好的天赋"</div>
          
          <div className="mt-4" style={{ color: goalType.color }}>
            <span className="font-bold">逐日</span>
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
