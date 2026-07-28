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
const COLORS = ["#F25F3A", "#FF8C5A", "#FFD166", "#06D6A0", "#118AB2", "#EF476F", "#9B5DE5"];
const BURST_COUNT = 26;
const FALL_COUNT = 22;

interface PieceConfig {
  mode: "burst" | "fall";
  x: number; // burst: 水平初速度；fall: 起始 x
  vy: number; // burst: 垂直初速度
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotate: number;
  drift: number;
  round: boolean;
}

function Piece({ config }: { config: PieceConfig }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      config.delay,
      withTiming(1, {
        duration: config.duration,
        easing:
          config.mode === "burst" ? Easing.linear : Easing.out(Easing.quad),
      })
    );
  }, [config, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    let translateX: number;
    let translateY: number;
    if (config.mode === "burst") {
      // 从底部中间喷出：初速度向上 + 水平散开 + 重力回落
      translateX = SCREEN_W / 2 + config.x * t;
      translateY = SCREEN_H * 0.82 - config.vy * t + SCREEN_H * 1.15 * t * t;
    } else {
      translateX = config.x + t * config.drift;
      translateY = -40 + t * (SCREEN_H * 0.9);
    }
    const pop = config.mode === "burst" ? Math.min(1, t * 8) : 1;
    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${t * config.rotate}deg` },
        { scale: pop },
      ],
      opacity: t < 0.75 ? 1 : Math.max(0, (1 - t) / 0.25),
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: config.size,
          height: config.round ? config.size : config.size * 0.55,
          borderRadius: config.round ? config.size / 2 : 2,
          backgroundColor: config.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo<PieceConfig[]>(() => {
    const burst: PieceConfig[] = Array.from({ length: BURST_COUNT }, (_, i) => ({
      mode: "burst",
      x: (Math.random() - 0.5) * SCREEN_W * 1.5,
      vy: SCREEN_H * (0.55 + Math.random() * 0.4),
      delay: Math.random() * 120,
      duration: 1500 + Math.random() * 500,
      size: 8 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      rotate: (Math.random() - 0.5) * 900,
      drift: 0,
      round: Math.random() < 0.3,
    }));
    const fall: PieceConfig[] = Array.from({ length: FALL_COUNT }, (_, i) => ({
      mode: "fall",
      x: Math.random() * SCREEN_W,
      vy: 0,
      delay: 250 + Math.random() * 400,
      duration: 1400 + Math.random() * 800,
      size: 7 + Math.random() * 8,
      color: COLORS[(i + 3) % COLORS.length],
      rotate: (Math.random() - 0.5) * 720,
      drift: (Math.random() - 0.5) * 140,
      round: Math.random() < 0.3,
    }));
    return [...burst, ...fall];
  }, []);

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
