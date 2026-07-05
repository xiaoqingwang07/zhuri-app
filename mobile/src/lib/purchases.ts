import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { getDeviceId } from "./ai";
import { setProCached } from "./entitlements";

/**
 * RevenueCat 配置。
 * 上架前在 https://app.revenuecat.com 创建项目后，把 iOS 的 Public API Key 填到这里。
 * 未配置时所有函数会优雅降级（App 可正常使用免费功能）。
 *
 * 注意：react-native-purchases 需要原生模块（EAS Build / dev client），
 * 在 Expo Go 中不可用，因此这里用惰性加载 + try/catch 保证不崩溃。
 */
const REVENUECAT_IOS_API_KEY = "";

export const ENTITLEMENT_PRO = "pro";

let configured = false;

function getPurchases(): typeof import("react-native-purchases").default | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-purchases").default;
  } catch {
    return null;
  }
}

export function isPurchasesConfigured(): boolean {
  return configured;
}

export async function initPurchases(): Promise<void> {
  if (configured || !REVENUECAT_IOS_API_KEY) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    // 用 device-id 作为 RevenueCat 用户 ID，后端 Worker 依赖它校验订阅状态
    Purchases.configure({
      apiKey: REVENUECAT_IOS_API_KEY,
      appUserID: getDeviceId(),
    });
    configured = true;
    await refreshProStatus();
  } catch {
    configured = false;
  }
}

/** 拉取最新订阅状态并写入本地缓存 */
export async function refreshProStatus(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!configured || !Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    const isPro = info.entitlements.active[ENTITLEMENT_PRO] !== undefined;
    setProCached(isPro);
    return isPro;
  } catch {
    return false;
  }
}

export async function getOffering(): Promise<PurchasesOffering | null> {
  const Purchases = getPurchases();
  if (!configured || !Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

/** 购买订阅包，返回是否成为 Pro */
export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  const Purchases = getPurchases();
  if (!configured || !Purchases) return false;
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  const isPro = customerInfo.entitlements.active[ENTITLEMENT_PRO] !== undefined;
  setProCached(isPro);
  return isPro;
}

export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!configured || !Purchases) return false;
  const info = await Purchases.restorePurchases();
  const isPro = info.entitlements.active[ENTITLEMENT_PRO] !== undefined;
  setProCached(isPro);
  return isPro;
}
