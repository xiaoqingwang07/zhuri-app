/**
 * 监督团 Hook — GitHub Gist 版本
 *
 * 使用方式：
 * 1. 创建公开 GitHub Gist，复制 Gist ID
 * 2. 在 social.ts 中填入 Gist ID
 * 3. 用户通过邀请链接加入群组
 */

import { useState, useEffect, useCallback } from "react";
import {
  getGroupData,
  updateGroupData,
  createGroup,
  joinGroup as gistJoinGroup,
  updateCheckIn,
  pokeMember,
  generateInviteLink,
  SupervisionMember,
} from "./social";
import { Goal } from "./types";

export function useSocialSupervision(goal: Goal | null) {
  const [members, setMembers] = useState<SupervisionMember[]>([]);
  const [group, setGroup] = useState<{ id: string; goalName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("逐日用户");

  // 初始化：生成匿名用户ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    let uid = localStorage.getItem("zhuri_social_uid");
    if (!uid) {
      uid = "user_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("zhuri_social_uid", uid);
    }
    setUserId(uid);

    let name = localStorage.getItem("zhuri_social_name");
    if (!name) {
      const adjectives = ["热爱", "坚持", "上进", "努力", "认真"];
      const nouns = ["路人", "同学", "伙伴", "朋友", "跑者"];
      name = adjectives[Math.floor(Math.random() * adjectives.length)] +
             nouns[Math.floor(Math.random() * nouns.length)] +
             Math.floor(Math.random() * 99 + 1);
      localStorage.setItem("zhuri_social_name", name);
    }
    setUserName(name);
  }, []);

  // 当目标变化时，加载对应监督团数据
  const loadGroup = useCallback(async () => {
    if (!goal) return;

    setLoading(true);
    try {
      const groupId = goal.id;
      const data = await getGroupData(groupId);
      if (data) {
        setGroup({ id: data.id, goalName: data.goalName });
        setMembers(data.members || []);
      } else {
        // 群组不存在则创建
        const newGroup = await createGroup(groupId, goal.name);
        await gistJoinGroup(groupId, userId || "", userName);
        setGroup({ id: newGroup.id, goalName: newGroup.goalName });
        setMembers(newGroup.members || []);
      }
    } catch (e) {
      console.debug("[Social] loadGroup failed:", e);
    } finally {
      setLoading(false);
    }
  }, [goal, userId, userName]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // 加入监督团
  const joinGroup = useCallback(async () => {
    if (!userId || !group) return;
    await gistJoinGroup(group.id, userId, userName);
    await loadGroup();
  }, [userId, userName, group, loadGroup]);

  // 打卡时更新状态
  const checkIn = useCallback(async () => {
    if (!userId || !group || !goal) return;
    await updateCheckIn(group.id, userId, goal.streak);
    await loadGroup();
  }, [userId, group, goal, loadGroup]);

  // 戳一下别人
  const poke = useCallback(async (targetUserId: string, targetName: string) => {
    if (!userId || !group) return;
    await pokeMember(group.id, userId, userName, targetUserId);
  }, [userId, userName, group]);

  // 生成邀请链接
  const createInviteLink = useCallback(() => {
    if (!group) return "";
    return generateInviteLink(group.id);
  }, [group]);

  return {
    userId,
    userName,
    members,
    group,
    loading,
    joinGroup,
    checkIn,
    poke,
    createInviteLink,
  };
}
