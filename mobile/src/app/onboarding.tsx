import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, PressableScale } from "@/components/ui";
import { kvSet } from "@/lib/db";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES = [
  {
    marker: "01",
    emoji: "☀️",
    title: "每天只看今天",
    desc: "逐日先理解你的目标，再把它拆成今天能完成的一步。忙的时候，最低完成版也算数。",
    tag: "不是清单，是陪练",
  },
  {
    marker: "02",
    emoji: "⚡️",
    title: "断了也能接回来",
    desc: "如果计划太满、状态变差或落后几天，逐日会根据真实反馈重排节奏，不用从头再来。",
    tag: "把放弃点变成救援点",
  },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    kvSet("onboarding_done", "1");
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[styles.brand, { color: colors.text }]}>逐日</Text>
        {!isLast && (
          <PressableScale onPress={finish} style={[styles.skipButton, { backgroundColor: colors.card }]}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>跳过</Text>
          </PressableScale>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
        }
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_W }]}>
            <View style={[styles.poster, { backgroundColor: colors.card }]}>
              <View style={[styles.marker, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.markerText, { color: colors.primary }]}>{item.marker}</Text>
              </View>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={[styles.slideTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.slideDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
              <View style={[styles.tag, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
                <Text style={[styles.tagText, { color: colors.primary }]}>{item.tag}</Text>
              </View>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.primary : colors.border,
                  width: i === index ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Button
          title={isLast ? "开始陪跑" : "继续"}
          onPress={() => {
            if (isLast) {
              finish();
            } else {
              listRef.current?.scrollToIndex({ index: index + 1 });
              setIndex(index + 1);
            }
          }}
          style={{ marginHorizontal: spacing.md }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontSize: 22,
    fontWeight: "900",
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  poster: {
    minHeight: 460,
    borderRadius: radius.xl,
    padding: spacing.xl,
    justifyContent: "center",
    gap: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 4,
  },
  marker: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markerText: {
    fontSize: 12,
    fontWeight: "900",
  },
  emoji: {
    fontSize: 82,
    marginTop: spacing.lg,
  },
  slideTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
  },
  slideDesc: {
    fontSize: 16,
    lineHeight: 25,
  },
  tag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "900",
  },
  footer: {
    gap: spacing.md,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
