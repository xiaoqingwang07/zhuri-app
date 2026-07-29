import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BadgeModal } from "@/components/BadgeModal";
import { Confetti } from "@/components/Confetti";
import { SunDial } from "@/components/SunDial";
import { Button, Card, PressableScale, ProgressBar } from "@/components/ui";
import { goalPhase, sunStateFor } from "@/lib/sunState";
import { assessPace, shouldOfferChallenge } from "@/lib/paceSignal";
import { deleteProofPhoto, pickProofPhoto } from "@/lib/proofPhoto";
import { fallbackCoachMessage, generateCoachMessage } from "@/lib/ai";
import { kvGet, kvSet } from "@/lib/db";
import { rescheduleReminders } from "@/lib/notifications";
import { isProCached, maxGoals } from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { formatChineseDate, todayStr } from "@/lib/dates";
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

export default function TodayScreen() {
  const { colors, gradients, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { activeGoals, goals, checkIn, persona, adjustPlan, updateGoal } = useGoals();
  const [showConfetti, setShowConfetti] = useState(false);
  const [unlockedBadge, setUnlockedBadge] = useState<Badge | null>(null);
  const [, setCoachVersion] = useState(0);
  // 每次渲染都读最新值：完成引导后返回时立即生效，避免 stale state 把用户弹回引导页
  const needsOnboarding = kvGet("onboarding_done") !== "1";
  const [feedbackGoal, setFeedbackGoal] = useState<Goal | null>(null);
  const [feedbackMinutes, setFeedbackMinutes] = useState(30);
  const [feedbackDifficulty, setFeedbackDifficulty] =
    useState<CheckInFeedback["difficulty"]>("just_right");
  const [feedbackBlocker, setFeedbackBlocker] = useState("");
  const [didChallenge, setDidChallenge] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
    setDidChallenge(false);
    setProofUri(null);
    setMoreOpen(false);
  }, []);

  const addProofPhoto = useCallback(
    (goal: Goal) => {
      const idx = todayTaskIndex(goal);
      const day = idx !== -1 ? goal.tasks[idx].day : goal.currentDay;
      const run = async (source: "camera" | "library") => {
        setPickingPhoto(true);
        try {
          const uri = await pickProofPhoto(source, goal.id, day);
          if (uri) {
            // 换照片时清掉上一张，避免沙盒里留下孤儿文件
            if (proofUri) deleteProofPhoto(proofUri);
            setProofUri(uri);
            Haptics.selectionAsync().catch(() => {});
          }
        } catch {
          Alert.alert("加照片失败", "换一张试试，或者直接完成打卡也可以。");
        } finally {
          setPickingPhoto(false);
        }
      };
      Alert.alert("给今天留个记录", "照片只存在这台手机上，不会上传。", [
        { text: "取消", style: "cancel" },
        { text: "拍一张", onPress: () => run("camera") },
        { text: "从相册选", onPress: () => run("library") },
      ]);
    },
    [proofUri]
  );

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
        challengeCompleted: didChallenge || undefined,
        proofUri: proofUri || undefined,
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
            result.aheadDays > 0 ? `提前 ${result.aheadDays} 天达成` : "目标达成",
            result.aheadDays > 0
              ? `你把「${goal.name}」比原计划提前 ${result.aheadDays} 天做完了。去领一张成就证书吧。`
              : `你完成了「${goal.name}」。去目标详情页领一张成就证书吧。`,
            [
              { text: "稍后", style: "cancel" },
              { text: "查看证书", onPress: () => router.push(`/goal/${goal.id}`) },
            ]
          );
        }, 1200);
      }
    },
    [checkIn, didChallenge, feedbackBlocker, feedbackDifficulty, feedbackMinutes, proofUri, router]
  );

  // 强度校准：只提议，由用户点头才执行 —— 加码是提高难度，不能自动做主
  const handleCalibrate = useCallback(
    (goal: Goal, signal: "too_easy" | "too_hard") => {
      const mode = signal === "too_easy" ? "upgrade" : "lighten";
      const verb = signal === "too_easy" ? "加码" : "调轻";
      Alert.alert(
        `让陪练${verb}?`,
        signal === "too_easy"
          ? "会保持天数不变，把剩下的内容加深、提高标准。已完成的进度不受影响。"
          : "会保持天数和目标不变，把剩下的难点拆得更碎、降低单日强度。",
        [
          {
            text: "先不用",
            style: "cancel",
            onPress: () => updateGoal({ ...goal, upgradeDismissedAt: today }),
          },
          {
            text: `确定${verb}`,
            onPress: async () => {
              setCalibrating(true);
              try {
                const message = await adjustPlan(goal.id, mode);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("计划已校准", message);
              } catch {
                Alert.alert("校准失败", "陪练暂时不可用，请稍后再试。");
              } finally {
                setCalibrating(false);
              }
            },
          },
        ]
      );
    },
    [adjustPlan, today, updateGoal]
  );

  const handleAddGoal = useCallback(() => {
    const limit = maxGoals(isProCached());
    if (activeGoals.length >= limit) {
      Alert.alert(
        "先把手上的做完",
        isProCached()
          ? `最多同时进行 ${limit} 个目标，先完成一个再来吧。`
          : `同时推进 ${limit} 个以上的目标，通常是全线崩盘的开始，所以免费版就到这里。真的需要更多可以看看 Plus。`,
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
  const tomorrowTask =
    doneToday && primaryTodayIdx !== -1 ? primaryGoal?.tasks[primaryTodayIdx + 1] : null;
  const sun = sunStateFor(primaryGoal ? goalPhase(primaryGoal) : "dawn", isDark);
  const pace = primaryGoal ? assessPace(primaryGoal) : null;
  const feedbackPlannedMinutes = feedbackGoal
    ? (() => {
        const idx = todayTaskIndex(feedbackGoal);
        const task = idx !== -1 ? feedbackGoal.tasks[idx] : null;
        return task?.durationMinutes || feedbackGoal.profile?.dailyMinutes || 30;
      })()
    : 30;
  const feedbackChallenge = feedbackGoal
    ? (() => {
        const idx = todayTaskIndex(feedbackGoal);
        const task = idx !== -1 ? feedbackGoal.tasks[idx] : null;
        const challenge = task?.challengeTask?.trim();
        // 挑战版和主任务相同时没有意义（AI 兜底会把两者填成一样）
        return challenge && challenge !== task?.task?.trim() ? challenge : null;
      })()
    : null;
  const offerChallenge =
    !!feedbackChallenge &&
    shouldOfferChallenge(feedbackPlannedMinutes, feedbackMinutes, feedbackDifficulty);
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
          // 给右下角悬浮按钮让出空间，否则会压住最后一张卡片
          paddingBottom: spacing.xl + 56,
          gap: spacing.md,
        }}
      >

        {activeGoals.length === 0 && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.emptyCard}>
              <LinearGradient
                colors={gradients.sunrise}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
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
              <LinearGradient
                colors={
                  sun.phase === "night" || sun.phase === "dusk"
                    ? [`${sun.sky[1]}55`, `${sun.sky[1]}18`, "transparent"]
                    : doneToday
                      ? gradients.sunriseDone
                      : gradients.sunrise
                }
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.55, y: 0.9 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroTop}>
                <View style={{ flex: 1 }}>
                  {/* 日期并进问候语这行，顶部就不必单独占一条 */}
                  <View style={styles.kickerRow}>
                    <View style={[styles.liveDot, { backgroundColor: doneToday ? colors.success : colors.primary }]} />
                    <Text style={[styles.greeting, { color: colors.textSecondary }]} numberOfLines={1}>
                      {formatChineseDate(today)} · {greeting()}
                    </Text>
                  </View>
                  <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={2}>
                    {doneToday ? sun.title : primaryGoal.name}
                  </Text>
                  {doneToday ? (
                    <View style={styles.doneMetaRow}>
                      <Animated.View
                        entering={ZoomIn.springify().damping(12).delay(200)}
                        style={[styles.streakChip, { backgroundColor: colors.successSoft }]}
                      >
                        <Text style={[styles.streakChipText, { color: colors.success }]}>
                          🔥 连续 {primaryGoal.streak} 天
                        </Text>
                      </Animated.View>
                      <Text style={[styles.heroSubline, { color: colors.textTertiary }]}>
                        完成感已入账
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.heroSubline, { color: colors.textTertiary }]}>
                      {sun.phase === "night" || sun.phase === "dusk"
                        ? sun.line
                        : `先做 ${primaryTask.minimumTask ? "最低版" : "10 分钟"}，把节奏保住。`}
                    </Text>
                  )}
                </View>
                <SunDial state={sun} progress={primaryRate} />
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

                {!doneToday && (primaryTask.focus || primaryTask.successCheck) && (
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

                {doneToday && tomorrowTask && (
                  <View style={[styles.tomorrowRow, { borderTopColor: colors.border }]}>
                    <Text
                      style={[
                        styles.tomorrowLabel,
                        { color: colors.primary, backgroundColor: colors.primarySoft },
                      ]}
                    >
                      明天
                    </Text>
                    <Text
                      style={[styles.tomorrowText, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {tomorrowTask.task}
                    </Text>
                  </View>
                )}
              </View>

              {pace && pace.signal !== "none" && (
                <PressableScale
                  onPress={() => handleCalibrate(primaryGoal, pace.signal as "too_easy" | "too_hard")}
                  disabled={calibrating}
                  style={[
                    styles.paceBanner,
                    {
                      backgroundColor:
                        pace.signal === "too_easy" ? colors.successSoft : colors.warningSoft,
                      opacity: calibrating ? 0.6 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.rescueIcon,
                      {
                        backgroundColor:
                          pace.signal === "too_easy" ? colors.success : colors.warning,
                      },
                    ]}
                  >
                    <Ionicons
                      name={pace.signal === "too_easy" ? "trending-up" : "trending-down"}
                      size={16}
                      color="#FFF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rescueTitle, { color: colors.text }]}>{pace.title}</Text>
                    <Text style={[styles.rescueDesc, { color: colors.textSecondary }]}>
                      {calibrating ? "陪练正在重排剩余计划…" : pace.detail}
                    </Text>
                  </View>
                  {!calibrating && (
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={pace.signal === "too_easy" ? colors.success : colors.warning}
                    />
                  )}
                </PressableScale>
              )}

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

      {/* 悬浮在右下角：拇指最容易够到的位置，也把顶部完全空出来 */}
      <PressableScale
        onPress={handleAddGoal}
        haptic="light"
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: tabBarHeight + spacing.md },
        ]}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </PressableScale>

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

            {/* 用时和难度并成一行标签 + 一行选项，打卡三秒结束 */}
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textTertiary }]}>用时</Text>
              <View style={styles.quickChips}>
                {FEEDBACK_MINUTES.map((minute) => (
                  <PressableScale
                    key={minute}
                    onPress={() => setFeedbackMinutes(minute)}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          feedbackMinutes === minute ? colors.primary : colors.background,
                        borderColor:
                          feedbackMinutes === minute ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: feedbackMinutes === minute ? "#FFF" : colors.textSecondary },
                      ]}
                    >
                      {minute}
                    </Text>
                  </PressableScale>
                ))}
                <Text style={[styles.quickUnit, { color: colors.textTertiary }]}>分钟</Text>
              </View>
            </View>

            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textTertiary }]}>难度</Text>
              <View style={styles.quickChips}>
                {FEEDBACK_DIFFICULTIES.map((item) => (
                  <PressableScale
                    key={item.id}
                    onPress={() => setFeedbackDifficulty(item.id)}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          feedbackDifficulty === item.id ? colors.primarySoft : colors.background,
                        borderColor:
                          feedbackDifficulty === item.id ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        {
                          color:
                            feedbackDifficulty === item.id
                              ? colors.primary
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {/* 照片、卡点这些都是可选的，默认收起来，别让人一打开就觉得要填一堆 */}
            {!moreOpen && (
              <PressableScale onPress={() => setMoreOpen(true)}>
                <View style={styles.moreToggle}>
                  <Ionicons
                    name={offerChallenge ? "flame-outline" : "add-circle-outline"}
                    size={15}
                    color={offerChallenge ? colors.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.moreToggleText,
                      { color: offerChallenge ? colors.primary : colors.textTertiary },
                    ]}
                  >
                    {offerChallenge ? "还有余力？看看今天的挑战版" : "加张照片 / 记一句卡点"}
                  </Text>
                </View>
              </PressableScale>
            )}

            {moreOpen && offerChallenge && (
              <Animated.View entering={FadeInDown.springify()}>
                <PressableScale
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setDidChallenge((v) => !v);
                  }}
                >
                  <View
                    style={[
                      styles.challengeBox,
                      {
                        backgroundColor: didChallenge ? colors.successSoft : colors.background,
                        borderColor: didChallenge ? colors.success : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.challengeHeader}>
                      <Ionicons
                        name={didChallenge ? "checkmark-circle" : "flame-outline"}
                        size={16}
                        color={didChallenge ? colors.success : colors.primary}
                      />
                      <Text
                        style={[
                          styles.challengeLabel,
                          { color: didChallenge ? colors.success : colors.primary },
                        ]}
                      >
                        {didChallenge ? "挑战版已完成" : "还有余力？今天的挑战版"}
                      </Text>
                    </View>
                    <Text style={[styles.challengeText, { color: colors.text }]}>
                      {feedbackChallenge}
                    </Text>
                    {!didChallenge && (
                      <Text style={[styles.challengeHint, { color: colors.textTertiary }]}>
                        做完再点这里，不做也完全没问题
                      </Text>
                    )}
                  </View>
                </PressableScale>
              </Animated.View>
            )}

            {proofUri ? (
              <View style={styles.proofWrap}>
                <Image source={{ uri: proofUri }} style={styles.proofImage} contentFit="cover" />
                <PressableScale
                  onPress={() => {
                    deleteProofPhoto(proofUri);
                    setProofUri(null);
                  }}
                  style={[styles.proofRemove, { backgroundColor: colors.overlay }]}
                >
                  <Ionicons name="close" size={16} color="#FFF" />
                </PressableScale>
              </View>
            ) : (
              moreOpen && (
                <PressableScale
                  onPress={() => feedbackGoal && addProofPhoto(feedbackGoal)}
                  disabled={pickingPhoto}
                  style={[
                    styles.proofAdd,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.proofAddText, { color: colors.textSecondary }]}>
                    {pickingPhoto ? "处理中…" : "加张照片"}
                  </Text>
                </PressableScale>
              )
            )}

            {moreOpen && (
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
            )}

            <Button
              title="完成打卡"
              onPress={() => feedbackGoal && submitFeedback(feedbackGoal)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    overflow: "hidden",
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
    fontSize: 13,
    fontWeight: "700",
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
    fontWeight: "500",
  },
  doneMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 8,
  },
  streakChip: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakChipText: {
    fontSize: 13,
    fontWeight: "900",
  },
  tomorrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: 2,
  },
  tomorrowLabel: {
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  tomorrowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
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
    fontWeight: "800",
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  rescueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  paceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  challengeBox: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.sm,
    gap: 6,
  },
  challengeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  challengeLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  challengeText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  challengeHint: {
    fontSize: 11,
  },
  proofAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  proofAddText: {
    fontSize: 13,
    fontWeight: "600",
  },
  proofWrap: {
    height: 160,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  proofImage: {
    width: "100%",
    height: "100%",
  },
  proofRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "800",
    letterSpacing: 0.5,
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
    fontWeight: "800",
  },
  focusBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  focusText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  checkText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
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
    fontWeight: "800",
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
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "500",
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
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: "700",
    width: 28,
  },
  quickChips: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 36,
    alignItems: "center",
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickUnit: {
    fontSize: 11,
  },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
  },
  moreToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  feedbackInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
});
