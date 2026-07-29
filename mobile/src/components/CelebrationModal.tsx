import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Confetti } from "@/components/Confetti";
import { RhythmStrip } from "@/components/RhythmStrip";
import { SunDial } from "@/components/SunDial";
import { Button, PressableScale } from "@/components/ui";
import { sunStateFor } from "@/lib/sunState";
import { Goal } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

/**
 * 目标达成的庆祝序列。
 *
 * 这是整个产品情绪最高的一刻 —— 用户真的坚持了几十天。
 * 之前它只是一个 Alert 弹窗，配不上这件事，也浪费了最可能被自发分享的时机。
 *
 * 分幕推进：太阳升到正午 → 数字入账 → 走过的节奏 → 足迹照片 → 领证书。
 * 每一幕都在说同一件事：这是你自己走完的。
 */
export function CelebrationModal({
  goal,
  visible,
  onClose,
  onViewCertificate,
}: {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onViewCertificate: () => void;
}) {
  const { colors, gradients, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [act, setAct] = useState(0);

  useEffect(() => {
    if (!visible) {
      setAct(0);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const timers = [900, 1900, 2900].map((ms, i) =>
      setTimeout(() => {
        setAct(i + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!goal) return null;

  const noon = sunStateFor("noon", isDark);
  const photos = goal.tasks
    .filter((t) => t.proofUri && t.completed)
    .map((t) => t.proofUri as string)
    .slice(-5);
  const totalMinutes = goal.tasks.reduce(
    (sum, t) => sum + (t.actualMinutes || t.durationMinutes || 0),
    0
  );
  const hours = Math.max(1, Math.round(totalMinutes / 60));
  const ahead = goal.completedAheadDays || 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LinearGradient
          colors={gradients.sunriseDone}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.6, y: 0.85 }}
          style={StyleSheet.absoluteFill}
        />
        <Confetti />

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + spacing.xl,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            alignItems: "center",
            gap: spacing.lg,
          }}
        >
          {/* 第一幕：太阳升到正午 */}
          <Animated.View entering={ZoomIn.springify().damping(13)}>
            <SunDial state={noon} progress={1} size={132} />
          </Animated.View>

          <Animated.View entering={FadeIn.delay(300)} style={{ alignItems: "center", gap: 6 }}>
            <Text style={[styles.kicker, { color: colors.primary }]}>
              {ahead > 0 ? `提前 ${ahead} 天达成` : "目标达成"}
            </Text>
            <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
          </Animated.View>

          {/* 第二幕：数字入账 */}
          {act >= 1 && (
            <Animated.View entering={FadeInDown.springify()} style={styles.statsRow}>
              <Stat value={`${goal.totalDays}`} label="天" />
              <Stat value={`${goal.longestStreak}`} label="最长连续" />
              <Stat value={`${hours}`} label="小时投入" />
            </Animated.View>
          )}

          {/* 第三幕：走过的节奏 */}
          {act >= 2 && (
            <Animated.View
              entering={FadeInDown.springify()}
              style={[styles.block, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.blockLabel, { color: colors.textTertiary }]}>
                你走过的节奏
              </Text>
              <RhythmStrip tasks={goal.tasks} showLegend={false} />
            </Animated.View>
          )}

          {/* 第四幕：足迹 */}
          {act >= 3 && photos.length > 0 && (
            <Animated.View
              entering={FadeInDown.springify()}
              style={[styles.block, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.blockLabel, { color: colors.textTertiary }]}>
                这些是你留下的记录
              </Text>
              <View style={styles.photoRow}>
                {photos.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.photo} resizeMode="cover" />
                ))}
              </View>
            </Animated.View>
          )}

          <View style={{ flex: 1 }} />

          {act >= 3 && (
            <Animated.View entering={FadeInDown.springify()} style={styles.actions}>
              <Button
                title="领取成就证书"
                onPress={onViewCertificate}
                style={{ alignSelf: "stretch" }}
              />
              <PressableScale onPress={onClose}>
                <Text style={[styles.later, { color: colors.textTertiary }]}>稍后再看</Text>
              </PressableScale>
            </Animated.View>
          )}
        </ScrollView>

        <PressableScale
          onPress={onClose}
          style={[styles.close, { top: insets.top + spacing.sm, backgroundColor: colors.card }]}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </PressableScale>
      </View>
    </Modal>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  goalName: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  statValue: {
    fontSize: 30,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  block: {
    alignSelf: "stretch",
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  photoRow: {
    flexDirection: "row",
    gap: 6,
  },
  photo: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#00000010",
  },
  actions: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm,
  },
  later: {
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: spacing.sm,
  },
  close: {
    position: "absolute",
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
