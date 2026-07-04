import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, PressableScale } from "@/components/ui";
import { useGoals } from "@/lib/GoalsContext";
import {
  getOffering,
  isPurchasesConfigured,
  purchasePackage,
  purchaseReviveCards,
  restorePurchases,
} from "@/lib/purchases";
import { spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const PRO_FEATURES = [
  { emoji: "🎯", title: "3 个目标并行", desc: "同时推进多个人生目标" },
  { emoji: "✨", title: "无限 AI 拆解", desc: "随时创建新目标，不限次数" },
  { emoji: "⚡️", title: "AI 动态调整", desc: "落后时一键重排剩余计划，不用推倒重来" },
  { emoji: "🎭", title: "AI 教练人格", desc: "温柔鼓励 / 毒舌教练 / 数据理性随心切换" },
  { emoji: "📊", title: "每周 AI 复盘", desc: "每周执行报告 + 下周针对性建议" },
  { emoji: "🏆", title: "证书去水印", desc: "分享成就证书更有面子" },
];

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeGoals, addReviveCard } = useGoals();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [buyingCards, setBuyingCards] = useState(false);
  const configured = isPurchasesConfigured();

  useEffect(() => {
    getOffering().then((offering) => {
      if (offering) {
        const pkgs = offering.availablePackages;
        setPackages(pkgs);
        const annual = pkgs.find((p) => p.packageType === "ANNUAL");
        setSelected(annual || pkgs[0] || null);
      }
    });
  }, []);

  const handlePurchase = useCallback(async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      const isPro = await purchasePackage(selected);
      if (isPro) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("🎉 欢迎加入逐日 Pro", "全部 AI 教练功能已解锁！", [
          { text: "开始使用", onPress: () => router.dismiss() },
        ]);
      }
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert("购买失败", "请稍后再试。");
      }
    } finally {
      setPurchasing(false);
    }
  }, [selected, router]);

  const handleBuyCards = useCallback(async () => {
    setBuyingCards(true);
    try {
      const ok = await purchaseReviveCards();
      if (ok) {
        // 入账到第一个进行中的目标（也存钱包）
        if (activeGoals[0]) addReviveCard(activeGoals[0].id, 3);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("❤️‍🩹 复活卡 +3", "断卡时用它补救，保住连续记录。");
      } else {
        Alert.alert("暂不可用", "内购尚未配置，上架后开放。");
      }
    } catch (e: any) {
      if (!e?.userCancelled) Alert.alert("购买失败", "请稍后再试。");
    } finally {
      setBuyingCards(false);
    }
  }, [activeGoals, addReviveCard]);

  const handleRestore = useCallback(async () => {
    const isPro = await restorePurchases();
    Alert.alert(isPro ? "恢复成功" : "未找到购买记录");
    if (isPro) router.dismiss();
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingHorizontal: spacing.md,
          paddingBottom: insets.bottom + 160,
          gap: spacing.md,
        }}
      >
        <PressableScale
          onPress={() => router.dismiss()}
          style={[styles.closeButton, { backgroundColor: colors.card }]}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </PressableScale>

        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 48 }}>👑</Text>
          <Text style={[styles.title, { color: colors.text }]}>逐日 Pro</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary }}>
            你只管说目标，AI 教练管到底
          </Text>
        </View>

        <Card style={{ gap: spacing.md }}>
          {PRO_FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <Text style={{ fontSize: 24 }}>{f.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>
                  {f.title}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  {f.desc}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {/* 订阅选项 */}
        {configured && packages.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {packages.map((pkg) => {
              const isSelected = selected?.identifier === pkg.identifier;
              const isAnnual = pkg.packageType === "ANNUAL";
              return (
                <PressableScale key={pkg.identifier} onPress={() => setSelected(pkg)}>
                  <Card
                    style={[
                      styles.packageCard,
                      isSelected && { borderWidth: 2, borderColor: colors.primary },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.packageTitle, { color: colors.text }]}>
                        {isAnnual ? "年度会员" : pkg.packageType === "MONTHLY" ? "月度会员" : pkg.product.title}
                        {isAnnual && (
                          <Text style={{ color: colors.primary }}>  省 53%</Text>
                        )}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {pkg.product.priceString}
                        {isAnnual ? " / 年" : " / 月"}
                      </Text>
                    </View>
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={isSelected ? colors.primary : colors.textTertiary}
                    />
                  </Card>
                </PressableScale>
              );
            })}
          </View>
        ) : (
          <Card style={{ alignItems: "center", gap: 4, paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
              内购正在准备中
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center" }}>
              上架 App Store 后开放订阅（¥12/月 或 ¥68/年，含 7 天免费试用）
            </Text>
          </Card>
        )}

        {/* 复活卡 */}
        <Card style={styles.reviveCard}>
          <Text style={{ fontSize: 28 }}>❤️‍🩹</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.featureTitle, { color: colors.text }]}>
              复活卡 × 3
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              断卡补救神器，保住连续记录 · ¥6
            </Text>
          </View>
          <Button
            title="购买"
            variant="secondary"
            loading={buyingCards}
            onPress={handleBuyCards}
            style={{ height: 40, paddingHorizontal: spacing.md }}
          />
        </Card>

        <PressableScale onPress={handleRestore}>
          <Text style={[styles.restore, { color: colors.textTertiary }]}>
            恢复购买
          </Text>
        </PressableScale>
      </ScrollView>

      {configured && packages.length > 0 && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + spacing.sm,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Button
            title="开启 7 天免费试用"
            onPress={handlePurchase}
            loading={purchasing}
          />
          <Text style={[styles.legal, { color: colors.textTertiary }]}>
            试用期结束后自动续订，可随时在系统设置中取消
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  packageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  packageTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  reviveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  restore: {
    textAlign: "center",
    fontSize: 13,
    paddingVertical: spacing.sm,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legal: {
    textAlign: "center",
    fontSize: 11,
  },
});
