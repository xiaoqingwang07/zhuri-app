import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Certificate } from "@/components/Certificate";
import { Confetti } from "@/components/Confetti";
import { Button, Card, PressableScale, ProgressBar, SectionTitle } from "@/components/ui";
import { RescueMode } from "@/lib/ai";
import { isProCached } from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { todayStr } from "@/lib/dates";
import { completionRate, missedDays } from "@/lib/store";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const RESCUE_PLANS: {
  id: RescueMode;
  emoji: string;
  title: string;
  desc: string;
}[] = [
  {
    id: "relaxed",
    emoji: "🌿",
    title: "轻松追回",
    desc: "延长一点周期，把前几天调轻，先找回手感。",
  },
  {
    id: "steady",
    emoji: "🎯",
    title: "稳定追回",
    desc: "保持大致节奏，合并低价值任务，从今天重新接上。",
  },
  {
    id: "sprint",
    emoji: "⚡️",
    title: "冲刺追回",
    desc: "压缩一部分任务，适合截止日不能动的时候。",
  },
];

export default function GoalDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const { goals, revive, adjustPlan, removeGoal } = useGoals();
  const goal = goals.find((g) => g.id === id);

  const [adjusting, setAdjusting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const certificateRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rescueSectionY = useRef(0);
  const autoAdjustPrompted = useRef(false);

  const missed = goal ? missedDays(goal) : 0;
  const today = todayStr();

  const handleAdjust = async (mode: RescueMode = "steady") => {
    if (!goal) return;
    setAdjusting(true);
    try {
      const message = await adjustPlan(goal.id, mode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("✨ 计划已重排", message);
    } catch {
      Alert.alert("调整失败", "AI 暂时不可用，请稍后再试。");
    } finally {
      setAdjusting(false);
    }
  };

  // 从今日页「落后横幅」跳转过来时自动弹出调整确认
  useEffect(() => {
    if (action === "adjust" && goal && missed > 0 && !autoAdjustPrompted.current) {
      autoAdjustPrompted.current = true;
      Alert.alert(
        `落后 ${missed} 天`,
        "让 AI 把剩余任务重新编排到从今天开始的日程里？已完成的进度会保留。",
        [
          { text: "先不用", style: "cancel" },
          {
            text: "看救援方案",
            onPress: () => {
              scrollRef.current?.scrollTo({
                y: Math.max(0, rescueSectionY.current - 24),
                animated: true,
              });
            },
          },
        ]
      );
    }
  }, [action, goal, missed]);

  const handleRevive = () => {
    if (!goal) return;
    if (goal.reviveCards <= 0) {
      Alert.alert(
        "复活卡不足",
        "先用 AI 救援重排剩余计划，把节奏接回来。连续完成一段时间后会获得新的复活卡。"
      );
      return;
    }
    Alert.alert("使用复活卡", "将补救最早错过的一天，保住你的连续记录。", [
      { text: "取消", style: "cancel" },
      {
        text: "使用",
        onPress: () => {
          const updated = revive(goal.id);
          if (updated) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowConfetti(true);
          }
        },
      },
    ]);
  };

  const handleShareCertificate = useCallback(async () => {
    if (!certificateRef.current) return;
    try {
      const uri = await captureRef(certificateRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      }
    } catch {
      Alert.alert("分享失败", "请稍后再试。");
    }
  }, []);

  const handleDelete = useCallback(() => {
    if (!goal) return;
    Alert.alert("删除目标", `确定删除「${goal.name}」吗？所有打卡记录将一并删除。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          removeGoal(goal.id);
          router.back();
        },
      },
    ]);
  }, [goal, removeGoal, router]);

  if (!goal) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>目标不存在</Text>
      </View>
    );
  }

  const rate = completionRate(goal);
  const unlockedBadges = goal.badges.filter((b) => b.unlockedAt);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: 60,
          gap: spacing.md,
        }}
      >
        {/* 顶部栏 */}
        <View style={styles.topBar}>
          <PressableScale
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: colors.card }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </PressableScale>
          <PressableScale
            onPress={handleDelete}
            style={[styles.iconButton, { backgroundColor: colors.card }]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </PressableScale>
        </View>

        {/* 概览 */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
          <ProgressBar progress={rate} height={10} />
          <View style={styles.statsRow}>
            <Stat label="完成率" value={`${Math.round(rate * 100)}%`} />
            <Stat label="连续" value={`${goal.streak}天`} />
            <Stat label="最长连续" value={`${goal.longestStreak}天`} />
            <Stat label="复活卡" value={`${goal.reviveCards}张`} />
          </View>
        </Card>

        {goal.analysis && (
          <Card style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.analysisKicker, { color: colors.primary }]}>陪练诊断</Text>
                <Text style={[styles.analysisTitle, { color: colors.text }]}>
                  {goal.analysis.domain} · {goal.analysis.subject}
                </Text>
              </View>
              <Ionicons name="sparkles" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.analysisBody, { color: colors.textSecondary }]}>
              {goal.analysis.expertiseAngle}
            </Text>
            <View style={[styles.strategyBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.strategyLabel, { color: colors.textTertiary }]}>策略</Text>
              <Text style={[styles.strategyText, { color: colors.text }]}>
                {goal.analysis.coachStrategy}
              </Text>
            </View>
          </Card>
        )}

        {/* 已完成目标 → 证书 */}
        {goal.status === "completed" && (
          <Card style={{ alignItems: "center", gap: spacing.md }}>
            <Certificate ref={certificateRef} goal={goal} watermark={!isProCached()} />
            <Button
              title="分享成就证书"
              onPress={handleShareCertificate}
              style={{ alignSelf: "stretch" }}
            />
          </Card>
        )}

        {/* 落后救援 */}
        {missed > 0 && goal.status === "active" && (
          <Card
            style={{ gap: spacing.md, backgroundColor: colors.warningSoft }}
            onLayout={(e) => {
              rescueSectionY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.missedTitle, { color: colors.text }]}>
              你只是掉队了 {missed} 天，还能接回来
            </Text>
            <Text style={[styles.missedDesc, { color: colors.textSecondary }]}>
              别急着重开目标。选一个救援节奏，AI 会保留已完成进度，把剩余任务重新排到从今天开始。
            </Text>

            <View style={{ gap: spacing.sm }}>
              {RESCUE_PLANS.map((plan) => (
                <PressableScale
                  key={plan.id}
                  disabled={adjusting}
                  onPress={() => handleAdjust(plan.id)}
                  style={[
                    styles.rescuePlan,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: adjusting ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 24 }}>{plan.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rescuePlanTitle, { color: colors.text }]}>
                      {plan.title}
                    </Text>
                    <Text style={[styles.rescuePlanDesc, { color: colors.textSecondary }]}>
                      {plan.desc}
                    </Text>
                  </View>
                  {adjusting ? (
                    <Text style={[styles.rescuePlanAction, { color: colors.textTertiary }]}>
                      生成中
                    </Text>
                  ) : (
                    <Ionicons name="arrow-forward-circle" size={24} color={colors.warning} />
                  )}
                </PressableScale>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title={`用复活卡补一天 (${goal.reviveCards})`}
                variant="secondary"
                onPress={handleRevive}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        )}

        {/* 徽章 */}
        <View>
          <SectionTitle>徽章 {unlockedBadges.length}/{goal.badges.length}</SectionTitle>
          <Card>
            <View style={styles.badgeGrid}>
              {goal.badges.map((b) => (
                <View key={b.id} style={styles.badgeItem}>
                  <Text style={[styles.badgeEmoji, { opacity: b.unlockedAt ? 1 : 0.25 }]}>
                    {b.emoji}
                  </Text>
                  <Text
                    style={[
                      styles.badgeName,
                      { color: b.unlockedAt ? colors.text : colors.textTertiary },
                    ]}
                  >
                    {b.name}
                  </Text>
                  <Text style={[styles.badgeDays, { color: colors.textTertiary }]}>
                    {b.daysRequired}天
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* 全部任务 */}
        <View>
          <SectionTitle>全部任务</SectionTitle>
          <Card style={{ gap: 2, paddingVertical: spacing.sm }}>
            {goal.tasks.map((task, i) => {
              const isToday = task.date === today;
              const isMissed = !task.completed && task.date < today;
              return (
                <View
                  key={i}
                  style={[
                    styles.taskRow,
                    isToday && {
                      backgroundColor: colors.primarySoft,
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.taskStatus,
                      {
                        backgroundColor: task.completed
                          ? colors.success
                          : isMissed
                            ? colors.dangerSoft
                            : colors.border,
                      },
                    ]}
                  >
                    {task.completed ? (
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    ) : isMissed ? (
                      <Ionicons name="close" size={12} color={colors.danger} />
                    ) : null}
                  </View>
                  <Text style={[styles.taskDay, { color: colors.textTertiary }]}>
                    D{task.day}
                  </Text>
                  <Text
                    style={[
                      styles.taskText,
                      {
                        color: task.completed ? colors.textTertiary : colors.text,
                        textDecorationLine: task.completed ? "line-through" : "none",
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {task.task}
                    {task.revived ? " ❤️‍🩹" : ""}
                  </Text>
                </View>
              );
            })}
          </Card>
        </View>
      </ScrollView>

      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  goalName: {
    fontSize: 22,
    fontWeight: "800",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
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
    fontSize: 17,
    lineHeight: 23,
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
  missedTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  missedDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  rescuePlan: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rescuePlanTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  rescuePlanDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  rescuePlanAction: {
    fontSize: 12,
    fontWeight: "800",
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  badgeItem: {
    width: "33.3%",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: 2,
  },
  badgeEmoji: {
    fontSize: 32,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeDays: {
    fontSize: 10,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  taskStatus: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  taskDay: {
    fontSize: 11,
    fontWeight: "700",
    width: 30,
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
});
