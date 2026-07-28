import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { SunState } from "@/lib/sunState";
import { useTheme } from "@/theme/useTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 首页的活太阳：外圈进度环 + 内部随状态升降的天空。
 * 太阳高度由 SunState.altitude 驱动；打卡后 altitude 变化会自然形成「升起」动画。
 * 与 App 图标是同一套破晓构图（太阳半沉、一道地平线）。
 */
export function SunDial({
  state,
  progress,
  size = 104,
}: {
  state: SunState;
  progress: number; // 0-1
  size?: number;
}) {
  const { colors } = useTheme();

  const R = size / 2;
  const ringWidth = 5;
  const ringR = R - ringWidth / 2 - 1;
  const circumference = 2 * Math.PI * ringR;
  const sceneR = R - ringWidth - 5; // 内部场景半径
  const horizonY = R + sceneR * 0.34; // 地平线（场景坐标）
  const sunTravel = sceneR * 1.05; // 太阳可移动的垂直距离
  const sunR = sceneR * 0.32;

  const alt = useSharedValue(0);
  const ring = useSharedValue(0);
  const breathe = useSharedValue(0);
  const [displayPct, setDisplayPct] = useState(0);

  const clampedProgress = Math.min(1, Math.max(0, progress));

  useEffect(() => {
    alt.value = withDelay(
      120,
      withTiming(state.altitude, { duration: 1100, easing: Easing.out(Easing.cubic) })
    );
  }, [state.altitude, alt]);

  useEffect(() => {
    ring.value = withDelay(
      120,
      withTiming(clampedProgress, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
  }, [clampedProgress, ring]);

  // 状态好的时候太阳轻微呼吸，落后时静止 —— 用动静传达情绪
  useEffect(() => {
    if (state.glow >= 0.7) {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      );
    } else {
      breathe.value = withTiming(0, { duration: 400 });
    }
  }, [state.glow, breathe]);

  useAnimatedReaction(
    () => Math.round(ring.value * 100),
    (value, prev) => {
      if (value !== prev) runOnJS(setDisplayPct)(value);
    }
  );

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - ring.value),
  }));

  // 太阳中心：altitude 0 → 沉在地平线下；1 → 升到场景顶部
  const sunProps = useAnimatedProps(() => ({
    cy: horizonY + sunR * 0.9 - alt.value * sunTravel,
  }));

  const haloProps = useAnimatedProps(() => ({
    cy: horizonY + sunR * 0.9 - alt.value * sunTravel,
    r: sunR * (2.4 + breathe.value * 0.25),
    opacity: state.glow * (0.5 + breathe.value * 0.12),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="sd-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={state.sky[0]} />
            <Stop offset="1" stopColor={state.sky[1]} />
          </LinearGradient>
          <LinearGradient id="sd-sun" x1="0.35" y1="0" x2="0.65" y2="1">
            <Stop offset="0" stopColor={state.sun[0]} />
            <Stop offset="1" stopColor={state.sun[1]} />
          </LinearGradient>
          <ClipPath id="sd-clip">
            <Circle cx={R} cy={R} r={sceneR} />
          </ClipPath>
        </Defs>

        {/* 内部天空场景，裁剪成圆 */}
        <G clipPath="url(#sd-clip)">
          <Rect x={0} y={0} width={size} height={size} fill="url(#sd-sky)" />
          <AnimatedCircle
            cx={R}
            animatedProps={haloProps}
            fill={state.sun[1]}
          />
          <AnimatedCircle
            cx={R}
            r={sunR}
            fill="url(#sd-sun)"
            animatedProps={sunProps}
          />
          {/* 地面盖住太阳下半部，形成「半沉」构图 */}
          <Rect
            x={0}
            y={horizonY}
            width={size}
            height={size - horizonY}
            fill={state.ground}
          />
          <Rect
            x={0}
            y={horizonY - 1}
            width={size}
            height={2}
            fill={state.horizon}
            opacity={0.85}
          />
        </G>

        {/* 外圈进度环 */}
        <Circle
          cx={R}
          cy={R}
          r={ringR}
          stroke={colors.border}
          strokeWidth={ringWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={R}
          cy={R}
          r={ringR}
          stroke={colors.primary}
          strokeWidth={ringWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={ringProps}
          transform={`rotate(-90 ${R} ${R})`}
        />
      </Svg>

      <View style={[styles.pctWrap, { top: horizonY + 3 }]}>
        <Text style={[styles.pct, { fontSize: size * 0.15 }]}>{displayPct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pctWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pct: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    opacity: 0.92,
  },
});
