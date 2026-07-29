import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DisclaimerCard } from "@/components/DisclaimerCard";
import { RhythmStrip, taskEnergy } from "@/components/RhythmStrip";
import { Button, Card, Chip, PressableScale } from "@/components/ui";
import {
  diagnoseGoal,
  generateTasksWithFallback,
  planFromDiagnosis,
  suggestDuration,
} from "@/lib/ai";
import { track } from "@/lib/analytics";
import { consumeAIQuota, isProCached, remainingAIQuota } from "@/lib/entitlements";
import { evaluateGoalFeasibility } from "@/lib/feasibility";
import { useGoals } from "@/lib/GoalsContext";
import {
  DEFAULT_GOAL_PROFILE,
  DayTask,
  DurationSuggestion,
  GOAL_TEMPLATES,
  GoalAnalysis,
  GoalProfile,
} from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

type Step = "input" | "loading" | "confirm";

const DAY_OPTIONS = [7, 14, 21, 30, 60, 100];
const MINUTE_OPTIONS = [15, 25, 40, 60];
const MIN_DAYS = 3;
const MAX_DAYS = 365;

const LEVEL_OPTIONS: { label: string; value: GoalProfile["currentLevel"] }[] = [
  { label: "刚开始", value: "beginner" },
  { label: "有一点基础", value: "some" },
  { label: "已经熟悉", value: "advanced" },
];

const PACE_OPTIONS: { label: string; value: GoalProfile["pace"]; desc: string }[] = [
  { label: "轻松接住", value: "gentle", desc: "先稳住节奏" },
  { label: "稳定推进", value: "steady", desc: "每天做一点" },
  { label: "冲刺一点", value: "ambitious", desc: "更有挑战感" },
];

const WEEKDAY_OPTIONS: { label: string; value: GoalProfile["weekdayMode"] }[] = [
  { label: "每天差不多", value: "same" },
  { label: "周末多做", value: "weekend_more" },
  { label: "工作日多做", value: "workday_more" },
];

const DIAGNOSIS_STEPS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "search", label: "识别领域和对象，像专家一样看这个目标" },
  { icon: "shield-checkmark", label: "判断可行性，太满的计划先拦下来" },
  { icon: "sparkles", label: "写下陪练策略和验收标准" },
];

const PLANNING_STEPS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "trending-up", label: "设计强度曲线：前几天轻，再稳步加码" },
  { icon: "leaf", label: "给每天留一个最低完成版，忙也不断档" },
  { icon: "checkmark-done", label: "逐条检查任务是否够具体" },
];

