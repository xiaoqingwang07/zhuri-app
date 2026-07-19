import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
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
import { BadgeModal } from "@/components/BadgeModal";
import { Confetti } from "@/components/Confetti";
import { Button, Card, PressableScale, ProgressBar } from "@/components/ui";
import { fallbackCoachMessage, generateCoachMessage } from "@/lib/ai";
import { kvGet, kvSet } from "@/lib/db";
import { rescheduleReminders } from "@/lib/notifications";
import { isProCached, maxGoals } from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { formatChineseDate, todayStr, weekdayName } from "@/lib/dates";
import {
  completionRate,
  missedDays,
  nextIncompleteTaskIndex,
  todayTaskIndex,
} from "@/lib/store";
import { Badge, CheckInFeedback, Goal, PERSONAS } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，先保住一点节奏";
  if (hour < 10) return "早上好，今天先做最小一步";
  if (hour < 14) return "中午好，别让计划挤压你";
  if (hour < 18) return "下午好，适合把今天接住";
  if (hour < 22) return "晚上好，还来得及完成一点";
  return "今天快结束了，做最低版也算数";
}

function difficultyLabel(goal: Goal): string {
  const idx = todayTaskIndex(goal);
  const task = idx !== -1 ? goal.tasks[idx] : null;
  if (!task) return "休整";
  if (task.difficulty === "hard") return "挑战";
  if (task.difficulty === "easy") return "轻量";
  return "标准";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

const FEEDBACK_MINUTES = [10, 20, 30, 45, 60];
const FEEDBACK_DIFFICULTIES: {
  id: CheckInFeedback["difficulty"];
  label: string;
  next: CheckInFeedback["adjustmentPreference"];
}[] = [
  { id: "just_right", label: "刚好", next: "keep" },
  { id: "too_hard", label: "偏难", next: "lighter" },
  { id: "too_easy", label: "偏轻", next: "harder" },
];

function TodayProgressDial({
  progress,
  done,
}: {
  progress: number;
  done: boolean;
}) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: done ? 0.22 : 0.08 + pulse.value * 0.16,
    transform: [{ scale: 0.96 + pulse.value * 0.08 }],
  }));

  return (
    <View style={styles.dialWrap}>
      <Animated.View
        style={[
          styles.dialHalo,
          { backgroundColor: done ? colors.success : colors.primary },
          haloStyle,
        ]}
      />
      <View style={[styles.dial, { borderColor: done ? colors.success : colors.primary }]}>
        <Text style={[styles.dialValue, { color: colors.text }]}>
          {clampPercent(progress)}
        </Text>
        <Text style={[styles.dialUnit, { color: colors.textTertiary }]}>%</Text>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGoals, goals, checkIn, persona } = useGoals();
  const [showConfetti, setShowConfetti] = useState(false);
  const [unlockedBadge, setUnlockedBadge] = useState<Badge | null>(null);
  const [, setCoachVersion] = useState(0);
  const [needsOnboarding] = useState(() => kvGet("onboarding_done") !== "1");
  const [feedbackGoal, setFeedbackGoal] = useState<Goal | null>(null);
  const [feedbackMinutes, setFeedbackMinutes] = useState(30);
  const [feedbackDifficulty, setFeedbackDifficulty] =
    useState<CheckInFeedback["difficulty"]>("just_right");
  const [feedbackBlocker, setFeedbackBlocker] = useState("");

  const today = todayStr();
  const personaInfo = PERSONAS.find((p) => p.id === persona)!;

  const primaryGoal = useMemo(() => {
    if (activeGoals.length === 0) return null;
    const withMissed = activeGoals.find((g) => missedDays(g) > 0);
    return withMissed || activeGoals[0];
  }, [activeGoals]);

  const coachMessageFor = (goalId: string, goalName: string): string => {
    return (
      kvGet(`coach_${goalId}_${today}_${persona}`) ||
      fallbackCoachMessage(persona, goalName)
    );
  };

  useEffect(() => {
    rescheduleReminders(persona, goals).catch(() => {});
  }, [goals, persona]);

  useEffect(() => {
    for (const goal of activeGoals) {
      const idx = todayTaskIndex(goal);
      if (idx === -1) continue;
      const task = goal.tasks[idx];
      if (task.completed) continue;

      const cacheKey = `coach_${goal.id}_${today}_${persona}`;
      if (kvGet(cacheKey)) continue;

      generateCoachMessage(persona, {
        goalName: goal.name,
        streak: goal.streak,
        completionRate: Math.round(completionRate(goal) * 100),
        missedCount: missedDays(goal),
        daysLeft: goal.tasks.filter((t) => !t.completed).length,
        todayTask: task.task,
      }).then((msg) => {
        kvSet(cacheKey, msg);
        setCoachVersion((v) => v + 1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoals.length, persona, today]);

  const openFeedback = useCallback((goal: Goal) => {
    const idx = todayTaskIndex(goal);
    const task = idx === -1 ? null : goal.tasks[idx];
    setFeedbackGoal(goal);
    setFeedbackMinutes(task?.durationMinutes || goal.profile?.dailyMinutes || 30);
    setFeedbackDifficulty("just_right");
    setFeedbackBlocker("");
  }, []);

  const submitFeedback = useCallback(
    (goal: Goal) => {
      const idx = todayTaskIndex(goal);
      if (idx === -1) return;
      const selected = FEEDBACK_DIFFICULTIES.find((item) => item.id === feedbackDifficulty);
      const feedback: CheckInFeedback = {
        actualMinutes: feedbackMinutes,
        difficulty: feedbackDifficulty,
        blocker: feedbackBlocker.trim() || undefined,
        adjustmentPreference: selected?.next || "keep",
      };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = checkIn(goal.id, idx, feedback);
      if (!result) return;
      setFeedbackGoal(null);
      setShowConfetti(true);
      if (result.newBadges.length > 0) {
        setTimeout(() => setUnlockedBadge(result.newBadges[0]), 600);
      }
      if (result.justCompleted) {
        setTimeout(() => {
          Alert.alert(
            "目标达成",
            `你完成了「${goal.name}」。去目标详情页领一张成就证书吧。`,
            [
              { text: "稍后", style: "cancel" },
              { text: "查看证书", onPress: () => router.push(`/goal/${goal.id}`) },
            ]
          );
        }, 1200);
      }
    },
    [checkIn, feedbackBlocker, feedbackDifficulty, feedbackMinutes, router]
  );

  const handleAddGoal = useCallback(() => {
    const limit = maxGoals(isProCached());
    if (activeGoals.length >= limit) {
      Alert.alert(
        "目标数量已达上限",
        isProCached()
          ? `最多同时进行 ${limit} 个目标，先完成一个再来吧。`
          : `免费版最多 ${limit} 个并行目标。升级 Plus 可同时进行更多目标。`,
        isProCached()
          ? [{ text: "知道了" }]
          : [
              { text: "取消", style: "cancel" },
              { text: "了解 Plus", onPress: () => router.push("/paywall") },
            ]
      );
      return;
    }
    router.push("/create");
  }, [activeGoals.length, router]);

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  const primaryTodayIdx = primaryGoal ? todayTaskIndex(primaryGoal) : -1;
  const primaryCatchUpIdx =
    primaryGoal && primaryTodayIdx === -1 ? nextIncompleteTaskIndex(primaryGoal) : -1;
  const primaryIdx = primaryTodayIdx !== -1 ? primaryTodayIdx : primaryCatchUpIdx;
  const isCatchUpDay = primaryTodayIdx === -1 && primaryCatchUpIdx !== -1;
  const primaryTask = primaryGoal && primaryIdx !== -1 ? primaryGoal.tasks[primaryIdx] : null;
  const primaryMissed = primaryGoal ? missedDays(primaryGoal) : 0;
  const primaryRate = primaryGoal ? completionRate(primaryGoal) : 0;
  const doneToday = primaryTodayIdx !== -1 ? !!primaryGoal?.tasks[primaryTodayIdx]?.completed : false;
  const unfinishedGoals = activeGoals.filter((g) => {
    const todayIdx = todayTaskIndex(g);
    if (todayIdx !== -1) return !g.tasks[todayIdx].completed;
    const catchUp = nextIncompleteTaskIndex(g);
    return catchUp !== -1 && g.tasks[catchUp].date <= today;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.md,
          paddingBottom: 120,
          gap: spacing.md,
        }}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {formatChineseDate(today)} · {weekdayName(today)}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>逐日</Text>
          </View>
          <PressableScale
            onPress={handleAddGoal}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={28} color="#FFF" />
          </PressableScale>
        </View>

        {activeGoals.length === 0 && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🌤️</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                给一个目标，逐日帮你接住每天。
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                不是只生成计划。逐日会每天提醒你做什么，忙的时候给最低完成版，落后时帮你重排。
              </Text>
              <Button
                title="创建第一个陪跑目标"
                onPress={handleAddGoal}
                style={{ alignSelf: "stretch", marginTop: spacing.sm }}
              />
            </Card>
          </Animated.View>
        )}

        {primaryGoal && primaryTask && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={[styles.heroCard, { backgroundColor: colors.card }]}>
              <View style={[styles.heroAccent, { backgroundColor: doneToday ? colors.successSoft : colors.primarySoft }]} />
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.kickerRow}>
                    <View style={[styles.liveDot, { backgroundColor: doneToday ? colors.success : colors.primary }]} />
                    <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting()}</Text>
                  </View>
                  <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={2}>
                    {doneToday ? "今天已经接住了" : primaryGoal.name}
                  </Text>
                  <Text style={[styles.heroSubline, { color: colors.textTertiary }]}>
                    {doneToday
                      ? "完成感已经入账，明天继续。"
                      : `先做 ${primaryTask.minimumTask ? "最低版" : "10 分钟"}，把节奏保住。`}
                  </Text>
                </View>
                <TodayProgressDial progress={primaryRate} done={doneToday} />
              </View>

              <View style={styles.statsStrip}>
                <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>DAY</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {primaryGoal.currentDay}/{primaryGoal.totalDays}
                  </Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>STREAK</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {primaryGoal.streak} 天
                  </Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: colors.background }]}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>MODE</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {difficultyLabel(primaryGoal)}
                  </Text>
                </View>
              </View>

              {primaryMissed > 0 && (
                <PressableScale
                  onPress={() => router.push(`/goal/${primaryGoal.id}?action=adjust`)}
                  style={[styles.rescueBanner, { backgroundColor: colors.warningSoft }]}
                >
                  <View style={[styles.rescueIcon, { backgroundColor: colors.warning }]}>
                    <Ionicons name="flash" size={16} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rescueTitle, { color: colors.text }]}>
                      落后 {primaryMissed} 天了，但还接得回来
                    </Text>
                    <Text style={[styles.rescueDesc, { color: colors.textSecondary }]}>
                      让 AI 把剩余任务重新排成从今天开始的节奏
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.warning} />
                </PressableScale>
              )}

              <View style={[styles.taskPanel, { backgroundColor: colors.background }]}>
                <View style={styles.panelHeader}>
                  <Text style={[styles.panelLabel, { color: colors.textTertiary }]}>
                    {isCatchUpDay ? "补作业任务" : "今日主任务"}
                  </Text>
                  <Text style={[styles.durationTag, { color: colors.primary, backgroundColor: colors.primarySoft }]}>
                    {primaryTask.durationMinutes || primaryGoal.profile?.dailyMinutes || 30} 分钟
                  </Text>
                </View>
                <Text
                  style={[
                    styles.taskText,
                    {
                      color: doneToday ? colors.textSecondary : colors.text,
                      textDecorationLine: doneToday ? "line-through" : "none",
                    },
                  ]}
                >
                  {primaryTask.task}
                </Text>

                {(primaryTask.focus || primaryTask.successCheck) && (
                  <View style={[styles.focusBox, { backgroundColor: colors.card }]}>
                    {!!primaryTask.focus && (
                      <Text style={[styles.focusText, { color: colors.primary }]}>
                        今日专项：{primaryTask.focus}
                      </Text>
                    )}
                    {!!primaryTask.successCheck && (
                      <Text style={[styles.checkText, { color: colors.textSecondary }]}>
                        做到这步算完成：{primaryTask.successCheck}
                      </Text>
                    )}
                  </View>
                )}

                {!doneToday && (
                  <View style={[styles.minimumBox, { backgroundColor: colors.card }]}>
                    <View style={styles.minimumHeader}>
                      <Ionicons name="leaf" size={14} color={colors.primary} />
                      <Text style={[styles.minimumLabel, { color: colors.primary }]}>最低完成版</Text>
                    </View>
                    <Text style={[styles.minimumText, { color: colors.textSecondary }]}>
                      {primaryTask.minimumTask || "先做 10 分钟，保住节奏"}
                    </Text>
                  </View>
                )}
              </View>

              {!doneToday && (
                <View style={[styles.coachBox, { backgroundColor: colors.primarySoft }]}>
                  <Text style={styles.coachEmoji}>{personaInfo.emoji}</Text>
                  <Text style={[styles.coachText, { color: colors.text }]}>
                    {coachMessageFor(primaryGoal.id, primaryGoal.name)}
                  </Text>
                </View>
              )}

              <View style={styles.actionRow}>
                <Button
                  title={doneToday ? "查看目标" : "完成并反馈"}
                  onPress={() => (doneToday ? router.push(`/goal/${primaryGoal.id}`) : openFeedback(primaryGoal))}
                  style={{ flex: 1 }}
                />
                {!doneToday && (
                  <Button
                    title="详情"
                    variant="secondary"
                    onPress={() => router.push(`/goal/${primaryGoal.id}`)}
                    style={{ width: 92 }}
                  />
                )}
              </View>
            </Card>
          </Animated.View>
        )}

        {activeGoals.length > 1 && (
          <View style={{ gap: spacing.sm }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>其他目标</Text>
              <Text style={[styles.sectionMeta, { color: colors.textTertiary }]}>
                {unfinishedGoals.length} 个待推进
              </Text>
            </View>
            {activeGoals
              .filter((g) => g.id !== primaryGoal?.id)
              .map((goal, index) => {
                const idx = todayTaskIndex(goal);
                const task = idx !== -1 ? goal.tasks[idx] : null;
                const rate = completionRate(goal);
                const missed = missedDays(goal);
                const completed = task?.completed ?? true;
                return (
                  <Animated.View key={goal.id} entering={FadeInDown.delay(index * 60).springify()}>
                    <PressableScale onPress={() => router.push(`/goal/${goal.id}`)}>
                      <Card style={styles.smallGoalCard}>
                        <View style={{ flex: 1, gap: 6 }}>
                          <View style={styles.goalHeader}>
                            <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>
                              {goal.name}
                            </Text>
                            {missed > 0 && (
                              <Text style={[styles.missedPill, { color: colors.warning, backgroundColor: colors.warningSoft }]}>
                                落后 {missed} 天
                              </Text>
                            )}
                          </View>
                          <ProgressBar progress={rate} height={6} />
                          <Text
                            style={[
                              styles.smallTask,
                              {
                                color: completed ? colors.textTertiary : colors.textSecondary,
                                textDecorationLine: completed ? "line-through" : "none",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {task ? task.task : "今天没有任务"}
                          </Text>
                        </View>
                        {!completed && (
                          <PressableScale
                            onPress={() => openFeedback(goal)}
                            style={[styles.quickCheck, { backgroundColor: colors.primary }]}
                          >
                            <Ionicons name="checkmark" size={22} color="#FFF" />
                          </PressableScale>
                        )}
                      </Card>
                    </PressableScale>
                  </Animated.View>
                );
              })}
          </View>
        )}

        {goals.some((g) => g.status === "completed") && (
          <PressableScale onPress={() => router.push("/calendar")}>
            <Text style={[styles.completedLink, { color: colors.textTertiary }]}>
              已完成 {goals.filter((g) => g.status === "completed").length} 个目标 →
            </Text>
          </PressableScale>
        )}
      </ScrollView>

      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
      <BadgeModal badge={unlockedBadge} onClose={() => setUnlockedBadge(null)} />
      <Modal
        visible={!!feedbackGoal}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackGoal(null)}
      >
        <View style={[styles.feedbackBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.feedbackCard, { backgroundColor: colors.card }]}>
            <View style={styles.feedbackHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.feedbackKicker, { color: colors.primary }]}>完成反馈</Text>
                <Text style={[styles.feedbackTitle, { color: colors.text }]} numberOfLines={2}>
                  {feedbackGoal?.name}
                </Text>
              </View>
              <PressableScale
                onPress={() => setFeedbackGoal(null)}
                style={[styles.feedbackClose, { backgroundColor: colors.background }]}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </PressableScale>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.feedbackLabel, { color: colors.text }]}>实际用了多久？</Text>
              <View style={styles.feedbackChips}>
                {FEEDBACK_MINUTES.map((minute) => (
                  <PressableScale
                    key={minute}
                    onPress={() => setFeedbackMinutes(minute)}
                    style={[
                      styles.feedbackChip,
                      {
                        backgroundColor: feedbackMinutes === minute ? colors.primary : colors.background,
                        borderColor: feedbackMinutes === minute ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        { color: feedbackMinutes === minute ? "#FFF" : colors.textSecondary },
                      ]}
                    >
                      {minute} 分钟
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.feedbackLabel, { color: colors.text }]}>今天难度怎么样？</Text>
              <View style={styles.feedbackChips}>
                {FEEDBACK_DIFFICULTIES.map((item) => (
                  <PressableScale
                    key={item.id}
                    onPress={() => setFeedbackDifficulty(item.id)}
                    style={[
                      styles.feedbackChip,
                      {
                        backgroundColor: feedbackDifficulty === item.id ? colors.primarySoft : colors.background,
                        borderColor: feedbackDifficulty === item.id ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        { color: feedbackDifficulty === item.id ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            <TextInput
              value={feedbackBlocker}
              onChangeText={setFeedbackBlocker}
              placeholder="卡在哪里？可不填"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.feedbackInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <Button
              title="完成记录"
              onPress={() => feedbackGoal && submitFeedback(feedbackGoal)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  date: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 28,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: spacing.md,
  },
  heroCard: {
    gap: spacing.md,
    padding: spacing.lg,
    overflow: "hidden",
  },
  heroAccent: {
    position: "absolute",
    top: -44,
    right: -34,
    width: 170,
    height: 170,
    borderRadius: 38,
    transform: [{ rotate: "18deg" }],
    opacity: 0.9,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  greeting: {
    fontSize: 14,
    fontWeight: "900",
  },
  heroTitle: {
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "900",
    marginTop: 8,
  },
  heroSubline: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "700",
  },
  dialWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  dialHalo: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  dial: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  dialValue: {
    fontSize: 24,
    fontWeight: "900",
  },
  dialUnit: {
    fontSize: 10,
    fontWeight: "900",
    marginTop: -2,
  },
  statsStrip: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statPill: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 10,
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "900",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "900",
  },
  rescueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rescueIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  rescueTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  rescueDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  taskPanel: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: "900",
  },
  durationTag: {
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  taskText: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "900",
  },
  focusBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  focusText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
  },
  checkText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  minimumBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  minimumHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  minimumLabel: {
    fontSize: 12,
    fontWeight: "900",
  },
  minimumText: {
    fontSize: 13,
    lineHeight: 19,
  },
  coachBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  coachEmoji: {
    fontSize: 18,
  },
  coachText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "800",
  },
  smallGoalCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  goalName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  missedPill: {
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  smallTask: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickCheck: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  completedLink: {
    textAlign: "center",
    fontSize: 13,
    paddingVertical: spacing.md,
    fontWeight: "700",
  },
  feedbackBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: spacing.md,
  },
  feedbackCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  feedbackKicker: {
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  feedbackTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
  },
  feedbackClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  feedbackChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  feedbackChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackChipText: {
    fontSize: 13,
    fontWeight: "900",
  },
  feedbackInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
});
