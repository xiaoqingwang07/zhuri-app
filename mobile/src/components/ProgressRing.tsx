import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/useTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 环形进度：真实描边填充动画 + 百分比数字滚动。
 * progress 变化时（比如打卡后）会从旧值平滑补间到新值。
 */
export function ProgressRing({
  progress,
  size = 92,
  strokeWidth = 8,
  color,
  delay = 0,
}: {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  delay?: number;
}) {
  const { colors } = useTheme();
  const ringColor = color || colors.primary;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  const animated = useSharedValue(0);
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    animated.value = withDelay(
      delay,
      withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
  }, [clamped, delay, animated]);

  // 数字滚动：只有取整值变化才 setState，最多 ~100 次
  useAnimatedReaction(
    () => Math.round(animated.value * 100),
    (value, prev) => {
      if (value !== prev) runOnJS(setDisplayPct)(value);
    }
  );

  const circleProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={circleProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: colors.text, fontSize: size * 0.26 }]}>
          {displayPct}
        </Text>
        <Text style={[styles.unit, { color: colors.textTertiary, fontSize: size * 0.11 }]}>
          %
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 1,
  },
  value: {
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontWeight: "800",
    marginTop: 6,
  },
});
