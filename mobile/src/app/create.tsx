import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
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
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Chip, PressableScale } from "@/components/ui";
import { generateTasksWithFallback } from "@/lib/ai";
import { consumeAIQuota, isProCached, remainingAIQuota } from "@/lib/entitlements";
import { evaluateGoalFeasibility } from "@/lib/feasibility";
import { useGoals } from "@/lib/GoalsContext";
import { DEFAULT_GOAL_PROFILE, DayTask, GOAL_TEMPLATES, GoalAnalysis, GoalProfile } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

type Step = "input" | "loading" | "confirm";

const DAY_OPTIONS = [7, 14, 21, 30, 60, 100];
const MINUTE_OPTIONS = [15, 25, 40, 60];

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

const LOADING_HINTS = [
  "先判断这是不是一个会半路崩掉的计划…",
  "给你留最低完成版，忙的时候也能不断档…",
  "把前几天调轻一点，先让身体进入节奏…",
  "正在安排缓冲日，防止计划太脆…",
  "最后检查：每天能不能真的做完…",
];

function LoadingView() {
  const { colors } = useTheme();
  const [hintIndex, setHintIndex] = useState(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1
    );
    const timer = setInterval(
      () => setHintIndex((i) => Math.min(i + 1, LOADING_HINTS.length - 1)),
      2500
    );
    return () => clearInterval(timer);
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={spinStyle}>
        <Text style={{ fontSize: 56 }}>☀️</Text>
      </Animated.View>
      <Text style={[styles.loadingTitle, { color: colors.text }]}>
        正在生成陪跑计划
      </Text>
      <Animated.Text
        key={hintIndex}
        entering={FadeInDown}
        style={[styles.loadingHint, { color: colors.textSecondary }]}
      >
        {LOADING_HINTS[hintIndex]}
      </Animated.Text>
    </View>
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

export default function CreateGoalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addGoal } = useGoals();

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
  const generatingRef = useRef(false);

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
    setStep("loading");
    try {
      const result = await generateTasksWithFallback(goal, days, profile);
      if (result.usedAI) consumeAIQuota();
      setTasks(result.tasks);
      setGoalAnalysis(result.analysis);
      setUsedAI(result.usedAI);
      setStep("confirm");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      generatingRef.current = false;
    }
  }, [goalText, days, profile, acceptedStretchGoal, router]);

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

      {step === "loading" && <LoadingView />}

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
            <Text style={[styles.label, { color: colors.text }]}>计划周期</Text>
            <View style={styles.chipRow}>
              {DAY_OPTIONS.map((d) => (
                <Chip key={d} label={`${d}天`} active={days === d} onPress={() => setDays(d)} />
              ))}
            </View>
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
          <Text style={[styles.quotaHint, { color: colors.textTertiary }]}>
            本月还有 {remaining === Infinity ? "充足" : remaining} 次 AI 生成；失败时会自动用本地计划兜底
          </Text>
        </ScrollView>
      )}

      {step === "confirm" && (
        <>
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 140 }}
          >
            <Card style={styles.summaryCard}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.confirmGoal, { color: colors.text }]}>{goalText}</Text>
                <Text style={[styles.confirmMeta, { color: colors.textSecondary }]}>
                  共 {tasks.length} 天 · 每天约 {profile.dailyMinutes} 分钟 · {usedAI ? "AI 陪跑生成" : "本地陪跑计划"}
                </Text>
              </View>
              <Text style={styles.summaryEmoji}>🌤️</Text>
            </Card>

            {goalAnalysis && (
              <Card style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <View>
                    <Text style={[styles.analysisKicker, { color: colors.primary }]}>
                      AI 对这个目标的理解
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
            )}

            {tasks.map((task, i) => (
              <PressableScale
                key={i}
                onPress={() => {
                  setEditingIndex(i);
                  setEditText(task.task);
                }}
              >
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
                    {!!task.successCheck && (
                      <Text style={[styles.taskCheck, { color: colors.textSecondary }]}>
                        验收：{task.successCheck}
                      </Text>
                    )}
                    <View style={[styles.minimumBox, { backgroundColor: colors.background }]}>
                      <Text style={[styles.minimumLabel, { color: colors.textTertiary }]}>最低完成版</Text>
                      <Text style={[styles.minimumText, { color: colors.textSecondary }]}>
                        {task.minimumTask || "先做 10 分钟，保住节奏"}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="pencil" size={16} color={colors.textTertiary} />
                </Card>
              </PressableScale>
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: "900",
  },
  loadingHint: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
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
    fontWeight: "900",
  },
  taskCheck: {
    fontSize: 12,
    lineHeight: 18,
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
  minimumBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  minimumLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  minimumText: {
    fontSize: 13,
    lineHeight: 18,
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
