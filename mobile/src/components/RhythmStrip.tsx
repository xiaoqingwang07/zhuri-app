import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { DayTask } from "@/lib/types";
import { todayStr } from "@/lib/dates";
import { useTheme } from "@/theme/useTheme";

export type EnergyLevel = "light" | "steady" | "push";

export function taskEnergy(task: DayTask): EnergyLevel {
  if (task.energy === "light" || task.energy === "steady" || task.energy === "push") {
    return task.energy;
  }
  if (task.difficulty === "easy") return "light";
  if (task.difficulty === "hard") return "push";
  return "steady";
}

const BAR_HEIGHT: Record<EnergyLevel, number> = {
  light: 9,
  steady: 15,
  push: 22,
};

/**
 * 计划节奏条带：一天一根柱子，高度=强度，颜色=状态。
 * 让「前几天轻、中段稳、后段冲刺」的设计感一眼可见。
 */
export function RhythmStrip({
  tasks,
  showLegend = true,
}: {
  tasks: DayTask[];
  showLegend?: boolean;
}) {
  const { colors } = useTheme();
  const today = todayStr();

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.track}>
        {tasks.map((task, i) => {
          const energy = taskEnergy(task);
          const isMissed = !task.completed && task.date < today;
          const isToday = task.date === today;
          const barColor = task.completed
            ? colors.success
            : isMissed
              ? colors.danger
              : energy === "light"
                ? colors.primarySoft
                : energy === "steady"
                  ? `${colors.primary}99`
                  : colors.primary;
          return (
            <View key={i} style={styles.barSlot}>
              {isToday && (
                <View style={[styles.todayDot, { backgroundColor: colors.text }]} />
              )}
              <View
                style={[
                  styles.bar,
                  {
                    height: BAR_HEIGHT[energy],
                    backgroundColor: barColor,
                    opacity: isMissed ? 0.45 : 1,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      {showLegend && (
        <View style={styles.legend}>
          <LegendItem color={colors.primarySoft} label="轻" height={7} />
          <LegendItem color={`${colors.primary}99`} label="稳" height={10} />
          <LegendItem color={colors.primary} label="冲" height={13} />
          <View style={{ flex: 1 }} />
          <Text style={[styles.legendHint, { color: colors.textTertiary }]}>
            {tasks.length} 天节奏 · 先轻后稳，留了缓冲
          </Text>
        </View>
      )}
    </View>
  );
}

function LegendItem({
  color,
  label,
  height,
}: {
  color: string;
  label: string;
  height: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendBar, { backgroundColor: color, height }]} />
      <Text style={[styles.legendLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 28,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  bar: {
    alignSelf: "stretch",
    borderRadius: 2,
    minWidth: 2,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  legendBar: {
    width: 8,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  legendHint: {
    fontSize: 11,
    fontWeight: "600",
  },
});
