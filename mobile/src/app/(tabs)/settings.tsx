import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Chip, PressableScale, SectionTitle } from "@/components/ui";
import { isProCached } from "@/lib/entitlements";
import { restorePurchases } from "@/lib/purchases";
import { useGoals } from "@/lib/GoalsContext";
import {
  ensureNotificationPermission,
  getReminderHour,
  isReminderEnabled,
  rescheduleReminders,
  setReminderEnabled,
  setReminderHour,
} from "@/lib/notifications";
import { PERSONAS } from "@/lib/types";
import { radius, spacing } from "@/theme/colors";
import { useTheme } from "@/theme/useTheme";

const PRIVACY_URL = "https://xiaoqingwang07.github.io/zhuri-app/privacy.html";
const TERMS_URL = "https://xiaoqingwang07.github.io/zhuri-app/terms.html";
const HOUR_OPTIONS = [7, 9, 12, 18, 20, 21, 22];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { persona, setPersona, goals } = useGoals();
  const [reminderOn, setReminderOn] = useState(isReminderEnabled());
  const [hour, setHour] = useState(getReminderHour());
  const [restoring, setRestoring] = useState(false);
  const pro = isProCached();

  const handleToggleReminder = useCallback(
    async (value: boolean) => {
      if (value) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          Alert.alert("通知权限未开启", "请在系统设置中允许「逐日」发送通知。", [
            { text: "取消", style: "cancel" },
            { text: "去设置", onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      setReminderOn(value);
      setReminderEnabled(value);
      await rescheduleReminders(persona, goals);
    },
    [persona, goals]
  );

  const handleHourChange = useCallback(
    async (h: number) => {
      setHour(h);
      setReminderHour(h);
      Haptics.selectionAsync();
      await rescheduleReminders(persona, goals);
    },
    [persona, goals]
  );

  const handlePersonaChange = useCallback(
    async (id: (typeof PERSONAS)[number]["id"]) => {
      setPersona(id);
      Haptics.selectionAsync();
      await rescheduleReminders(id, goals);
    },
    [setPersona, goals]
  );

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const isPro = await restorePurchases();
      Alert.alert(
        isPro ? "恢复成功" : "未找到购买记录",
        isPro ? "已恢复你的 Pro 会员。" : "该 Apple 账号下没有可恢复的购买。"
      );
    } catch {
      Alert.alert("恢复失败", "请稍后再试。");
    } finally {
      setRestoring(false);
    }
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingHorizontal: spacing.md,
        paddingBottom: 120,
        gap: spacing.lg,
      }}
    >
      <Text style={[styles.title, { color: colors.text }]}>设置</Text>

      {/* Pro 卡片 */}
      <PressableScale onPress={() => router.push("/paywall")}>
        <Card
          style={{
            backgroundColor: pro ? colors.successSoft : colors.primarySoft,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <Text style={{ fontSize: 32 }}>{pro ? "👑" : "✨"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.proTitle, { color: colors.text }]}>
              {pro ? "逐日 Pro 已开通" : "升级逐日 Pro"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              {pro
                ? "感谢支持，享受全部 AI 教练功能"
                : "多目标并行 · 无限 AI 拆解 · AI 动态调整 · 每周复盘"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Card>
      </PressableScale>

      {/* 督促人格 */}
      <View>
        <SectionTitle>AI 教练人格</SectionTitle>
        <View style={{ gap: spacing.sm }}>
          {PERSONAS.map((p) => {
            const active = persona === p.id;
            return (
              <PressableScale key={p.id} onPress={() => handlePersonaChange(p.id)}>
                <Card
                  style={[
                    styles.personaCard,
                    active && { borderWidth: 2, borderColor: colors.primary },
                  ]}
                >
                  <Text style={{ fontSize: 30 }}>{p.emoji}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.personaName, { color: colors.text }]}>
                      {p.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {p.description}
                    </Text>
                    <Text
                      style={[
                        styles.personaSample,
                        { color: colors.textTertiary, backgroundColor: colors.background },
                      ]}
                    >
                      “{p.sample}”
                    </Text>
                  </View>
                  {active && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </Card>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {/* 提醒 */}
      <View>
        <SectionTitle>每日提醒</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>开启提醒</Text>
            <Switch
              value={reminderOn}
              onValueChange={handleToggleReminder}
              trackColor={{ true: colors.primary }}
            />
          </View>
          {reminderOn && (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                提醒时间（未打卡时 AI 教练会来督促你）
              </Text>
              <View style={styles.chipRow}>
                {HOUR_OPTIONS.map((h) => (
                  <Chip
                    key={h}
                    label={`${h}:00`}
                    active={hour === h}
                    onPress={() => handleHourChange(h)}
                  />
                ))}
              </View>
            </View>
          )}
        </Card>
      </View>

      {/* 其他 */}
      <View>
        <SectionTitle>其他</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <SettingsRow
            label="恢复购买"
            loading={restoring}
            onPress={handleRestore}
          />
          <SettingsRow label="隐私政策" onPress={() => Linking.openURL(PRIVACY_URL)} />
          <SettingsRow label="服务条款" onPress={() => Linking.openURL(TERMS_URL)} />
        </Card>
        <Text style={[styles.version, { color: colors.textTertiary }]}>
          逐日 v1.0.0 · AI 教练陪你达成目标
        </Text>
      </View>
    </ScrollView>
  );
}

function SettingsRow({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={loading ? undefined : onPress}>
      <View style={styles.settingsRow}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          {loading ? `${label}…` : label}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: "800",
  },
  proTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  personaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  personaName: {
    fontSize: 15,
    fontWeight: "700",
  },
  personaSample: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    padding: 6,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    marginTop: spacing.md,
  },
});
