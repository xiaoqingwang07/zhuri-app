"use client";

import { useState, useEffect } from "react";
import { Goal, DayTask, Badge, SupervisionUser, BADGES, MAX_GOALS } from "@/lib/types";
import {
  loadGoals,
  saveGoals,
  clearGoals,
  createInitialGoal,
  checkIn,
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

  // Goal creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [totalDays, setTotalDays] = useState(20);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingStep, setCreatingStep] = useState<"input" | "loading" | "done">("input");
  const [loadingCountdown, setLoadingCountdown] = useState(15);

  // Reset creating state when form is shown
  useEffect(() => {
    if (showCreateForm) {
      setIsCreating(false);
      setCreatingStep("input");
      setGoalName("");
      setSelectedTemplate(null);
      setError("");
      setLoadingCountdown(15);
    }
  }, [showCreateForm]);

  // Force reset on mount - clear any stuck states
  useEffect(() => {
    setIsCreating(false);
    setCreatingStep("input");
  }, []);

  // Preset templates
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
      setError("请输入目标名称");
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
      completeGoalCreation(tasks);
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
        completeGoalCreation(fallbackTasks);
      }, 1500);
    }
  };

  const completeGoalCreation = (tasks: DayTask[]) => {
    const newGoal = createInitialGoal(goalName, goalName, totalDays, tasks);
    const updatedGoals = [...goals, newGoal];
    setGoals(updatedGoals);
    setActiveGoalId(newGoal.id);
    setShowCreateForm(false);
    setCreatingStep("done");
    setIsCreating(false);
    
    setTimeout(() => {
      setActiveTab("today");
      setCreatingStep("input");
    }, 1500);
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
                <p className="font-semibold">AI 正在拆解目标...</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">根据你的目标规划每日任务</p>
                {/* P2-1: Loading countdown */}
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  预计等待 {loadingCountdown}s 内完成
                </p>
              </div>
              <div className="flex justify-center gap-1">
                <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse"></span>
                <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse delay-75"></span>
                <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse delay-150"></span>
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
                className="w-full text-xs text-gray-500 hover:text-gray-400 py-1"
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
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          isSelected
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-white"
                        }`}
                      >
                        {t.icon} {t.name}
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
                  className="w-full bg-[var(--bg-primary)] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)]"
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
                  className="w-full bg-[var(--bg-primary)] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent)]"
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

              {/* Main button - always clickable unless creating */}
              <button
                onClick={createGoal}
                disabled={isCreating}
                style={{
                  backgroundColor: isCreating ? "#666" : undefined,
                  cursor: isCreating ? "not-allowed" : "pointer",
                  opacity: isCreating ? 0.6 : 1,
                }}
                className="w-full font-semibold py-3 rounded-xl transition-all text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600"
              >
                {isCreating ? "AI正在拆解目标..." : "开始逐日"}
              </button>

              {/* Reset button if stuck */}
              {(error || isCreating) && (
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setCreatingStep("input");
                    setError("");
                  }}
                  className="w-full py-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
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
                  className="w-full py-3 text-[var(--text-secondary)] hover:text-white transition-colors"
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
          {/* Success card */}
          <div className="relative bg-gradient-to-br from-[var(--success)] to-green-600 px-8 py-6 rounded-2xl shadow-2xl checkin-success">
            <div className="text-6xl mb-2 animate-bounce">🎉</div>
            <p className="text-2xl font-bold text-white">打卡成功！</p>
            <p className="text-white/90 mt-1">🔥 连续 {activeGoal?.streak || 0} 天</p>
            {activeGoal && activeGoal.streak >= 7 && (
              <p className="text-yellow-200 text-sm mt-2">💪 太棒了！继续保持！</p>
            )}
            {activeGoal && activeGoal.streak === 1 && (
              <p className="text-white/80 text-sm mt-2">第一天！好的开始！</p>
            )}
            {activeGoal && activeGoal.streak === 30 && (
              <p className="text-yellow-200 text-sm mt-2">🏆 30天连续！你是战神！</p>
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
                    ? "bg-[var(--accent)] text-white"
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
                className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-white transition-colors"
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
            {/* Today Info */}
            <div className="text-center py-4">
              <p className="text-[var(--text-secondary)] text-sm">
                {new Date().toLocaleDateString("zh-CN", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h2 className="text-xl font-bold mt-1">
                {completedToday === todayTasks.length && todayTasks.length > 0
                  ? "🎉 今日已完成！"
                  : activeGoal.status === "completed"
                  ? "✅ 目标已完成"
                  : `今日任务 (${completedToday}/${todayTasks.length})`}
              </h2>
            </div>

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
                    className="px-6 py-2 bg-[var(--accent)] text-white rounded-xl hover:bg-[var(--accent-light)] transition-colors"
                  >
                    查看成就证书
                  </button>
                </div>
              ) : (
                todayTasks.map((task, idx) => {
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
                              ? "bg-[var(--success)] border-[var(--success)] text-white"
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
                })
              )}
            </div>

            {/* Next Day Preview */}
            {activeGoal.status !== "completed" && activeGoal.tasks.filter((t) => !t.completed).length > 1 && (
              <div className="bg-[var(--bg-primary)] rounded-xl p-4 border border-gray-800">
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
            
            {/* Recent 7 days */}
            <div>
              <h3 className="text-sm text-[var(--text-secondary)] mb-2">最近7天</h3>
              <div className="grid grid-cols-7 gap-1">
                {activeGoal.tasks.slice(0, 7).map((task) => (
                  <div
                    key={task.day}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${
                      task.completed
                        ? "bg-[var(--success)] text-white"
                        : task.date === new Date().toISOString().split("T")[0]
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-secondary)]"
                    }`}
                  >
                    <span className="font-bold">{task.day}</span>
                    <span>{task.completed ? "✓" : ""}</span>
                  </div>
                ))}
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
                        ? "bg-[var(--success)] text-white"
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
              <h2 className="text-xl font-bold">👥 监督广场</h2>
              <p className="text-sm text-[var(--text-secondary)]">互相监督，共同进步</p>
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
                        className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-light)] transition-colors"
                      >
                        提醒打卡
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

            <div className="bg-[var(--bg-secondary)] rounded-xl p-4 space-y-4">
              <button
                onClick={handleReset}
                className="w-full py-3 bg-[var(--danger)]/20 text-[var(--danger)] rounded-xl font-medium hover:bg-[var(--danger)]/30 transition-colors"
              >
                重置所有数据
              </button>

              <div className="pt-4 border-t border-gray-700">
                <p className="text-center text-[var(--text-secondary)] text-sm">
                  逐日 v0.2 · 内测版
                </p>
                <p className="text-center text-[var(--text-secondary)] text-xs mt-1">
                  {goals.length} / {MAX_GOALS} 个目标
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg-secondary)] border-t border-gray-800">
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
