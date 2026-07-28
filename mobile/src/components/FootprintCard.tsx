import React, { forwardRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

export interface Footprint {
  uri: string;
  day: number;
}

/** 卡片固定尺寸（3:4，小红书和朋友圈的最佳比例），不跟随主题变化 —— 分享出去的图必须处处一致 */
const W = 330;
const H = 440;
const GAP = 4;

/**
 * 从全部打卡照片里均匀取样，并保证包含第一张和最后一张。
 * 首末对照最能体现「过程」，这正是足迹卡比成绩卡更有说服力的地方。
 */
export function sampleFootprints(all: Footprint[]): Footprint[] {
  const sorted = [...all].sort((a, b) => a.day - b.day);
  const target = sorted.length >= 9 ? 9 : sorted.length >= 6 ? 6 : sorted.length >= 4 ? 4 : 3;
  if (sorted.length <= target) return sorted;

  const picked: Footprint[] = [];
  for (let i = 0; i < target; i++) {
    const idx = Math.round((i * (sorted.length - 1)) / (target - 1));
    picked.push(sorted[idx]);
  }
  return picked;
}

function columnsFor(count: number): number {
  if (count >= 9) return 3;
  if (count >= 6) return 3;
  if (count >= 4) return 2;
  return 3;
}

/**
 * 足迹卡：用户真实的打卡照片九宫格。
 * 用 RN 内置 Image 而不是 expo-image —— react-native-view-shot 对前者的
 * 渲染时机更可预期，截图时不容易出现空白格。
 */
export const FootprintCard = forwardRef<
  View,
  { goalName: string; totalDays: number; photos: Footprint[] }
>(function FootprintCard({ goalName, totalDays, photos }, ref) {
  const cols = columnsFor(photos.length);
  const gridWidth = W - 24;
  const cell = (gridWidth - GAP * (cols - 1)) / cols;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={styles.title} numberOfLines={2}>
        {goalName}
      </Text>
      <Text style={styles.subtitle}>这是我这 {totalDays} 天真的做了什么</Text>

      <View style={[styles.grid, { width: gridWidth }]}>
        {photos.map((p, i) => (
          <View
            key={`${p.uri}-${i}`}
            style={{
              width: cell,
              height: cell,
              borderRadius: 6,
              overflow: "hidden",
              backgroundColor: "#EFE7DF",
            }}
          >
            <Image source={{ uri: p.uri }} style={styles.photo} resizeMode="cover" />
            <View style={styles.dayTag}>
              <Text style={styles.dayTagText}>D{p.day}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Svg width={15} height={15} viewBox="0 0 120 120">
          <Rect width={120} height={120} rx={27} fill="#2A1F18" />
          <Path d="M32 74 A28 28 0 0 1 88 74 Z" fill="#FFC076" />
          <Rect x={22} y={76} width={76} height={4} rx={2} fill="#FFDFB4" />
        </Svg>
        <Text style={styles.brand}>逐日 · {photos.length} 张打卡记录</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: W,
    height: H,
    backgroundColor: "#FFFCF8",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: "#151316",
    lineHeight: 25,
  },
  subtitle: {
    fontSize: 11.5,
    color: "#8A8189",
    fontWeight: "600",
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    marginTop: 12,
    flex: 1,
    alignContent: "flex-start",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  dayTag: {
    position: "absolute",
    left: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dayTagText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.09)",
  },
  brand: {
    fontSize: 10,
    color: "#8A8189",
    fontWeight: "600",
  },
});

export const FOOTPRINT_MIN_PHOTOS = 3;
