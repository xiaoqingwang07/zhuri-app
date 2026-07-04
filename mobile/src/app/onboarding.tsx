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
import { Button } from "@/components/ui";
import { kvSet } from "@/lib/db";
import { spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES = [
  {
    emoji: "🎯",
    title: "说出你的目标",
    desc: "「30天读完一本书」「跑完半马」「学会做饭」——一句话就够了，剩下的交给 AI。",
  },
  {
    emoji: "🤖",
    title: "AI 拆成每日小任务",
    desc: "AI 教练把大目标拆成每天可执行的小任务，由易到难，还留好休息日。",
  },
  {
    emoji: "⚡️",
    title: "落后了？AI 帮你重排",
    desc: "断卡不用从头再来。AI 会把剩余计划重新编排，把「放弃点」变成「挽回点」。",
  },
  {
    emoji: "🔥",
    title: "每天打卡，见证改变",
    desc: "连续打卡攒徽章，AI 教练每天督促你。完成目标还能生成专属成就证书。",
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
    // 用 replace 而非 dismiss：进入本页可能是声明式 Redirect（无可回退的历史记录）
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={[styles.slideTitle, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text style={[styles.slideDesc, { color: colors.textSecondary }]}>
              {item.desc}
            </Text>
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
                  width: i === index ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Button
          title={isLast ? "开始逐日 🚀" : "下一步"}
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
        {!isLast && (
          <Text
            style={[styles.skip, { color: colors.textTertiary }]}
            onPress={finish}
          >
            跳过
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emoji: {
    fontSize: 88,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  slideDesc: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
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
  skip: {
    textAlign: "center",
    fontSize: 14,
    paddingVertical: 4,
  },
});
