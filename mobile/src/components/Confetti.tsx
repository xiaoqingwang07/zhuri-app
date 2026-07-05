import React, { useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COLORS = ["#FF6B35", "#FFD166", "#06D6A0", "#118AB2", "#EF476F", "#9B5DE5"];
const PIECE_COUNT = 28;

interface PieceConfig {
  x: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotate: number;
  drift: number;
}

function Piece({ config }: { config: PieceConfig }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      config.delay,
      withTiming(1, {
        duration: config.duration,
        easing: Easing.out(Easing.quad),
      })
    );
  }, [config, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: config.x + progress.value * config.drift },
      { translateY: -40 + progress.value * (SCREEN_H * 0.85) },
      { rotate: `${progress.value * config.rotate}deg` },
    ],
    opacity: progress.value < 0.8 ? 1 : (1 - progress.value) / 0.2,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: config.size,
          height: config.size * 0.5,
          borderRadius: 2,
          backgroundColor: config.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo<PieceConfig[]>(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        x: Math.random() * SCREEN_W,
        delay: Math.random() * 300,
        duration: 1400 + Math.random() * 800,
        size: 8 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        rotate: (Math.random() - 0.5) * 720,
        drift: (Math.random() - 0.5) * 120,
      })),
    []
  );

  useEffect(() => {
    if (!onDone) return;
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Piece key={i} config={p} />
      ))}
    </View>
  );
}
