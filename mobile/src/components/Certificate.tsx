import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BRAND } from "@/theme/colors";
import { Goal } from "@/lib/types";
import { formatChineseDate } from "@/lib/dates";

/**
 * 成就证书（用 react-native-view-shot 截图分享）。
 * 固定浅色设计，保证分享出去的图片效果一致。
 */
export const Certificate = forwardRef<View, { goal: Goal; watermark?: boolean }>(
  function Certificate({ goal, watermark = true }, ref) {
    const completedDate = goal.completedAt
      ? formatChineseDate(goal.completedAt.split("T")[0])
      : "";
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <View style={styles.inner}>
          <Text style={styles.medal}>🏆</Text>
          <Text style={styles.heading}>成就证书</Text>
          <View style={styles.divider} />
          <Text style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.desc}>
            历时 {goal.totalDays} 天 · 最长连续 {goal.longestStreak} 天
          </Text>
          <Text style={styles.desc}>于 {completedDate} 达成</Text>
          <View style={styles.badgeRow}>
            {goal.badges
              .filter((b) => b.unlockedAt)
              .map((b) => (
                <Text key={b.id} style={styles.badgeEmoji}>
                  {b.emoji}
                </Text>
              ))}
          </View>
          {watermark && <Text style={styles.watermark}>逐日 · AI 教练陪你达成目标</Text>}
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: BRAND,
    borderRadius: 24,
    padding: 10,
  },
  inner: {
    backgroundColor: "#FFFDF9",
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  medal: {
    fontSize: 56,
  },
  heading: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 6,
    color: "#B58F5F",
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: BRAND,
    borderRadius: 1,
    marginVertical: 6,
  },
  goalName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1A1A1E",
    textAlign: "center",
  },
  desc: {
    fontSize: 13,
    color: "#6B6B72",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  watermark: {
    marginTop: 16,
    fontSize: 11,
    color: "#B8B8BE",
  },
});
