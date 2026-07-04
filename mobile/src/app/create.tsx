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
import {
  consumeAIQuota,
  isProCached,
  remainingAIQuota,
} from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { DayTask, GOAL_TEMPLATES } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

type Step = "input" | "loading" | "confirm";

const DAY_OPTIONS = [7, 14, 21, 30, 60, 100];

const LOADING_HINTS = [
  "AI 教练正在分析你的目标…",
  "拆解成每天可执行的小任务…",
  "由易到难安排节奏…",
  "留出休息和缓冲时间…",
  "通常需要 20–40 秒，请稍候…",
  "快好了，正在最后检查…",
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
        <Text style={{ fontSize: 56 }}>⚙️</Text>
      </Animated.View>
      <Text style={[styles.loadingTitle, { color: colors.text }]}>
        AI 正在拆解你的目标
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

export default function CreateGoalScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addGoal } = useGoals();

  const [step, setStep] = useState<Step>("input");
  const [goalText, setGoalText] = useState("");
  const [days, setDays] = useState(21);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [usedAI, setUsedAI] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const generatingRef = useRef(false);

  const generate = useCallback(async () => {
    if (generatingRef.current) return;
    const goal = goalText.trim();
    if (!goal) {
      Alert.alert("请先输入目标", "比如：读完《原则》、跑完半马、学会做10道菜");
      return;
    }
    const quota = remainingAIQuota(isProCached());
    if (quota <= 0) {
      Alert.alert(
        "本月 AI 拆解次数已用完",
        "升级 Pro 解锁无限次 AI 拆解，或下月再来。",
        [
          { text: "取消", style: "cancel" },
          { text: "了解 Pro", onPress: () => router.push("/paywall") },
        ]
      );
      return;
    }

    generatingRef.current = true;
    setStep("loading");
    try {
      const result = await generateTasksWithFallback(goal, days);
      if (result.usedAI) consumeAIQuota();
      setTasks(result.tasks);
      setUsedAI(result.usedAI);
      setStep("confirm");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      generatingRef.current = false;
    }
  }, [goalText, days, router]);

  const confirm = useCallback(() => {
    addGoal(goalText.trim(), days, tasks);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.dismiss();
  }, [addGoal, goalText, days, tasks, router]);

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    setTasks((prev) => {
      const next = [...prev];
      next[editingIndex] = { ...next[editingIndex], task: editText.trim() || next[editingIndex].task };
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editText]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* 顶部栏 */}
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
          {step === "confirm" ? "确认计划" : "创建目标"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "loading" && <LoadingView />}

      {step === "input" && (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
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
            <Text style={[styles.label, { color: colors.text }]}>用多少天完成？</Text>
            <View style={styles.chipRow}>
              {DAY_OPTIONS.map((d) => (
                <Chip
                  key={d}
                  label={`${d}天`}
                  active={days === d}
                  onPress={() => setDays(d)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={[styles.label, { color: colors.text }]}>或者试试这些</Text>
            <View style={{ gap: spacing.sm }}>
              {GOAL_TEMPLATES.map((t) => (
                <PressableScale
                  key={t.id}
                  onPress={() => {
                    setGoalText(t.goal);
                    setDays(t.days);
                  }}
                >
                  <Card style={styles.templateCard}>
                    <Text style={{ fontSize: 28 }}>{t.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateTitle, { color: colors.text }]}>
                        {t.title}
                      </Text>
                      <Text style={[styles.templateDesc, { color: colors.textSecondary }]}>
                        {t.goal} · {t.days}天
                      </Text>
                    </View>
                  </Card>
                </PressableScale>
              ))}
            </View>
          </View>

          <Button title="让 AI 拆解目标 ✨" onPress={generate} />
          {!isProCached() && (
            <Text style={[styles.quotaHint, { color: colors.textTertiary }]}>
              本月剩余 {remainingAIQuota(false)} 次免费 AI 拆解
            </Text>
          )}
        </ScrollView>
      )}

      {step === "confirm" && (
        <>
          <ScrollView
            contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: 140 }}
          >
            <Card style={{ gap: 4 }}>
              <Text style={[styles.confirmGoal, { color: colors.text }]}>{goalText}</Text>
              <Text style={[styles.confirmMeta, { color: colors.textSecondary }]}>
                共 {tasks.length} 天 · {usedAI ? "AI 智能拆解" : "本地模板（AI 暂不可用）"}
              </Text>
            </Card>

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
                    <Text style={[styles.dayBubbleText, { color: colors.primary }]}>
                      {task.day}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskRowText, { color: colors.text }]}>
                      {task.task}
                    </Text>
                    {!!task.pages && (
                      <Text style={[styles.taskRowMeta, { color: colors.textTertiary }]}>
                        {task.pages}
                      </Text>
                    )}
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
            <Button
              title="重新生成"
              variant="secondary"
              onPress={generate}
              style={{ flex: 1 }}
            />
            <Button title="开始执行 🚀" onPress={confirm} style={{ flex: 2 }} />
          </View>
        </>
      )}

      {/* 单条任务编辑 */}
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
    fontWeight: "700",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    minHeight: 88,
    borderRadius: radius.md,
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
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  templateDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  quotaHint: {
    textAlign: "center",
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  loadingHint: {
    fontSize: 14,
  },
  confirmGoal: {
    fontSize: 18,
    fontWeight: "800",
  },
  confirmMeta: {
    fontSize: 13,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
  },
  dayBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleText: {
    fontSize: 13,
    fontWeight: "800",
  },
  taskRowText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  taskRowMeta: {
    fontSize: 12,
    marginTop: 2,
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