function StepList({
  steps,
  doneCount,
}: {
  steps: { icon: keyof typeof Ionicons.glyphMap; label: string }[];
  doneCount: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.stepList, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {steps.map((step, i) => {
        const state = i < doneCount ? "done" : i === doneCount ? "active" : "pending";
        return (
          <View key={step.label} style={styles.stepRow}>
            <View
              style={[
                styles.stepIcon,
                {
                  backgroundColor:
                    state === "done"
                      ? colors.successSoft
                      : state === "active"
                        ? colors.primarySoft
                        : colors.background,
                },
              ]}
            >
              {state === "done" ? (
                <Animated.View entering={ZoomIn.springify().damping(12)}>
                  <Ionicons name="checkmark" size={15} color={colors.success} />
                </Animated.View>
              ) : state === "active" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name={step.icon} size={13} color={colors.textTertiary} />
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: state === "pending" ? colors.textTertiary : colors.text,
                  fontWeight: state === "active" ? "800" : "600",
                },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 加载页分两幕：
 *   第一幕（约 20 秒）诊断中，只有步骤动画；
 *   第二幕 诊断已返回，把结论亮出来给用户读，任务在后台继续生成。
 * 关键在于第二幕 —— 用户手里有实质内容可看，剩下的 40 秒就不再是干等。
 */
function LoadingView({
  goal,
  analysis,
}: {
  goal: string;
  analysis: GoalAnalysis | null;
}) {
  const { colors } = useTheme();
  const [doneCount, setDoneCount] = useState(0);
  const rotation = useSharedValue(0);
  const planning = !!analysis;
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 2400, easing: Easing.linear }),
      -1
    );
  }, [rotation]);

  // 每一幕的勾选节奏按各自的真实耗时铺开，最后一步保持进行中直到结果返回
  useEffect(() => {
    setDoneCount(0);
    const milestones = planning ? [6000, 18000] : [5000, 11000];
    const timers = milestones.map((ms, i) => setTimeout(() => setDoneCount(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [planning]);

  return (
    <ScrollView
      contentContainerStyle={styles.loadingContainer}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={spinStyle}>
        <Text style={{ fontSize: 40 }}>☀️</Text>
      </Animated.View>

      <Text style={[styles.loadingTitle, { color: colors.text }]}>
        {planning ? "正在把它拆成每一天" : "陪练正在诊断这个目标"}
      </Text>

      {!planning && (
        <Text
          style={[styles.loadingGoal, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          「{goal}」
        </Text>
      )}

      {/* 诊断一到就先给用户看，这是最能体现专业度的内容 */}
      {analysis && (
        <Animated.View entering={FadeInDown.springify()} style={{ alignSelf: "stretch" }}>
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.diagHeader}>
              <Ionicons name="sparkles" size={15} color={colors.primary} />
              <Text style={[styles.diagKicker, { color: colors.primary }]}>诊断完成</Text>
            </View>
            <Text style={[styles.diagTitle, { color: colors.text }]}>
              {analysis.domain} · {analysis.subject}
            </Text>
            {!!analysis.expertiseAngle && (
              <Text style={[styles.diagBody, { color: colors.textSecondary }]}>
                {analysis.expertiseAngle}
              </Text>
            )}
            {!!analysis.coachStrategy && (
              <View style={[styles.diagStrategy, { backgroundColor: colors.background }]}>
                <Text style={[styles.diagStrategyLabel, { color: colors.textTertiary }]}>
                  陪练策略
                </Text>
                <Text style={[styles.diagStrategyText, { color: colors.text }]}>
                  {analysis.coachStrategy}
                </Text>
              </View>
            )}
          </Card>
        </Animated.View>
      )}

      <StepList steps={planning ? PLANNING_STEPS : DIAGNOSIS_STEPS} doneCount={doneCount} />

      <Text style={[styles.loadingHint, { color: colors.textTertiary }]}>
        {planning
          ? "计划还在生成，大约再 40 秒，先看看上面的诊断"
          : "先想清楚这是个什么目标，通常 20–40 秒"}
      </Text>
    </ScrollView>
  );
}

function TaskMeta({ task }: { task: DayTask }) {
  const { colors } = useTheme();
  const difficultyText =
    task.difficulty === "hard" ? "挑战" : task.difficulty === "easy" ? "轻量" : "标准";
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaPill, { color: colors.primary, backgroundColor: colors.primarySoft }]}>
        {task.durationMinutes || 30} 分钟
      </Text>
      <Text style={[styles.metaPill, { color: colors.textSecondary, backgroundColor: colors.background }]}>
        {difficultyText}
      </Text>
      {!!task.pages && (
        <Text style={[styles.metaPill, { color: colors.textSecondary, backgroundColor: colors.background }]}>
          {task.pages}
        </Text>
      )}
    </View>
  );
}

// 确认页的单日任务行：只保留任务 + 元信息 + 重点，细节留到「今日」页再看
function TaskRowCard({ task, onEdit }: { task: DayTask; onEdit: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onEdit}>
      <Card style={styles.taskRow}>
        <View style={[styles.dayBubble, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.dayBubbleText, { color: colors.primary }]}>D{task.day}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.taskRowText, { color: colors.text }]}>{task.task}</Text>
          <TaskMeta task={task} />
          {!!task.focus && (
            <Text style={[styles.taskFocus, { color: colors.primary }]}>
              今日重点：{task.focus}
            </Text>
          )}
        </View>
        <Ionicons name="pencil" size={16} color={colors.textTertiary} />
      </Card>
    </PressableScale>
  );
}

