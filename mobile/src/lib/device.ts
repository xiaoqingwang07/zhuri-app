import * as Crypto from "expo-crypto";
import { kvGet, kvSet } from "./db";

const DEVICE_ID_KEY = "device_id";

/**
 * 匿名设备标识。
 *
 * 单独成一个模块，是为了让 ai / analytics / errorReport / backup 都能用它，
 * 又不会互相 import 成环 —— 错误上报要能在 ai.ts 里被调用，而它自己也需要设备号。
 *
 * 这个 id 随机生成、只存本地、不含任何可识别个人的信息。
 */
export function getDeviceId(): string {
  let id = kvGet(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    kvSet(DEVICE_ID_KEY, id);
  }
  return id;
}
