"use client";

import { useState, useEffect, useRef } from "react";
import { Goal, DayTask, Badge, SupervisionUser, BADGES, MAX_GOALS } from "@/lib/types";
import {
  loadGoals,
  saveGoals,
  clearGoals,
  createInitialGoal,
  checkIn,
  useReviveCard,
  generateDefaultTasks,
  loadSupervisionUsers,
  updateUserCheckIn,
} from "@/lib/store";
import { generateTasksWithAI } from "@/lib/ai";
import Certificate from "@/components/Certificate";
import Onboarding from "@/components/Onboarding";
import InviteModal from "@/components/InviteModal";
import UserCases from "@/components/UserCases";

type Tab = "today" | "calendar" | "supervision" | "settings";

export default function Home() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBadge, setShowBadge] = useState<Badge | null>(null);
  const [showCompletionCard, setShowCompletionCard] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [supervisionUsers, setSupervisionUsers] = useState<SupervisionUser[]>([]);

  // P2-6: Manual theme toggle
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // P2-7: Notification reminder
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // P1-3: Revive card
  const [showRevivePrompt, setShowRevivePrompt] = useState(false);
  const [missedDayIndex, setMissedDayIndex] = useState<number | null>(null);

  // P2-8: Export/Import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Goal creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [totalDays, setTotalDays] = useState(20);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingStep, setCreatingStep] = useState<"input" | "loading" | "confirm" | "done">("input");
  const [loadingCountdown, setLoadingCountdown] = useState(15);
  const [pendingTasks, setPendingTasks] = useState<DayTask[] | null>(null);

  // Reset creating state when form is shown
  useEffect(() => {
    if (showCreateForm) {
      setIsCreating(false);
      setCreatingStep("input");
      setGoalName("");
      setSelectedTemplate(null);
      setError("");
      setLoadingCountdown(15);
      setPendingTasks(null);
    }
  }, [showCreateForm]);

  // Force reset on mount - clear any stuck states
  useEffect(() => {
    setIsCreating(false);
    setCreatingStep("input");
  }, []);

  // P2-6: Load theme from localStorage and apply
  useEffect(() => {
    const savedTheme = localStorage.getItem('zhuri_theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme('system');
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system: follow prefers-color-scheme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
    localStorage.setItem('zhuri_theme', theme);
  }, [theme]);

  // P2-7: Load notification state and check on mount
  useEffect(() => {
    const savedReminder = localStorage.getItem('zhuri_reminder_enabled');
    if (savedReminder === 'true') {
      setReminderEnabled(true);
    }

    if (typeof Notification !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }

    // P2-7: Check if should show 21:00 reminder
    if (savedReminder === 'true' && typeof Notification !== 'undefined') {
      const now = new Date();
      const hour = now.getHours();
      const todayStr = now.toISOString().split('T')[0];
      const goals = loadGoals();
      const todayCompleted = goals.some(g =>
        g.tasks.some(t => t.date === todayStr && t.completed)
      );
      if (!todayCompleted && hour >= 21 && Notification.permission === 'granted') {
        new Notification('逐日', {
          body: '今天还没打卡，别断了自己的连续天数！',
        });
      }
    }

    // P1-3: Check for missed days and show revive prompt
    const loadedGoals = loadGoals();
    const active = loadedGoals.find((g) => g.id === activeGoalId) || loadedGoals[0];
    if (active) {
      const today = new Date().toISOString().split('T')[0];
      const missedIdx = active.tasks.findIndex((t) => !t.completed && t.date < today);
      if (missedIdx !== -1 && active.reviveCards > 0) {
        setMissedDayIndex(missedIdx);
        setShowRevivePrompt(true);
      }
    }
  }, []);
  const templates = [
    { name: "📚 读书计划", prefix: "读完《", suffix: "》", days: 20, icon: "📖" },
    { name: "🏃 跑步计划", prefix: "完成", suffix: "公里", days: 30, icon: "🏃" },
    { name: "💻 技能学习", prefix: "学会", suffix: "", days: 30, icon: "💡" },
    { name: "📝 习惯养成", prefix: "养成", suffix: "习惯", days: 21, icon: "✨" },
  ];

  const activeGoal = goals.find((g) => g.id === activeGoalId) || null;

  // Check if first time user
  useEffect(() => {
    const loadedGoals = loadGoals();
    const hasSeenOnboarding = localStorage.getItem("zhuri_onboarding");
    
    if (loadedGoals.length === 0 && !hasSeenOnboarding) {
      setIsOnboarding(true);
    } else {
      setGoals(loadedGoals);
      if (loadedGoals.length > 0 && !activeGoalId) {
        setActiveGoalId(loadedGoals[0].id);
      }
    }
    setSupervisionUsers(loadSupervisionUsers());
  }, []);

  useEffect(() => {
    if (goals.length > 0) {
      saveGoals(goals);
    }
  }, [goals]);

  useEffect(() => {
    if (showBadge) {
      const timer = setTimeout(() => setShowBadge(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [showBadge]);

  const completeOnboarding = () => {
    localStorage.setItem("zhuri_onboarding", "true");
    setIsOnboarding(false);
  };

  const createGoal = async () => {
    if (goals.length >= MAX_GOALS) {
      setError(`最多只能同时进行${MAX_GOALS}个目标`);
      return;
    }
    if (!goalName.trim()) {
      setError("告诉我你的目标是什么？");
      return;
    }
    if (totalDays < 3) {
      setError("天数至少3天");
      return;
    }

    setIsCreating(true);
    setCreatingStep("loading");
    setError("");
    setLoadingCountdown(15);

    // P0-1: AbortController with 15s timeout — fetch-level abort, not setTimeout hack
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // P2-1: Countdown timer display
    const countdownId = setInterval(() => {
      setLoadingCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const tasks = await generateTasksWithAI(goalName, totalDays, controller.signal);
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      // P0-2: Go to confirm step instead of directly creating
      setPendingTasks(tasks);
      setCreatingStep("confirm");
      setIsCreating(false);
    } catch (err: any) {
      clearTimeout(timeoutId);
      clearInterval(countdownId);
      // AbortError = timeout, show specific message
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        setError("AI响应超时，已自动切换默认任务");
      } else {
        setError("AI生成失败，已切换默认任务");
      }
      console.log("AI generation failed, using default tasks:", err);
      // Short delay so user sees the error message before fallback
      setTimeout(() => {
        const fallbackTasks = generateDefaultTasks(totalDays, goalName);
        setPendingTasks(fallbackTasks);
        setCreatingStep("confirm");
        setIsCreating(false);
      }, 1500);
    }
  };

  // P0-2: Confirm tasks before committing
  const confirmTasks = () => {
    if (!pendingTasks) return;
    const newGoal = createInitialGoal(goalName, goalName, totalDays, pendingTasks);
    const updatedGoals = [...goals, newGoal];
    setGoals(updatedGoals);
    setActiveGoalId(newGoal.id);
    setShowCreateForm(false);
    setCreatingStep("done");
    setPendingTasks(null);
    setTimeout(() => {
      setActiveTab("today");
      setCreatingStep("input");
    }, 100);
  };

  const handleCheckIn = (dayIndex: number) => {
    if (!activeGoal) return;

    const previousBadges = activeGoal.badges.filter((b) => b.unlockedAt).map((b) => b.id);
    const updatedGoal = checkIn(activeGoal, dayIndex);
    
    // Check if completed
    if (updatedGoal.status === "completed" && activeGoal.status !== "completed") {
      setShowCompletionCard(true);
    }

    const updatedGoals = goals.map((g) => (g.id === activeGoal.id ? updatedGoal : g));
    setGoals(updatedGoals);

    // Check if new badge was unlocked
    const newBadges = updatedGoal.badges.filter(
      (b) => b.unlockedAt && !previousBadges.includes(b.id)
    );
    if (newBadges.length > 0) {
      setShowBadge(newBadges[0]);
    }

    // Show check-in feedback
    setJustCheckedIn(true);
    setTimeout(() => setJustCheckedIn(false), 2000);

    // Mark check-in hint as shown
    localStorage.setItem("zhuri_checkin_hint_shown", "1");
  };

  const handleReset = () => {
    if (confirm("确定要重置所有数据吗？")) {
      clearGoals();
      setGoals([]);
      setActiveGoalId(null);
      setShowCompletionCard(false);
      setActiveTab("today");
    }
  };

  const handleUserCheckIn = (userId: string) => {
    const updated = updateUserCheckIn(userId, true);
    setSupervisionUsers(updated);
  };

  const todayTasks = activeGoal?.tasks.filter((t) => t.date === new Date().toISOString().split("T")[0]) || [];
  const completedToday = todayTasks.filter((t) => t.completed).length;
  const progressPercent = activeGoal ? Math.round((activeGoal.tasks.filter((t) => t.completed).length / activeGoal.tasks.length) * 100) : 0;

  // Onboarding
  if (isOnboarding) {
    return <Onboarding onComplete={completeOnboarding} />;
  }

  // No goal created yet - show creation form
  if (goals.length === 0 || showCreateForm || creatingStep !== "done" && showCreateForm) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-display text-4xl font-bold text-[var(--accent)]">逐日</h1>
            <p className="text-[var(--text-secondary)]">你敢想，我敢拆——每天离目标近一点</p>
          </div>

          {creatingStep === "loading" ? (
            <div className="bg-[var(--bg-secondary)] rounded-2xl p-8 text-center space-y-4">
              <div className="text-5xl animate-bounce">🤖</div>
              <div>
                <p className="font-semibold">正在帮你拆解目标...</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">稍等，马上就好</p>
              </div>
              {/* Progress bar - P1-3 */}
              <div className="space-y-1">
                <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${((15 - loadingCountdown) / 15) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  预计等待 {loadingCountdown}s 内完成
                </p>
              </div>
              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className={loadingCountdown <= 12 ? "text-[var(--accent)] font-medium" : ""}>① 分析目标</span>
                <span className="text-[var(--text-secondary)]">→</span>
                <span className={loadingCountdown <= 8 ? "text-[var(--accent)] font-medium" : ""}>② 生成任务</span>
                <span className="text-[var(--text-secondary)]">→</span>
                <span className={loadingCountdown <= 4 ? "text-[var(--accent)] font-medium" : ""}>③ 完成</span>
              </div>
            </div>
          ) : creatingStep === "confirm" && pendingTasks ? (
            /* P0-2: AI task confirmation step */
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl mb-2">✨</div>
                <p className="font-semibold">帮你拆好了！</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  看看这几天的任务，有不合适的可以改
                </p>
              </div>
              {/* Task preview */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pendingTasks.slice(0, 5).map((task) => (
                  <div key={task.day} className="bg-[var(--bg-card)] rounded-xl px-4 py-3 border border-[var(--border)] text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-[var(--accent-subtle)] rounded text-[var(--accent)]">Day {task.day}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">{task.pages}</span>
                    </div>
                    <p className="text-[var(--text-primary)]">{task.task}</p>
                  </div>
                ))}
                {pendingTasks.length > 5 && (
                  <p className="text-xs text-center text-[var(--text-tertiary)]">
                    还有 {pendingTasks.length - 5} 天任务...
                  </p>
                )}
                {/* P2-7: AI task manual hint */}
                <p className="text-xs text-center text-[var(--text-tertiary)]">
                  任务不满意？点"重新生成"换个方式，或者直接开始——之后还可以在任务详情里单独调整
                </p>
              </div>
              {/* Action buttons */}
              <div className="space-y-2">
                <button
                  onClick={confirmTasks}
                  className="w-full py-3 bg-[var(--accent)] text-white font-medium rounded-xl hover:bg-[var(--accent-light)] transition-colors"
                >
                  就这些了，开始执行 💪
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCreatingStep("input");
                      setPendingTasks(null);
                    }}
                    className="flex-1 py-2.5 text-sm text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    重新生成
                  </button>
                  <button
                    onClick={() => {
                      // Just go back to edit name/days, keep pending tasks
                      setCreatingStep("input");
                    }}
                    className="flex-1 py-2.5 text-sm text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    调整天数
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-secondary)] rounded-2xl p-6 space-y-4">
              {/* Clear data button */}
              <button
                onClick={() => {
                  if (confirm("确定要清除所有数据重新开始吗？")) {
                    localStorage.clear();
                    clearGoals();
                    setGoals([]);
                    setActiveGoalId(null);
                    setGoalName("");
                    setIsCreating(false);
                    setCreatingStep("input");
                    setError("");
                  }
                }}
                className="w-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] py-1"
              >
                🔄 清除数据重新开始
              </button>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">选择目标类型（快速开始）</label>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t, idx) => {
                    const isSelected = selectedTemplate === idx;
                    return (
                      <button
                        key={t.name}
                        onClick={() => {
                          // P0-2: Auto-fill full template format
                          const fullFormat = `${t.prefix}___${t.suffix}`.trim();
                          setGoalName(fullFormat);
                          setSelectedTemplate(idx);
                          setTotalDays(t.days);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          isSelected
                            ? "bg-[var(--accent)] text-[var(--text-primary)] font-semibold ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-secondary)]"
                            : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] hover:ring-1 hover:ring-gray-600"
                        }`}
                      >
                        {isSelected ? "✓ " : ""}{t.icon} {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* User Cases - Real Examples */}
              <UserCases />

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">目标名称</label>
                <input
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder={
                    selectedTemplate !== null
                      ? templates[selectedTemplate].name.includes("读书")
                        ? "例如：读完《哈萨比斯》"
                        : templates[selectedTemplate].name.includes("跑步")
                        ? "例如：完成50公里"
                        : templates[selectedTemplate].name.includes("技能")
                        ? "例如：学会Python基础"
                        : "例如：养成早起习惯"
                      : "例如：读完《哈萨比斯》"
                  }
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">计划天数</label>
                <input
                  type="number"
                  value={totalDays}
                  onChange={(e) => setTotalDays(Number(e.target.value))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  min={3}
                  max={365}
                />
              </div>

              {error && (
                <p className="text-[var(--danger)] text-sm">{error}</p>
              )}

              {/* Loading indicator */}
              {isCreating && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-75"></span>
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce delay-150"></span>
                </div>
              )}

              {/* Main button - disabled when empty or creating */}
              <button
                onClick={createGoal}
                disabled={isCreating || !goalName.trim()}
                style={{
                  backgroundColor: isCreating || !goalName.trim() ? "#444" : undefined,
                  cursor: isCreating || !goalName.trim() ? "not-allowed" : "pointer",
                  opacity: isCreating || !goalName.trim() ? 0.5 : 1,
                }}
                className="w-full font-semibold py-3 rounded-xl transition-all text-[var(--text-primary)] bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600"
              >
                {isCreating ? "AI正在拆解目标..." : !goalName.trim() ? "先告诉我你的目标" : "开始逐日"}
              </button>

              {/* Reset button if stuck */}
              {(error || isCreating) && (
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setCreatingStep("input");
                    setError("");
                  }}
                  className="w-full py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  重置
                </button>
              )}

              {goals.length > 0 && (
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreatingStep("input");
                  }}
                  className="w-full py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  取消
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Certificate Modal */}
      {showCompletionCard && activeGoal && (
        <Certificate 
          goal={activeGoal} 
          onClose={() => setShowCompletionCard(false)} 
        />
      )}

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} />
      )}

      {/* Check-in Success Feedback with Celebration */}
      {justCheckedIn && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          {/* Confetti-like background - P1 enhanced */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="absolute confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  backgroundColor: ["#ff6b35", "#22c55e", "#fbbf24", "#ef4444", "#8b5cf6", "#f97316", "#06b6d4"][Math.floor(Math.random() * 7)],
                }}
              />
            ))}
          </div>
          {/* Success card - human voice */}
          <div className="relative bg-gradient-to-br from-[var(--success)] to-green-600 px-8 py-6 rounded-2xl shadow-2xl checkin-success">
            <div className="text-6xl mb-2 animate-bounce">🎉</div>
            <p className="text-2xl font-bold text-white">
              {activeGoal && activeGoal.streak === 1 ? "完成啦！" : "又搞定一天！"}
            </p>
            <p className="text-white/90 mt-1">🔥 连续 {activeGoal?.streak || 0} 天</p>
            {activeGoal && activeGoal.streak >= 7 && (
              <p className="text-yellow-200 text-sm mt-2">💪 {activeGoal.streak}天了，你不是在坚持，是在享受</p>
            )}
            {activeGoal && activeGoal.streak === 1 && (
              <p className="text-white/80 text-sm mt-2">好的开始！明天继续 👊</p>
            )}
            {activeGoal && activeGoal.streak === 30 && (
              <p className="text-yellow-200 text-sm mt-2">🏆 30天！说真的，我很为你骄傲</p>
            )}
          </div>
        </div>
      )}

      {/* Badge Popup */}
      {showBadge && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-[var(--bg-secondary)] rounded-2xl p-8 text-center space-y-4 badge-pop">
            <div className="text-6xl">{showBadge.emoji}</div>
            <div>
              <p className="text-[var(--accent)] font-semibold">新徽章解锁！</p>
              <p className="text-2xl font-bold">{showBadge.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-[var(--bg-secondary)] px-4 py-4 sticky top-0 z-40">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--accent)]">逐日</h1>
            <p className="text-xs text-[var(--text-secondary)] truncate max-w-[150px]">{activeGoal?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Streak */}
            <div className="text-center">
              <div className="flex items-center gap-1">
                <span className="text-2xl fire-flicker">🔥</span>
                <span className="font-display text-2xl font-bold">{activeGoal?.streak || 0}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">连续天数</p>
            </div>
            {/* Progress */}
            <div className="text-center">
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="var(--bg-primary)"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="var(--accent)"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${progressPercent * 1.26} 126`}
                    className="progress-bar"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                  {progressPercent}%
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">完成度</p>
            </div>
          </div>
        </div>

        {/* Goal Tabs */}
        {goals.length > 1 && (
          <div className="max-w-lg mx-auto mt-3 flex gap-2 overflow-x-auto pb-1">
            {goals.map((goal) => (
              <button
                key={goal.id}
                onClick={() => setActiveGoalId(goal.id)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  goal.id === activeGoalId
                    ? "bg-[var(--accent)] text-[var(--text-primary)]"
                    : goal.status === "completed"
                    ? "bg-[var(--success)]/20 text-[var(--success)]"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                }`}
              >
                {goal.status === "completed" ? "✅ " : ""}{goal.name.slice(0, 10)}
              </button>
            ))}
            {goals.length < MAX_GOALS && (
              <button
                onClick={() => {
                  setGoalName("");
                  setTotalDays(20);
                  setShowCreateForm(true);
                }}
                className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                + 新目标
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 pb-24">
        {/* Today Tab */}
        {activeTab === "today" && activeGoal && (
          <div className="space-y-6 slide-up">
            {/* Today Info - Human greeting */}
            <div className="text-center py-4">
              <p className="text-[var(--text-secondary)] text-sm">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour < 6) return "夜深了，早点休息 🛋";
                  if (hour < 9) return "早上好！☀️ 今天也要加油";
                  if (hour < 12) return "上午好，状态不错 🌤️";
                  if (hour < 14) return "中午好，吃饱了吗 🍜";
                  if (hour < 18) return "下午好，别摸鱼哦 🤫";
                  if (hour < 21) return "晚上好，夜深人静正适合 🍵";
                  return "夜深了 🛋";
                })()}
              </p>
              <h2 className="text-xl font-semibold mt-2 text-[var(--text-primary)]">
                {completedToday === todayTasks.length && todayTasks.length > 0
                  ? "今天全做完了，厉害！🎉"
                  : activeGoal.status === "completed"
                  ? "目标完成，你真棒 🏆"
                  : `${activeGoal.name} · 今天要做这些事`}
              </h2>
            </div>

            {/* P1-3: Revive card prompt */}
            {showRevivePrompt && missedDayIndex !== null && activeGoal.reviveCards > 0 && (
              <div className="bg-gradient-to-r from-[var(--accent)]/10 to-[var(--accent)]/5 border border-[var(--accent)]/20 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">💳</span>
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">有 {activeGoal.reviveCards} 张复活卡可用</p>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      你漏掉了 Day {activeGoal.tasks[missedDayIndex]?.day}，要补打卡吗？
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          const revived = useReviveCard(activeGoal);
                          if (revived) {
                            const updatedGoals = goals.map((g) => g.id === revived.id ? revived : g);
                            setGoals(updatedGoals);
                            setShowRevivePrompt(false);
                            setMissedDayIndex(null);
                          }
                        }}
                        className="flex-1 py-2 bg-[var(--accent)] text-white text-sm font-medium rounded-xl hover:bg-[var(--accent-light)] transition-colors"
                      >
                        用一张补上
                      </button>
                      <button
                        onClick={() => {
                          setShowRevivePrompt(false);
                          setMissedDayIndex(null);
                        }}
                        className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        算了
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Today's Tasks */}
            <div className="space-y-3">
              {todayTasks.length === 0 ? (
                <div className="bg-[var(--bg-secondary)] rounded-xl p-6 text-center">
                  <p className="text-[var(--text-secondary)]">今日无任务安排</p>
                </div>
              ) : activeGoal.status === "completed" ? (
                <div className="bg-[var(--bg-secondary)] rounded-xl p-6 text-center space-y-4">
                  <div className="text-5xl">🏆</div>
                  <p className="font-semibold">恭喜完成目标！</p>
                  <button
                    onClick={() => setShowCompletionCard(true)}
                    className="px-6 py-2 bg-[var(--accent)] text-[var(--text-primary)] rounded-xl hover:bg-[var(--accent-light)] transition-colors"
                  >
                    查看成就证书
                  </button>
                </div>
              ) : (
                <>
                  {/* Check-in hint - shown only when tasks exist, none completed, and hint not yet shown */}
                  {completedToday === 0 && !localStorage.getItem("zhuri_checkin_hint_shown") && (
                    <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl px-4 py-3 text-sm text-[var(--accent)]">
                      👆 点这里打个卡，证明今天没偷懒 😏
                    </div>
                  )}
                  {todayTasks.map((task, idx) => {
                    const taskIndex = activeGoal.tasks.findIndex((t) => t.day === task.day);
                    return (
                      <div
                        key={task.day}
                        className={`bg-[var(--bg-secondary)] rounded-xl p-4 transition-all ${
                          task.completed ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => !task.completed && handleCheckIn(taskIndex)}
                            disabled={task.completed}
                            className={`w-8 h-8 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                              task.completed
                                ? "bg-[var(--success)] border-[var(--success)] text-[var(--text-primary)]"
                                : "border-[var(--accent)] hover:bg-[var(--accent)]/20"
                            }`}
                          >
                            {task.completed ? "✓" : ""}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs px-2 py-0.5 bg-[var(--bg-primary)] rounded text-[var(--text-secondary)]">
                                {task.type === "reading" && "📖 阅读"}
                                {task.type === "notes" && "📝 笔记"}
                                {task.type === "review" && "🔍 回顾"}
                                {task.type === "summary" && "📋 总结"}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)]">{task.pages}</span>
                            </div>
                            <p className={`${task.completed ? "line-through" : ""}`}>{task.task}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            </div>

            {/* Next Day Preview */}
            {activeGoal.status !== "completed" && activeGoal.tasks.filter((t) => !t.completed).length > 1 && (
              <div className="bg-[var(--bg-primary)] rounded-xl p-4 border border-[var(--border)]">
                <p className="text-xs text-[var(--text-secondary)] mb-2">明日预览</p>
                <p className="text-sm">
                  {activeGoal.tasks.find((t) => !t.completed && t.date > new Date().toISOString().split("T")[0])?.task || "明天继续加油"}
                </p>
              </div>
            )}

            {/* Badges */}
            <div className="bg-[var(--bg-secondary)] rounded-xl p-4">
              <h3 className="font-semibold mb-3">🏅 我的徽章</h3>
              <div className="flex flex-wrap gap-3">
                {activeGoal.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      badge.unlockedAt
                        ? "bg-[var(--accent)]/20 border border-[var(--accent)]"
                        : "bg-[var(--bg-primary)] opacity-50"
                    }`}
                  >
                    <span>{badge.emoji}</span>
                    <span className="text-sm">{badge.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Calendar Tab */}
        {activeTab === "calendar" && activeGoal && (
          <div className="space-y-4 slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">📅 任务总览</h2>
              <span className="text-sm text-[var(--text-secondary)]">
                {activeGoal.tasks.filter((t) => t.completed).length} / {activeGoal.tasks.length} 天完成
              </span>
            </div>

            {/* P1-2: Overall progress stats */}
            {(() => {
              const completed = activeGoal.tasks.filter((t) => t.completed).length;
              const total = activeGoal.tasks.length;
              const percent = Math.round((completed / total) * 100);
              const today = new Date().toISOString().split("T")[0];

              // Fix: count only last 7 days (not all-time)
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const weekCompleted = activeGoal.tasks.filter((t) => {
                if (!t.completed || !t.completedAt) return false;
                const completedDate = new Date(t.completedAt);
                return completedDate >= sevenDaysAgo && completedDate <= new Date();
              }).length;

              // Schedule comparison: expected progress vs actual
              const startDate = new Date(activeGoal.startDate);
              const todayDate = new Date();
              const daysElapsed = Math.max(1, Math.floor((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
              const expectedPercent = Math.round((daysElapsed / total) * 100);
              const ahead = completed / total > (daysElapsed / total);
              const behind = completed / total < (daysElapsed / total) - 0.05;

              return (
                <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-[var(--text-secondary)]">📊 整体进度</span>
                    <span className="text-sm font-semibold text-[var(--accent)]">
                      {percent}% 完成
                      {ahead && <span className="ml-1 text-[var(--success)]">· 领先</span>}
                      {behind && <span className="ml-1 text-[var(--danger)]">· 落后</span>}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        ahead ? "bg-[var(--success)]" : behind ? "bg-[var(--danger)]" : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>🔥 连续 {activeGoal.streak} 天</span>
                    <span>近7天 {weekCompleted} 天</span>
                    <span>剩余 {total - completed} 天</span>
                  </div>
                </div>
              );
            })()}

            {/* Recent 7 days */}
            <div>
              <h3 className="text-sm text-[var(--text-secondary)] mb-2">最近7天</h3>
              <div className="grid grid-cols-7 gap-1">
                {activeGoal.tasks.slice(0, 7).map((task) => {
                  const isToday = task.date === new Date().toISOString().split("T")[0];
                  return (
                    <div
                      key={task.day}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${
                        task.completed
                          ? "bg-[var(--success)] text-[var(--text-primary)]"
                          : isToday
                          ? "bg-[var(--accent)] text-[var(--text-primary)]"
                          : "bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <span className="font-bold">{task.day}</span>
                      <span>{task.completed ? "✓" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[var(--success)]"></span> 已完成
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[var(--accent)]"></span> 今天
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-[var(--bg-secondary)]"></span> 未完成
              </span>
            </div>

            {/* Task List */}
            <div className="space-y-2">
              <h3 className="font-semibold">详细任务</h3>
              {activeGoal.tasks.map((task) => (
                <div
                  key={task.day}
                  className={`bg-[var(--bg-secondary)] rounded-lg p-3 flex items-center gap-3 ${
                    task.completed ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      task.completed
                        ? "bg-[var(--success)] text-[var(--text-primary)]"
                        : "bg-[var(--bg-primary)]"
                    }`}
                  >
                    {task.day}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm ${task.completed ? "line-through" : ""}`}>
                      {task.task}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">{task.pages}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supervision Tab */}
        {activeTab === "supervision" && (
          <div className="space-y-4 slide-up">
            <div className="text-center py-4">
              <h2 className="text-xl font-bold">👥 监督团</h2>
              <p className="text-sm text-[var(--text-secondary)]">一个人走得快，一群人走得远</p>
              <button
                onClick={() => setShowInvite(true)}
                className="mt-2 px-4 py-2 bg-[var(--accent)]/20 text-[var(--accent)] rounded-lg text-sm hover:bg-[var(--accent)]/30 transition-colors"
              >
                邀请朋友加入
              </button>
            </div>

            <div className="space-y-3">
              {supervisionUsers.map((user) => (
                <div key={user.id} className="bg-[var(--bg-secondary)] rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{user.avatar}</span>
                    <div className="flex-1">
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        🔥 连续 {user.streak} 天 · {user.todayCompleted ? "今日已完成" : "等待打卡"}
                      </p>
                    </div>
                    {!user.todayCompleted && (
                      <button
                        onClick={() => handleUserCheckIn(user.id)}
                        className="px-4 py-2 bg-[var(--accent)] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--accent-light)] transition-colors"
                      >
                        戳一下TA
                      </button>
                    )}
                    {user.todayCompleted && (
                      <span className="text-2xl">✅</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-4 slide-up">
            <h2 className="text-lg font-bold">⚙️ 设置</h2>

            {/* P2-6: Theme Toggle */}
            <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <p className="text-sm text-[var(--text-secondary)] mb-3">外观模式</p>
              <div className="flex bg-[var(--bg-primary)] rounded-xl p-1">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      theme === t
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {t === 'light' ? '☀️ 浅色' : t === 'dark' ? '🌙 深色' : '💻 跟随系统'}
                  </button>
                ))}
              </div>
            </div>

            {/* P2-7: Notification Reminder */}
            <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">📬 21:00 打卡提醒</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    通知权限: <span className={
                      notificationPermission === 'granted' ? 'text-[var(--success)]' :
                      notificationPermission === 'denied' ? 'text-[var(--danger)]' :
                      'text-[var(--text-secondary)]'
                    }>{notificationPermission === 'granted' ? '已授权' : notificationPermission === 'denied' ? '已拒绝' : '未授权'}</span>
                  </p>
                </div>
                {notificationPermission === 'default' ? (
                  <button
                    onClick={async () => {
                      const perm = await Notification.requestPermission();
                      setNotificationPermission(perm);
                      if (perm === 'granted') {
                        setReminderEnabled(true);
                        localStorage.setItem('zhuri_reminder_enabled', 'true');
                      }
                    }}
                    className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium"
                  >
                    开启
                  </button>
                ) : notificationPermission === 'denied' ? (
                  <span className="text-xs text-[var(--text-secondary)]">请在浏览器设置中开启</span>
                ) : (
                  <button
                    onClick={() => {
                      const newVal = !reminderEnabled;
                      setReminderEnabled(newVal);
                      localStorage.setItem('zhuri_reminder_enabled', String(newVal));
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      reminderEnabled
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {reminderEnabled ? '已开启' : '已关闭'}
                  </button>
                )}
              </div>
              {/* iOS tip */}
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                💡 iOS用户：Safari打开 → 分享 → 添加至主屏幕 → 系统会询问是否允许通知授权
              </p>
            </div>

            {/* P2-8: Data Export/Import */}
            <div className="bg-[var(--bg-card)] rounded-2xl p-4 border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <p className="text-sm text-[var(--text-secondary)] mb-3">数据管理</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const allData: Record<string, string> = {};
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && key.startsWith('zhuri_')) {
                        allData[key] = localStorage.getItem(key) || '';
                      }
                    }
                    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `zhuri-backup-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    console.log('✅ 数据导出 完成');
                  }}
                  className="flex-1 py-3 bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-xl font-medium hover:bg-[var(--accent)]/10 transition-colors text-sm"
                >
                  📤 导出数据
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="flex-1 py-3 bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-xl font-medium hover:bg-[var(--accent)]/10 transition-colors text-sm"
                >
                  📥 导入数据
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const data = JSON.parse(ev.target?.result as string);
                        for (const [key, value] of Object.entries(data)) {
                          if (key.startsWith('zhuri_') && typeof value === 'string') {
                            localStorage.setItem(key, value);
                          }
                        }
                        console.log('✅ 数据导入 完成');
                        window.location.reload();
                      } catch {
                        alert('导入失败，文件格式错误');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </div>
            </div>

            <div className="bg-[var(--bg-card)] rounded-2xl p-4 space-y-4 border border-[var(--border)]" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <button
                onClick={handleReset}
                className="w-full py-3 bg-[var(--danger)]/10 text-[var(--danger)] rounded-xl font-medium hover:bg-[var(--danger)]/20 transition-colors"
              >
                重新开始
              </button>

              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-center text-[var(--text-tertiary)] text-sm">
                  逐日 v0.2 · 内测版
                </p>
                <p className="text-center text-[var(--text-secondary)] text-xs mt-1">
                  {goals.length} / {MAX_GOALS} 个目标
                </p>
              </div>
            </div>

            {/* History entry - P2-5 */}
            <button
              onClick={() => setActiveTab("calendar")}
              className="w-full py-2 text-center text-sm text-[var(--accent)] hover:underline"
            >
              📅 查看完整日历
            </button>
          </div>
        )}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg-secondary)]/80 backdrop-blur-xl border-t border-[var(--border)]" style={{ WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-lg mx-auto flex">
          {[
            { id: "today" as Tab, label: "今日", icon: "📍" },
            { id: "calendar" as Tab, label: "日历", icon: "📅" },
            { id: "supervision" as Tab, label: "监督", icon: "👥" },
            { id: "settings" as Tab, label: "设置", icon: "⚙️" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${
                activeTab === tab.id
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
