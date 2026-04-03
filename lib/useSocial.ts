/**
 * 社交监督 Hook
 * 封装 Firebase 实时数据订阅
 */

import { useState, useEffect, useCallback } from "react";
import {
  anonymousLogin,
  joinSupervisionGroup,
  getSupervisionGroup,
  subscribeToSupervisionGroup,
  updateCheckIn as firebaseUpdateCheckIn,
  pokeMember,
  getUnreadPokes,
  generateInviteLink,
  parseInviteCode,
  getCurrentUserId,
} from "./firebase";
import { Goal } from "./types";

interface SupervisionMember {
  name: string;
  joinedAt: any;
  lastCheckIn: any;
  streak: number;
  isOnline: boolean;
}

interface SupervisionGroup {
  goalId: string;
  members: Record<string, SupervisionMember>;
  createdAt: any;
}

export function useSocialSupervision(goal: Goal | null) {
  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<SupervisionGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [unreadPokes, setUnreadPokes] = useState(0);

  // 初始化匿名登录
  useEffect(() => {
    const init = async () => {
      try {
        const uid = await anonymousLogin();
        setUserId(uid);
        
        // 检查是否有邀请码
        const code = parseInviteCode();
        if (code) {
          setInviteCode(code);
        }
      } catch (error) {
        console.error("Social init failed:", error);
      }
    };
    init();
  }, []);

  // 加入监督团
  const joinGroup = useCallback(async (userName: string) => {
    if (!userId || !goal) return;
    
    setLoading(true);
    try {
      // 确定群组ID
      const groupId = inviteCode || goal.id;
      await joinSupervisionGroup(userId, groupId, userName);
      
      // 订阅实时更新
      const unsubscribe = subscribeToSupervisionGroup(groupId, (data) => {
        setGroup(data);
      });
      
      // 检查未读戳一下
      const pokes = await getUnreadPokes(groupId, userId);
      setUnreadPokes(pokes);
      
      return groupId;
    } catch (error) {
      console.error("Join group failed:", error);
    } finally {
      setLoading(false);
    }
  }, [userId, goal, inviteCode]);

  // 更新打卡状态
  const checkIn = useCallback(async () => {
    if (!userId || !goal) return;
    const groupId = inviteCode || goal.id;
    await firebaseUpdateCheckIn(groupId, userId, goal.streak);
  }, [userId, goal, inviteCode]);

  // 戳一下别人
  const poke = useCallback(async (targetUserId: string, targetName: string) => {
    if (!userId || !goal) return;
    const groupId = inviteCode || goal.id;
    const myName = group?.members?.[userId]?.name || "有人";
    await pokeMember(groupId, targetUserId, userId, myName);
  }, [userId, goal, group, inviteCode]);

  // 生成邀请链接
  const createInviteLink = useCallback(() => {
    if (!goal) return "";
    const groupId = inviteCode || goal.id;
    return generateInviteLink(groupId);
  }, [goal, inviteCode]);

  return {
    userId,
    group,
    loading,
    inviteCode,
    unreadPokes,
    joinGroup,
    checkIn,
    poke,
    createInviteLink,
  };
}
