import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Chip, PressableScale, SectionTitle } from "@/components/ui";
import {
  clearCloudBackup,
  exportBackupShare,
  parseBackupText,
  applyBackupPayload,
  restoreBackupFromCloud,
  syncBackupToCloud,
} from "@/lib/backup";
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
  const [busyBackup, setBusyBackup] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
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
        isPro ? "已恢复你的 Plus 权益。" : "该 Apple 账号下没有可恢复的购买。"
      );
    } catch {
      Alert.alert("恢复失败", "请稍后再试。");
    } finally {
      setRestoring(false);
    }
  }, []);

  const runBackup = useCallback(async (action: () => Promise<string | void>) => {
    setBusyBackup(true);
    try {
      const ok = await action();
      if (ok) Alert.alert("完成", ok);
    } catch (e: any) {
      if (e?.message !== "已取消导出") {
        Alert.alert("操作失败", e?.message || "请稍后再试");
      }
    } finally {
      setBusyBackup(false);
    }
  }, []);

  const handleImportPaste = useCallback(() => {
    try {
      const payload = parseBackupText(importText.trim());
      const result = applyBackupPayload(payload);
      setImportOpen(false);
      setImportText("");
      Alert.alert("导入成功", `已恢复 ${result.goals} 个目标。请完全退出 App 后重新打开以刷新界面。`);
    } catch (e: any) {
      Alert.alert("导入失败", e?.message || "JSON 无效");
    }
  }, [importText]);

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

      {/* 支持卡片 */}
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
              {pro ? "逐日 Plus 已开通" : "了解逐日 Plus"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              {pro
                ? "多目标、更高 AI 额度和证书去水印已解锁"
                : "核心功能免费，Plus 解锁多目标、更高 AI 额度与证书去水印"}
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
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>
                从这个时间开始，如果今天还没完成，逐日会持续提醒；完成当日任务后自动停止后续提醒。
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

      {/* 备份 */}
      <View>
        <SectionTitle>数据备份</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <SettingsRow
            label="导出备份（分享 JSON）"
            loading={busyBackup}
            onPress={() =>
              runBackup(async () => {
                await exportBackupShare();
                return "已打开系统分享，请保存到文件或备忘录。";
              })
            }
          />
          <SettingsRow
            label="从 JSON 文本导入"
            onPress={() => setImportOpen(true)}
          />
          <SettingsRow
            label="上传到云端备份"
            loading={busyBackup}
            onPress={() =>
              runBackup(async () => {
                await syncBackupToCloud();
                return "已上传到云端（绑定本机匿名设备 ID）。";
              })
            }
          />
          <SettingsRow
            label="从云端恢复"
            loading={busyBackup}
            onPress={() =>
              runBackup(async () => {
                const result = await restoreBackupFromCloud();
                return `已恢复 ${result.goals} 个目标。请完全退出 App 后重新打开以刷新界面。`;
              })
            }
          />
          <SettingsRow
            label="清除云端备份"
            loading={busyBackup}
            onPress={() => {
              Alert.alert("清除云端备份？", "仅清除服务器上的备份，不影响本机数据。", [
                { text: "取消", style: "cancel" },
                {
                  text: "清除",
                  style: "destructive",
                  onPress: () =>
                    runBackup(async () => {
                      await clearCloudBackup();
                      return "云端备份已清除。";
                    }),
                },
              ]);
            }}
          />
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

      <Modal visible={importOpen} transparent animationType="fade">
        <View style={[styles.importBackdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
          <View style={[styles.importCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.proTitle, { color: colors.text }]}>粘贴备份 JSON</Text>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              multiline
              placeholder="把导出的备份全文粘贴到这里"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.importInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="取消" variant="ghost" onPress={() => setImportOpen(false)} style={{ flex: 1 }} />
              <Button title="导入并覆盖" onPress={handleImportPaste} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
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
  importBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  importCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  importInput: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 12,
    textAlignVertical: "top",
  },
});
