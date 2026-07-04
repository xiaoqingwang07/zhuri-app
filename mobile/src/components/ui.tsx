import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          shadowOpacity: isDark ? 0 : 0.06,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PressableScale({
  children,
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 400 });
      }}
      style={[animStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  textStyle,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.dangerSoft
        : variant === "secondary"
          ? colors.primarySoft
          : "transparent";
  const fg =
    variant === "primary"
      ? "#FFFFFF"
      : variant === "danger"
        ? colors.danger
        : colors.primary;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }, textStyle]}>{title}</Text>
      )}
    </PressableScale>
  );
}

export function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }, style]}>
      {children}
    </Text>
  );
}

export function ProgressBar({
  progress,
  height = 8,
  color,
}: {
  progress: number; // 0-1
  height?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color || colors.primary,
        }}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={{
          color: active ? "#FFF" : colors.textSecondary,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
