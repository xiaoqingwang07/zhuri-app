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
import {
  getOffering,
  isPurchasesConfigured,
  purchasePackage,
  restorePurchases,
} from "@/lib/purchases";
import { spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const FREE_FEATURES = [
  "AI 生成陪跑计划",
  "每日提醒和连续打卡",
  "落后救援重排",
  "最多 3 个目标同时进行",
];

const PRO_FEATURES = [
  { emoji: "🎯", title: "12 个目标并行", desc: "学习、运动、创作、考试一起推进，不用频繁删目标" },
  { emoji: "⚡️", title: "更高 AI 额度", desc: "每日可用更多次拆解、救援重排与督促文案生成" },
  { emoji: "🏅", title: "证书去水印", desc: "成就证书分享时去掉推广水印，更适合认真晒成果" },
];

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
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
        Alert.alert("逐日 Plus 已开通", "多目标、更高 AI 额度和证书去水印已解锁。", [
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
          <Text style={{ fontSize: 48 }}>🚀</Text>
          <Text style={[styles.title, { color: colors.text }]}>逐日 Plus</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
            免费版负责陪你开始；Plus 解锁更多并行目标、更高 AI 额度与证书去水印
          </Text>
        </View>

        <Card style={{ gap: spacing.sm, backgroundColor: colors.successSoft }}>
          <Text style={[styles.blockTitle, { color: colors.text }]}>免费版已经包含</Text>
          {FREE_FEATURES.map((feature) => (
            <View key={feature} style={styles.includedRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.includedText, { color: colors.textSecondary }]}>
                {feature}
              </Text>
            </View>
          ))}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={[styles.blockTitle, { color: colors.text }]}>Plus 已交付能力</Text>
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
              上架 App Store 后开放 Plus（¥12/月 或 ¥68/年，含 7 天免费试用）
            </Text>
          </Card>
        )}

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
  blockTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  includedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  includedText: {
    fontSize: 13,
    fontWeight: "700",
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
