import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

/**
 * 打卡照片 —— 完成任务的物证。
 *
 * 两条硬约束:
 *   1. 完全可选。强制拍照会抬高打卡门槛,直接导致断签,与产品目标相反。
 *   2. 只存本地沙盒,不上传、不进云备份。照片是用户最私密的数据,
 *      而逐日的备份是明文 JSON,把图片 uri 传上去毫无意义还有隐私风险。
 */

const PROOF_DIR = `${FileSystem.documentDirectory}proofs/`;
/** 压缩到这个宽度足够回看,又不会让几十张照片撑爆手机 */
const TARGET_WIDTH = 1080;
const COMPRESS_QUALITY = 0.7;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PROOF_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROOF_DIR, { intermediates: true });
  }
}

/** 压缩并复制到沙盒,返回持久 uri。系统临时目录里的原图随时会被清掉,必须自己存一份 */
async function persist(uri: string, goalId: string, day: number): Promise<string> {
  await ensureDir();
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  context.resize({ width: TARGET_WIDTH });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const target = `${PROOF_DIR}${goalId}_d${day}_${Date.now()}.jpg`;
  await FileSystem.moveAsync({ from: saved.uri, to: target });
  return target;
}

export type ProofSource = "camera" | "library";

/**
 * 拍照或选图。用户拒绝权限时返回 null(不抛错) —— 这是可选功能,
 * 不该因为没给权限就打断打卡流程。
 */
export async function pickProofPhoto(
  source: ProofSource,
  goalId: string,
  day: number
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    return persist(result.assets[0].uri, goalId, day);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return persist(result.assets[0].uri, goalId, day);
}

/** 删除单张照片,失败静默(文件可能已被系统清理) */
export async function deleteProofPhoto(uri?: string): Promise<void> {
  if (!uri || !uri.startsWith(PROOF_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // 删不掉不影响主流程
  }
}

/** 删除某个目标的全部照片(删目标时调用,避免残留占空间) */
export async function deleteGoalProofs(goalId: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(PROOF_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(PROOF_DIR);
    await Promise.all(
      files
        .filter((name) => name.startsWith(`${goalId}_`))
        .map((name) =>
          FileSystem.deleteAsync(`${PROOF_DIR}${name}`, { idempotent: true }).catch(() => {})
        )
    );
  } catch {
    // 清理失败不影响删除目标本身
  }
}
