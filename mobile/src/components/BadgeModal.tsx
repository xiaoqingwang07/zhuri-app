import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";
import { Badge } from "@/lib/types";
import { Button } from "./ui";
import { Confetti } from "./Confetti";

export function BadgeModal({
  badge,
  onClose,
}: {
  badge: Badge | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  if (!badge) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Confetti />
        <Animated.View
          entering={ZoomIn.springify().damping(14)}
          style={[styles.card, { backgroundColor: colors.card }]}
        >
          <Animated.Text entering={FadeIn.delay(200)} style={styles.emoji}>
            {badge.emoji}
          </Animated.Text>
          <Text style={[styles.title, { color: colors.text }]}>
            解锁徽章「{badge.name}」
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            连续坚持 {badge.daysRequired} 天，了不起！
          </Text>
          <Button title="继续加油" onPress={onClose} style={{ alignSelf: "stretch" }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  emoji: {
    fontSize: 72,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 15,
    marginBottom: spacing.sm,
  },
});
