import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GoalAnalysis } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

/**
 * 高风险目标的免责说明。
 *
 * 逐日能保证计划的结构符合专业规律，但不能保证内容的事实正确性 ——
 * 触及医疗、极端身体改变、金钱、法律时，用户必须知道这一点。
 * 所以这张卡不做可折叠、不做小字，就是要被看见。
 */
export function DisclaimerCard({ analysis }: { analysis?: GoalAnalysis }) {
  const { colors } = useTheme();
  if (!analysis?.disclaimer || analysis.riskLevel === "none") return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.warningSoft, borderColor: colors.warning },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={17} color={colors.warning} />
        <Text style={[styles.title, { color: colors.text }]}>请先看这个</Text>
      </View>
      <Text style={[styles.body, { color: colors.text }]}>{analysis.disclaimer}</Text>
      {!!analysis.riskNote && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>{analysis.riskNote}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: 7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "900",
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
