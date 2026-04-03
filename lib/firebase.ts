/**
 * Firebase配置
 * 使用匿名认证，无需用户登录
 */

import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set, get, push, onValue, update, serverTimestamp } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// Firebase配置 - 替换为你自己的配置
// 获取方式：Firebase Console → Project Settings → Your apps → Web app → Config
const firebaseConfig = {
  apiKey: "AIzaSyDemoPlaceholder",
  authDomain: "zhuri-app.firebaseapp.com",
  databaseURL: "https://zhuri-app-default-rtdb.firebaseio.com",
  projectId: "zhuri-app",
  storageBucket: "zhuri-app.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000",
  measurementId: "G-XXXXXXXXXX"
};

// 初始化Firebase（防止重复初始化）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getDatabase(app);
const auth = getAuth(app);

/**
 * 匿名登录
 * 每个用户自动生成唯一ID，无需注册
 */
export async function anonymousLogin(): Promise<string> {
  try {
    const result = await signInAnonymously(auth);
    return result.user.uid;
  } catch (error) {
    console.error("Anonymous login failed:", error);
    throw error;
  }
}

/**
 * 获取当前用户ID
 */
export function getCurrentUserId(): string | null {
  return auth.currentUser?.uid || null;
}

/**
 * 创建或加入监督团
 * userId: 用户匿名ID
 * goalId: 目标ID
 */
export async function joinSupervisionGroup(userId: string, goalId: string, userName: string) {
  const groupRef = ref(db, `supervision/${goalId}`);
  
  // 检查是否已有群组
  const snapshot = await get(groupRef);
  
  if (!snapshot.exists()) {
    // 创建新群组
    await set(groupRef, {
      createdAt: serverTimestamp(),
      goalId,
      members: {
        [userId]: {
          name: userName,
          joinedAt: serverTimestamp(),
          lastCheckIn: null,
          streak: 0,
          isOnline: true
        }
      }
    });
  } else {
    // 加入已有群组
    const members = snapshot.val().members || {};
    if (!members[userId]) {
      members[userId] = {
        name: userName,
        joinedAt: serverTimestamp(),
        lastCheckIn: null,
        streak: 0,
        isOnline: true
      };
      await update(groupRef, { members });
    }
  }
  
  return goalId;
}

/**
 * 获取监督团成员数据
 */
export async function getSupervisionGroup(goalId: string) {
  const groupRef = ref(db, `supervision/${goalId}`);
  const snapshot = await get(groupRef);
  return snapshot.val();
}

/**
 * 监听监督团实时更新
 */
export function subscribeToSupervisionGroup(goalId: string, callback: (data: any) => void) {
  const groupRef = ref(db, `supervision/${goalId}`);
  return onValue(groupRef, (snapshot) => {
    callback(snapshot.val());
  });
}

/**
 * 更新打卡状态
 */
export async function updateCheckIn(goalId: string, userId: string, streak: number) {
  const memberRef = ref(db, `supervision/${goalId}/members/${userId}`);
  await update(memberRef, {
    lastCheckIn: serverTimestamp(),
    streak,
    isOnline: true
  });
}

/**
 * 戳一下别人
 */
export async function pokeMember(goalId: string, targetUserId: string, fromUserId: string, fromUserName: string) {
  const pokeRef = ref(db, `supervision/${goalId}/pokes/${targetUserId}`);
  await push(pokeRef, {
    from: fromUserId,
    fromName: fromUserName,
    sentAt: serverTimestamp(),
    read: false
  });
}

/**
 * 获取未读戳一下
 */
export async function getUnreadPokes(goalId: string, userId: string): Promise<number> {
  const pokeRef = ref(db, `supervision/${goalId}/pokes/${userId}`);
  const snapshot = await get(pokeRef);
  if (!snapshot.exists()) return 0;
  
  const pokes = snapshot.val();
  return Object.values(pokes).filter((p: any) => !p.read).length;
}

/**
 * 生成邀请链接
 */
export function generateInviteLink(goalId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}?invite=${goalId}`;
}

/**
 * 解析邀请链接
 */
export function parseInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('invite');
}

export { db, ref, set, get, push, update, serverTimestamp };
