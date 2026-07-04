import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Chip, SectionTitle } from "@/components/ui";
import { generateWeeklyReview, WeeklyReview } from "@/lib/ai";
import { kvGet, kvSet } from "@/lib/db";
import { isProCached } from "@/lib/entitlements";
import { useGoals } from "@/lib/GoalsContext";
import { addDays, diffDays, parseDate, toDateStr, todayStr } from "@/lib/dates";
import { spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { goals } = useGoals();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const today = todayStr();
  const goal = goals.find((g) => g.id === selectedId) || goals[0];

  const taskByDate = useMemo(() => {
    const map = new Map<string, { completed: boolean }>();
    if (goal) {
      for (const t of goal.tasks) {
        map.set(t.date, { completed: t.completed });
      }
    }
    return map;
  }, [goal]);

  // 领先/落后：应完成天数 vs 实际完成天数
  const pace = useMemo(() => {
    if (!goal) return 0;
    const elapsed = Math.min(
      goal.totalDays,
      Math.max(0, diffDays(goal.startDate, today) + 1)
    );
    const done = goal.tasks.filter((t) => t.completed).length;
    return done - elapsed;
  }, [goal, today]);

  // 近 7 天完成情况（跨所有目标）
  const last7 = useMemo(() => {
    const days: { date: string; done: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      let done = 0;
      let total = 0;
      for (const g of goals) {
        const t = g.tasks.find((task) => task.date === d);
        if (t) {
          total++;
          if (t.completed) done++;
        }
      }
      days.push({ date: d, done, total });
    }
    return days;
  }, [goals, today]);

  // 当前月份网格
  const monthGrid = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // 周一为第一列
    const leadingBlanks = (firstDay.getDay() + 6) % 7;
    const cells: (string | null)[] = Array(leadingBlanks).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(toDateStr(new Date(year, month, d)));
    }
    return { cells, monthLabel: `${year}年${month + 1}月` };
  }, []);

  const handleReview = async () => {
    if (!isProCached()) {
      Alert.alert(
        "每周 AI 复盘是 Pro 功能",
        "AI 会分析你本周的执行情况，给出亮点总结和下周建议。",
        [
          { text: "取消", style: "cancel" },
          { text: "了解 Pro", onPress: () => router.push("/paywall") },
        ]
      );
      return;
    }
    if (goals.length === 0) {
      Alert.alert("还没有目标", "先创建一个目标再来复盘吧。");
      return;
    }
    // 缓存：每周只生成一次
    const weekKey = `review_${today.slice(0, 8)}w${Math.ceil(parseDate(today).getDate() / 7)}`;
    const cached = kvGet(weekKey);
    if (cached) {
      setReview(JSON.parse(cached));
      return;
    }
    setReviewing(true);
    try {
      const result = await generateWeeklyReview(goals);
      kvSet(weekKey, JSON.stringify(result));
      setReview(result);
    } catch {
      Alert.alert("复盘失败", "AI 暂时不可用，请稍后再试。");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingHorizontal: spacing.md,
        paddingBottom: 120,
        gap: spacing.md,
      }}
    >
      <Text style={[styles.title, { color: colors.text }]}>日历</Text>

      {goals.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
          <Text style={{ fontSize: 44 }}>📅</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            创建目标后，这里会显示你的打卡日历和统计
          </Text>
        </Card>
      ) : (
        <>
          {/* 目标切换 */}
          {goals.length > 1 && (
            <View style={styles.chipRow}>
              {goals.map((g) => (
                <Chip
                  key={g.id}
                  label={g.name.slice(0, 8)}
                  active={goal?.id === g.id}
                  onPress={() => setSelectedId(g.id)}
                />
              ))}
            </View>
          )}

          {/* 领先/落后 */}
          {goal && goal.status === "active" && (
            <Card
              style={{
                backgroundColor: pace >= 0 ? colors.successSoft : colors.warningSoft,
                gap: 4,
              }}
            >
              <Text style={[styles.paceTitle, { color: colors.text }]}>
                {pace > 0
                  ? `🚀 领先计划 ${pace} 天`
                  : pace === 0
                    ? "✅ 进度与计划同步"
                    : `⏰ 落后计划 ${-pace} 天`}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {pace >= 0
                  ? "保持这个节奏，胜利在望！"
                  : "可以去目标页让 AI 帮你重排剩余计划。"}
              </Text>
            </Card>
          )}

          {/* 月历 */}
          {goal && (
            <View>
              <SectionTitle>{monthGrid.monthLabel}</SectionTitle>
              <Card>
                <View style={styles.weekHeader}>
                  {WEEKDAY_LABELS.map((w) => (
                    <Text
                      key={w}
                      style={[styles.weekLabel, { color: colors.textTertiary }]}
                    >
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {monthGrid.cells.map((date, i) => {
                    if (!date) return <View key={`b${i}`} style={styles.cell} />;
                    const info = taskByDate.get(date);
                    const isToday = date === today;
                    const isMissed = info && !info.completed && date < today;
                    return (
                      <View key={date} style={styles.cell}>
                        <View
                          style={[
                            styles.dayCircle,
                            info?.completed && { backgroundColor: colors.primary },
                            isMissed && { backgroundColor: colors.dangerSoft },
                            isToday &&
                              !info?.completed && {
                                borderWidth: 2,
                                borderColor: colors.primary,
                              },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isToday ? "800" : "500",
                              color: info?.completed
                                ? "#FFF"
                                : isMissed
                                  ? colors.danger
                                  : colors.text,
                            }}
                          >
                            {parseDate(date).getDate()}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          )}

          {/* 近 7 天 */}
          <View>
            <SectionTitle>近 7 天</SectionTitle>
            <Card style={styles.chartRow}>
              {last7.map((d) => {
                const ratio = d.total > 0 ? d.done / d.total : 0;
                return (
                  <View key={d.date} style={styles.chartCol}>
                    <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(ratio * 100, d.total > 0 ? 4 : 0)}%`,
                            backgroundColor:
                              ratio >= 1 ? colors.primary : colors.warning,
                          },
                        ]}
                      />
                    </View>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                      {parseDate(d.date).getDate()}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </View>

          {/* 每周 AI 复盘 */}
          <View>
            <SectionTitle>每周 AI 复盘</SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              {review ? (
                <>
                  <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>
                    {review.summary}
                  </Text>
                  {review.highlights.length > 0 && (
                    <View style={{ gap: 4 }}>
                      <Text style={[styles.reviewSub, { color: colors.success }]}>本周亮点</Text>
                      {review.highlights.map((h, i) => (
                        <Text key={i} style={[styles.reviewItem, { color: colors.textSecondary }]}>
                          · {h}
                        </Text>
                      ))}
                    </View>
                  )}
                  {review.suggestions.length > 0 && (
                    <View style={{ gap: 4 }}>
                      <Text style={[styles.reviewSub, { color: colors.primary }]}>下周建议</Text>
                      {review.suggestions.map((s, i) => (
                        <Text key={i} style={[styles.reviewItem, { color: colors.textSecondary }]}>
                          · {s}
                        </Text>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textSecondary }}>
                    AI 分析你本周的执行数据，总结亮点、找出问题，并给出下周的具体建议。
                  </Text>
                  <Button
                    title={isProCached() ? "生成本周复盘 📊" : "生成本周复盘（Pro）"}
                    onPress={handleReview}
                    loading={reviewing}
                    variant="secondary"
                  />
                </>
              )}
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: "800",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  paceTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  weekHeader: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chartRow: {
    flexDirection: "row",
    height: 120,
    alignItems: "flex-end",
    paddingVertical: spacing.md,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    height: "100%",
  },
  barTrack: {
    flex: 1,
    width: 16,
    borderRadius: 8,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 8,
  },
  reviewSub: {
    fontSize: 13,
    fontWeight: "700",
  },
  reviewItem: {
    fontSize: 13,
    lineHeight: 19,
  },
});