export default function CreateGoalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addGoal, persona } = useGoals();

  const [step, setStep] = useState<Step>("input");
  const [goalText, setGoalText] = useState("");
  const [days, setDays] = useState(21);
  const [profile, setProfile] = useState<GoalProfile>(DEFAULT_GOAL_PROFILE);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [goalAnalysis, setGoalAnalysis] = useState<GoalAnalysis | null>(null);
  const [usedAI, setUsedAI] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [acceptedStretchGoal, setAcceptedStretchGoal] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => new Set([0]));
  const [customDaysOpen, setCustomDaysOpen] = useState(false);
  const [customDaysText, setCustomDaysText] = useState("");
  const [suggestion, setSuggestion] = useState<DurationSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const generatingRef = useRef(false);

  const isCustomDays = !DAY_OPTIONS.includes(days);

  const applyCustomDays = useCallback(() => {
    const parsed = Number(customDaysText.trim());
    if (!Number.isFinite(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
      Alert.alert("周期不合适", `请输入 ${MIN_DAYS}–${MAX_DAYS} 之间的天数。`);
      return;
    }
    setDays(Math.round(parsed));
    setCustomDaysOpen(false);
    Haptics.selectionAsync().catch(() => {});
  }, [customDaysText]);

  // 让陪练判断这个目标该给多少天 —— 专家才有资格定周期,外行才让用户拍脑袋
  const askSuggestion = useCallback(async () => {
    const goal = goalText.trim();
    if (!goal) {
      Alert.alert("先说出目标", "陪练要先知道你想做什么,才能判断需要多久。");
      return;
    }
    setSuggesting(true);
    try {
      const result = await suggestDuration(goal, profile);
      setSuggestion(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Alert.alert("暂时问不到", "陪练现在不可用,你可以先自己选一个周期。");
    } finally {
      setSuggesting(false);
    }
  }, [goalText, profile]);

  // 超过 10 天的计划按周折叠，避免确认页变成 30 张卡片墙
  const weekGroups = useMemo(() => {
    if (tasks.length <= 10) return null;
    const weeks: DayTask[][] = [];
    for (let i = 0; i < tasks.length; i += 7) weeks.push(tasks.slice(i, i + 7));
    return weeks;
  }, [tasks]);

  const toggleWeek = useCallback((w: number) => {
    Haptics.selectionAsync().catch(() => {});
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  }, []);

  const updateProfile = useCallback((patch: Partial<GoalProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const generate = useCallback(async (skipStretchWarning = false) => {
    if (generatingRef.current) return;
    const goal = goalText.trim();
    if (!goal) {
      Alert.alert("先说出目标", "比如：30天读完一本书、跑完半马、学会做10道菜");
      return;
    }

    if (!isProCached() && remainingAIQuota(false) <= 0) {
      Alert.alert("本月 AI 次数已用完", "可以等下月恢复，或了解逐日 Plus 获取更高额度。", [
        { text: "知道了", style: "cancel" },
        { text: "了解 Plus", onPress: () => router.push("/paywall") },
      ]);
      return;
    }

    const feasibility = evaluateGoalFeasibility(goal, days, profile);
    if (feasibility.level === "unrealistic") {
      Alert.alert(
        feasibility.title,
        `${feasibility.message}\n\n${feasibility.suggestion}`,
        [
          { text: "我再改改", style: "cancel" },
          ...(feasibility.revisedGoal
            ? [
                {
                  text: "改成推荐目标",
                  onPress: () => {
                    setGoalText(feasibility.revisedGoal || goal);
                    setAcceptedStretchGoal(null);
                  },
                },
              ]
            : []),
        ]
      );
      return;
    }

    if (
      feasibility.level === "stretch" &&
      acceptedStretchGoal !== goal &&
      !skipStretchWarning
    ) {
      Alert.alert(
        feasibility.title,
        `${feasibility.message}\n\n${feasibility.suggestion}`,
        [
          { text: "先改目标", style: "cancel" },
          {
            text: "继续生成",
            onPress: () => {
              setAcceptedStretchGoal(goal);
              generate(true);
            },
          },
        ]
      );
      return;
    }

    generatingRef.current = true;
    setGoalAnalysis(null);
    setStep("loading");
    track("goal_create_start", { days });
    try {
      // 两幕式：诊断先回来就立刻展示，用户不必对着空屏等满一分钟
      let result;
      try {
        const analysis = await diagnoseGoal(goal, days, profile);
        setGoalAnalysis(analysis);
        Haptics.selectionAsync().catch(() => {});
        result = await planFromDiagnosis(goal, days, profile, persona, analysis);
      } catch {
        // 分步链路任一环出问题，退回一次性生成（内部还有本地模板兜底）
        result = await generateTasksWithFallback(goal, days, profile, persona);
      }
      if (result.usedAI) consumeAIQuota();
      track(result.usedAI ? "goal_create_success" : "goal_create_fallback", {
        days,
        tasks: result.tasks.length,
      });
      setTasks(result.tasks);
      setGoalAnalysis(result.analysis);
      setUsedAI(result.usedAI);
      setExpandedWeeks(new Set([0]));
      setStep("confirm");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      generatingRef.current = false;
    }
  }, [goalText, days, profile, acceptedStretchGoal, persona, router]);

  const confirm = useCallback(() => {
    addGoal(goalText.trim(), days, tasks, profile, goalAnalysis || undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.dismiss();
  }, [addGoal, goalText, days, tasks, profile, goalAnalysis, router]);

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    setTasks((prev) => {
      const next = [...prev];
      next[editingIndex] = {
        ...next[editingIndex],
        task: editText.trim() || next[editingIndex].task,
        challengeTask: editText.trim() || next[editingIndex].challengeTask,
      };
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editText]);

  const remaining = remainingAIQuota(isProCached());

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top > 0 ? insets.top : spacing.md }]}>
        <PressableScale
          onPress={() => {
            if (step === "confirm") setStep("input");
            else router.dismiss();
          }}
          style={[styles.closeButton, { backgroundColor: colors.card }]}
        >
          <Ionicons
            name={step === "confirm" ? "arrow-back" : "close"}
            size={22}
            color={colors.text}
          />
        </PressableScale>
        <Text style={[styles.topTitle, { color: colors.text }]}>
          {step === "confirm" ? "确认陪跑计划" : "目标问诊"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "loading" && (
        <LoadingView goal={goalText.trim()} analysis={goalAnalysis} />
      )}

      {step === "input" && (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroBlock}>
            <Text style={[styles.heroKicker, { color: colors.primary }]}>断了也能接回来</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              一句话，先生成能执行的陪跑。
            </Text>
            <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>
              先给你一版今天就能开始的计划；想更细，再调基础、节奏和时间分布。
            </Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={[styles.label, { color: colors.text }]}>你想完成什么？</Text>
            <TextInput
              value={goalText}
              onChangeText={setGoalText}
              placeholder="一句话说出目标，比如：30天读完《原则》"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.text }]}>计划周期</Text>
              <PressableScale onPress={askSuggestion} disabled={suggesting}>
                <View style={[styles.askPill, { backgroundColor: colors.primarySoft }]}>
                  {suggesting ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="sparkles" size={13} color={colors.primary} />
                  )}
                  <Text style={[styles.askPillText, { color: colors.primary }]}>
                    {suggesting ? "陪练思考中" : "让陪练建议"}
                  </Text>
                </View>
              </PressableScale>
            </View>
            <View style={styles.chipRow}>
              {DAY_OPTIONS.map((d) => (
                <Chip key={d} label={`${d}天`} active={days === d} onPress={() => setDays(d)} />
              ))}
              <Chip
                label={isCustomDays ? `${days}天 ·自定义` : "自定义"}
                active={isCustomDays}
                onPress={() => {
                  setCustomDaysText(isCustomDays ? String(days) : "");
                  setCustomDaysOpen(true);
                }}
              />
            </View>

            {suggestion && (
              <Animated.View entering={FadeInDown.springify()}>
                <Card style={{ gap: spacing.sm }}>
                  <View style={styles.suggestHeader}>
                    <Ionicons name="sparkles" size={16} color={colors.primary} />
                    <Text style={[styles.suggestTitle, { color: colors.text }]}>
                      陪练建议 {suggestion.recommendedDays} 天
                    </Text>
                  </View>
                  {!!suggestion.reason && (
                    <Text style={[styles.suggestReason, { color: colors.textSecondary }]}>
                      {suggestion.reason}
                    </Text>
                  )}
                  {!!suggestion.warning && (
                    <View style={[styles.warnBox, { backgroundColor: colors.warningSoft }]}>
                      <Text style={[styles.warnText, { color: colors.text }]}>
                        {suggestion.warning}
                      </Text>
                    </View>
                  )}
                  <View style={{ gap: spacing.sm }}>
                    {suggestion.options.map((opt) => {
                      const active = days === opt.days;
                      return (
                        <PressableScale
                          key={`${opt.label}-${opt.days}`}
                          onPress={() => {
                            setDays(opt.days);
                            Haptics.selectionAsync().catch(() => {});
                          }}
                        >
                          <View
                            style={[
                              styles.suggestOption,
                              {
                                backgroundColor: active ? colors.primarySoft : colors.background,
                                borderColor: active ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <View style={[styles.suggestDays, { backgroundColor: colors.card }]}>
                              <Text style={[styles.suggestDaysText, { color: colors.primary }]}>
                                {opt.days}天
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.suggestLabel, { color: colors.text }]}>
                                {opt.label}
                              </Text>
                              <Text
                                style={[styles.suggestDesc, { color: colors.textSecondary }]}
                              >
                                {opt.desc}
                              </Text>
                            </View>
                            {active && (
                              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                            )}
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                </Card>
              </Animated.View>
            )}
          </View>

          <Card style={styles.diagnosisCard}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>计划手感</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
              先定每天投入时间，其他交给 AI 判断。
            </Text>

            <View style={styles.questionBlock}>
              <Text style={[styles.questionTitle, { color: colors.text }]}>每天大概能投入多久？</Text>
              <View style={styles.chipRow}>
                {MINUTE_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m}分钟`}
                    active={profile.dailyMinutes === m}
                    onPress={() => updateProfile({ dailyMinutes: m })}
                  />
                ))}
              </View>
            </View>

            <PressableScale
              onPress={() => setShowAdvanced((v) => !v)}
              style={[styles.advancedToggle, { backgroundColor: colors.background }]}
            >
              <Text style={[styles.advancedText, { color: colors.textSecondary }]}>
                {showAdvanced ? "收起高级设置" : "展开高级设置"}
              </Text>
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textTertiary}
              />
            </PressableScale>

            {showAdvanced && (
              <>
                <View style={styles.questionBlock}>
                  <Text style={[styles.questionTitle, { color: colors.text }]}>你现在的基础？</Text>
                  <View style={styles.chipRow}>
                    {LEVEL_OPTIONS.map((item) => (
                      <Chip
                        key={item.value}
                        label={item.label}
                        active={profile.currentLevel === item.value}
                        onPress={() => updateProfile({ currentLevel: item.value })}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.questionBlock}>
                  <Text style={[styles.questionTitle, { color: colors.text }]}>想要什么节奏？</Text>
                  <View style={{ gap: spacing.sm }}>
                    {PACE_OPTIONS.map((item) => {
                      const active = profile.pace === item.value;
                      return (
                        <PressableScale key={item.value} onPress={() => updateProfile({ pace: item.value })}>
                          <View
                            style={[
                              styles.paceRow,
                              {
                                backgroundColor: active ? colors.primarySoft : colors.background,
                                borderColor: active ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <View>
                              <Text style={[styles.paceTitle, { color: colors.text }]}>{item.label}</Text>
                              <Text style={[styles.paceDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
                            </View>
                            {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.questionBlock}>
                  <Text style={[styles.questionTitle, { color: colors.text }]}>你的时间分布？</Text>
                  <View style={styles.chipRow}>
                    {WEEKDAY_OPTIONS.map((item) => (
                      <Chip
                        key={item.value}
                        label={item.label}
                        active={profile.weekdayMode === item.value}
                        onPress={() => updateProfile({ weekdayMode: item.value })}
                      />
                    ))}
                  </View>
                </View>
              </>
            )}
          </Card>

          <View style={{ gap: spacing.sm }}>
            <Text style={[styles.label, { color: colors.text }]}>没想好？试试这些</Text>
            <View style={styles.chipRow}>
              {GOAL_TEMPLATES.map((t) => (
                <Chip
                  key={t.id}
                  label={`${t.emoji} ${t.title}`}
                  onPress={() => {
                    setGoalText(t.goal);
                    setDays(t.days);
                  }}
                />
              ))}
            </View>
          </View>

          <Button title="生成我的陪跑计划" onPress={() => generate()} />
          {/* 平时不提额度：免费额度对正常使用绰绰有余，天天显示剩余次数只会制造焦虑 */}
          <Text style={[styles.quotaHint, { color: colors.textTertiary }]}>
            {remaining !== Infinity && remaining <= 5
              ? `本月还剩 ${remaining} 次 AI 生成，下月自动恢复`
              : "AI 不可用时会自动用本地计划兜底，不会卡住你"}
          </Text>
        </ScrollView>
      )}

      {step === "confirm" && (
        <>
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 140 }}
          >
            <Animated.View entering={FadeInDown.springify()}>
              <Card style={styles.summaryCard}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmGoal, { color: colors.text }]}>{goalText}</Text>
                  <Text style={[styles.confirmMeta, { color: colors.textSecondary }]}>
                    共 {tasks.length} 天 · 每天约 {profile.dailyMinutes} 分钟 · {usedAI ? "AI 陪跑生成" : "本地陪跑计划"}
                  </Text>
                </View>
                <Text style={styles.summaryEmoji}>🌤️</Text>
              </Card>
            </Animated.View>

            {goalAnalysis?.disclaimer && (
              <Animated.View entering={FadeInDown.delay(45).springify()}>
                <DisclaimerCard analysis={goalAnalysis} />
              </Animated.View>
            )}

            {goalAnalysis && (
              <Animated.View entering={FadeInDown.delay(90).springify()}>
                <Card style={styles.analysisCard}>
                  <View style={styles.analysisHeader}>
                    <View>
                      <Text style={[styles.analysisKicker, { color: colors.primary }]}>
                        陪练对这个目标的理解
                      </Text>
                      <Text style={[styles.analysisTitle, { color: colors.text }]}>
                        {goalAnalysis.domain} · {goalAnalysis.subject}
                      </Text>
                    </View>
                    <Ionicons name="sparkles" size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.analysisBody, { color: colors.textSecondary }]}>
                    {goalAnalysis.expertiseAngle}
                  </Text>
                  <View style={[styles.strategyBox, { backgroundColor: colors.background }]}>
                    <Text style={[styles.strategyLabel, { color: colors.textTertiary }]}>陪练策略</Text>
                    <Text style={[styles.strategyText, { color: colors.text }]}>
                      {goalAnalysis.coachStrategy}
                    </Text>
                  </View>
                  <View style={styles.analysisList}>
                    {goalAnalysis.keyMilestones.slice(0, 4).map((item) => (
                      <View key={item} style={[styles.analysisChip, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.analysisChipText, { color: colors.textSecondary }]}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(180).springify()}>
              <Card style={{ gap: spacing.sm }}>
                <Text style={[styles.rhythmTitle, { color: colors.text }]}>
                  为你设计的节奏，不是平均分配
                </Text>
                <RhythmStrip tasks={tasks} />
              </Card>
            </Animated.View>

            {weekGroups
              ? weekGroups.map((week, w) => {
                  const open = expandedWeeks.has(w);
                  const pushDays = week.filter((t) => taskEnergy(t) === "push").length;
                  return (
                    <React.Fragment key={`week-${w}`}>
                      <PressableScale onPress={() => toggleWeek(w)}>
                        <Card style={styles.weekHeader}>
                          <View style={{ flex: 1, gap: 8 }}>
                            <View style={styles.weekTitleRow}>
                              <Text style={[styles.weekTitle, { color: colors.text }]}>
                                第 {w + 1} 周
                              </Text>
                              <Text style={[styles.weekMeta, { color: colors.textTertiary }]}>
                                D{week[0].day}–D{week[week.length - 1].day}
                                {pushDays > 0 ? ` · 冲刺 ${pushDays} 天` : " · 轻松推进"}
                              </Text>
                            </View>
                            {!open && <RhythmStrip tasks={week} showLegend={false} />}
                          </View>
                          <Ionicons
                            name={open ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={colors.textTertiary}
                          />
                        </Card>
                      </PressableScale>
                      {open &&
                        week.map((t, j) => (
                          <TaskRowCard
                            key={`t${w * 7 + j}`}
                            task={t}
                            onEdit={() => {
                              setEditingIndex(w * 7 + j);
                              setEditText(t.task);
                            }}
                          />
                        ))}
                    </React.Fragment>
                  );
                })
              : tasks.map((task, i) => (
                  <TaskRowCard
                    key={i}
                    task={task}
                    onEdit={() => {
                      setEditingIndex(i);
                      setEditText(task.task);
                    }}
                  />
                ))}
          </ScrollView>

          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + spacing.sm,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Button title="重新生成" variant="secondary" onPress={() => generate()} style={{ flex: 1 }} />
            <Button title="开始陪跑" onPress={confirm} style={{ flex: 2 }} />
          </View>
        </>
      )}

      <Modal
        visible={customDaysOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomDaysOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.editBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View style={[styles.editCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.label, { color: colors.text }]}>自定义周期</Text>
            <Text style={[styles.customHint, { color: colors.textSecondary }]}>
              输入 {MIN_DAYS}–{MAX_DAYS} 之间的天数。太长的周期更难坚持,可以先做第一阶段。
            </Text>
            <TextInput
              value={customDaysText}
              onChangeText={(t) => setCustomDaysText(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              autoFocus
              placeholder="例如 45"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.customInput,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="取消"
                variant="ghost"
                onPress={() => setCustomDaysOpen(false)}
                style={{ flex: 1 }}
              />
              <Button title="确定" onPress={applyCustomDays} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editingIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingIndex(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.editBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View style={[styles.editCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              修改第 {editingIndex !== null ? tasks[editingIndex]?.day : ""} 天任务
            </Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title="取消"
                variant="ghost"
                onPress={() => setEditingIndex(null)}
                style={{ flex: 1 }}
              />
              <Button title="保存" onPress={saveEdit} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  heroKicker: {
    fontSize: 13,
    fontWeight: "900",
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
  },
  heroDesc: {
    fontSize: 15,
    lineHeight: 23,
  },
  label: {
    fontSize: 16,
    fontWeight: "800",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  askPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.full,
    minHeight: 32,
  },
  askPillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  suggestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  suggestTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  suggestReason: {
    fontSize: 13,
    lineHeight: 19,
  },
  warnBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  warnText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  suggestOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  suggestDays: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  suggestDaysText: {
    fontSize: 13,
    fontWeight: "900",
  },
  suggestLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  suggestDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  customHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: -6,
  },
  customInput: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: "800",
  },
  input: {
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  diagnosisCard: {
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: -10,
  },
  questionBlock: {
    gap: spacing.sm,
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  advancedToggle: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advancedText: {
    fontSize: 13,
    fontWeight: "900",
  },
  paceRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paceTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  paceDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  templateDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  quotaHint: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
  },
  loadingContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  diagHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  diagKicker: {
    fontSize: 12,
    fontWeight: "900",
  },
  diagTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
  },
  diagBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  diagStrategy: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 3,
  },
  diagStrategyLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  diagStrategyText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  loadingGoal: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: -6,
  },
  stepList: {
    alignSelf: "stretch",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingHint: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  rhythmTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
  },
  weekTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  weekTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  weekMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  summaryEmoji: {
    fontSize: 36,
  },
  confirmGoal: {
    fontSize: 19,
    fontWeight: "900",
  },
  confirmMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  analysisCard: {
    gap: spacing.md,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  analysisKicker: {
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  analysisTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  analysisBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  strategyBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  strategyLabel: {
    fontSize: 11,
    fontWeight: "900",
  },
  strategyText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  analysisList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  analysisChip: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  analysisChipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: 14,
  },
  dayBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleText: {
    fontSize: 12,
    fontWeight: "900",
  },
  taskRowText: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
  },
  taskFocus: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaPill: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  editCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
