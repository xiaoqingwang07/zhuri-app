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
import { isProCached } from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { todayStr } from "@/lib/dates";
import { completionRate, missedDays } from "@/lib/store";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

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
  const autoAdjustPrompted = useRef(false);

  const missed = goal ? missedDays(goal) : 0;
  const today = todayStr();

  const handleAdjust = async () => {
    if (!goal) return;
    if (!isProCached()) {
      Alert.alert(
        "AI 动态调整是 Pro 功能",
        "落后了不用推倒重来，AI 帮你把剩余任务重新编排，轻装上阵。",
        [
          { text: "取消", style: "cancel" },
          { text: "了解 Pro", onPress: () => router.push("/paywall") },
        ]
      );
      return;
    }
    setAdjusting(true);
    try {
      const message = await adjustPlan(goal.id);
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
          { text: "让 AI 重排", onPress: handleAdjust },
        ]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, goal, missed]);

  const handleRevive = () => {
    if (!goal) return;
    if (goal.reviveCards <= 0) {
      Alert.alert(
        "复活卡不足",
        "复活卡可以补救错过的一天，保住连续记录。",
        [
          { text: "取消", style: "cancel" },
          { text: "获取复活卡", onPress: () => router.push("/paywall?tab=revive") },
        ]
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

        {/* 落后处理 */}
        {missed > 0 && goal.status === "active" && (
          <Card style={{ gap: spacing.sm, backgroundColor: colors.warningSoft }}>
            <Text style={[styles.missedTitle, { color: colors.text }]}>
              ⚡️ 落后 {missed} 天
            </Text>
            <Text style={[styles.missedDesc, { color: colors.textSecondary }]}>
              别灰心，两种方式帮你回到正轨：
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button
                title={`复活卡补救 (${goal.reviveCards})`}
                variant="secondary"
                onPress={handleRevive}
                style={{ flex: 1 }}
              />
              <Button
                title="AI 重排计划"
                onPress={handleAdjust}
                loading={adjusting}
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
  missedTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  missedDesc: {
    fontSize: 13,
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
