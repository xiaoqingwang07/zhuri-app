import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
import { completionRate, missedDays, todayTaskIndex } from "@/lib/store";
import { Badge, Goal, PERSONAS } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

export default function TodayScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGoals, goals, checkIn, persona } = useGoals();
  const [showConfetti, setShowConfetti] = useState(false);
  const [unlockedBadge, setUnlockedBadge] = useState<Badge | null>(null);
  // AI 文案写入 kv 缓存后 bump 一下，触发重渲染读取新文案
  const [, setCoachVersion] = useState(0);
  const [needsOnboarding] = useState(() => kvGet("onboarding_done") !== "1");

  const today = todayStr();

  /** 渲染期直接读缓存（SQLite 同步读，成本极低），无缓存则用人格兜底文案 */
  const coachMessageFor = (goalId: string, goalName: string): string => {
    return (
      kvGet(`coach_${goalId}_${today}_${persona}`) ||
      fallbackCoachMessage(persona, goalName)
    );
  };

  // App 打开或数据变化（如打卡）时刷新未来 7 天的提醒窗口
  useEffect(() => {
    rescheduleReminders(persona, goals).catch(() => {});
  }, [goals, persona]);

  // 每目标每天生成一条 AI 督促文案（缓存到 kv，避免重复调用）
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

  const handleCheckIn = useCallback(
    (goal: Goal) => {
      const idx = todayTaskIndex(goal);
      if (idx === -1) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const result = checkIn(goal.id, idx);
      if (!result) return;
      setShowConfetti(true);
      if (result.newBadges.length > 0) {
        setTimeout(() => setUnlockedBadge(result.newBadges[0]), 600);
      }
      if (result.justCompleted) {
        setTimeout(() => {
          Alert.alert(
            "🎉 目标达成！",
            `恭喜完成「${goal.name}」！去目标详情页领取你的成就证书吧。`,
            [
              { text: "稍后", style: "cancel" },
              { text: "查看证书", onPress: () => router.push(`/goal/${goal.id}`) },
            ]
          );
        }, 1200);
      }
    },
    [checkIn, router]
  );

  const handleAddGoal = useCallback(() => {
    const limit = maxGoals(isProCached());
    if (activeGoals.length >= limit) {
      if (isProCached()) {
        Alert.alert("目标数量已达上限", `最多同时进行 ${limit} 个目标，先完成一个再来吧。`);
      } else {
        router.push("/paywall");
      }
      return;
    }
    router.push("/create");
  }, [activeGoals.length, router]);

  const personaInfo = PERSONAS.find((p) => p.id === persona)!;

  // 声明式跳转：比 useEffect 里 router.push 更安全，不会触发"根导航器未挂载"报错
  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

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
        {/* 头部 */}
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

        {/* 空状态 */}
        {activeGoals.length === 0 && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {goals.length > 0 ? "所有目标都完成了！" : "说出你的目标"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                一句话描述目标，AI 教练帮你拆成每天可执行的小任务，然后每天督促你完成
              </Text>
              <Button
                title="创建第一个目标"
                onPress={handleAddGoal}
                style={{ alignSelf: "stretch", marginTop: spacing.sm }}
              />
            </Card>
          </Animated.View>
        )}

        {/* 目标卡片 */}
        {activeGoals.map((goal, index) => {
          const idx = todayTaskIndex(goal);
          const task = idx !== -1 ? goal.tasks[idx] : null;
          const missed = missedDays(goal);
          const rate = completionRate(goal);
          const doneToday = task?.completed ?? true;

          return (
            <Animated.View
              key={goal.id}
              entering={FadeInDown.delay(index * 80).springify()}
            >
              <PressableScale onPress={() => router.push(`/goal/${goal.id}`)}>
                <Card style={{ gap: spacing.sm }}>
                  <View style={styles.goalHeader}>
                    <Text
                      style={[styles.goalName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {goal.name}
                    </Text>
                    {goal.streak > 0 && (
                      <View style={[styles.streakPill, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.streakText, { color: colors.primary }]}>
                          🔥 {goal.streak}天
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ gap: 6 }}>
                    <ProgressBar progress={rate} />
                    <Text style={[styles.progressLabel, { color: colors.textTertiary }]}>
                      第 {goal.currentDay} / {goal.totalDays} 天 · 完成 {Math.round(rate * 100)}%
                    </Text>
                  </View>

                  {/* 落后警告 → AI 调整入口 */}
                  {missed > 0 && (
                    <PressableScale
                      onPress={() => router.push(`/goal/${goal.id}?action=adjust`)}
                      style={[styles.missedBanner, { backgroundColor: colors.warningSoft }]}
                    >
                      <Text style={{ fontSize: 16 }}>⚡️</Text>
                      <Text style={[styles.missedText, { color: colors.warning }]}>
                        落后 {missed} 天了 · 让 AI 帮你重排剩余计划
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.warning} />
                    </PressableScale>
                  )}

                  {/* 今日任务 */}
                  {task && (
                    <View
                      style={[
                        styles.taskBox,
                        {
                          backgroundColor: doneToday
                            ? colors.successSoft
                            : colors.background,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.taskLabel, { color: colors.textTertiary }]}>
                          今日任务 {task.pages ? `· ${task.pages}` : ""}
                        </Text>
                        <Text
                          style={[
                            styles.taskText,
                            {
                              color: doneToday ? colors.textSecondary : colors.text,
                              textDecorationLine: doneToday ? "line-through" : "none",
                            },
                          ]}
                        >
                          {task.task}
                        </Text>
                      </View>
                      {doneToday ? (
                        <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
                          <Ionicons name="checkmark" size={26} color="#FFF" />
                        </View>
                      ) : (
                        <PressableScale
                          onPress={() => handleCheckIn(goal)}
                          style={[styles.checkCircle, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="checkmark" size={26} color="#FFF" />
                        </PressableScale>
                      )}
                    </View>
                  )}

                  {/* AI 督促文案 */}
                  {!doneToday && (
                    <View style={[styles.coachBox, { backgroundColor: colors.primarySoft }]}>
                      <Text style={{ fontSize: 14 }}>{personaInfo.emoji}</Text>
                      <Text style={[styles.coachText, { color: colors.text }]}>
                        {coachMessageFor(goal.id, goal.name)}
                      </Text>
                    </View>
                  )}
                </Card>
              </PressableScale>
            </Animated.View>
          );
        })}

        {/* 已完成目标入口 */}
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
    fontWeight: "500",
    marginBottom: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: spacing.md,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  goalName: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  streakPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressLabel: {
    fontSize: 12,
  },
  missedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
  },
  missedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  taskBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  taskLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  taskText: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  coachBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    alignItems: "flex-start",
  },
  coachText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  completedLink: {
    textAlign: "center",
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
});
