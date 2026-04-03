/**
 * 监督团后端 - GitHub Gist 版本
 * 
 * 不需要Firebase，适合小规模内测（5人以内的监督团）
 * 每个监督团对应一个Gist，数据存储在GitHub
 * 
 * 使用方式：
 * 1. 创建GitHub Gist（公开）
 * 2. 把Gist ID填入 SOCIAL_GIST_ID
 * 3. 用户通过邀请链接加入群组
 */

const SOCIAL_GIST_ID = "YOUR_GIST_ID_HERE"; // 替换为你的Gist ID
const GH_API = "https://api.github.com/gists";

// GitHub Token用于匿名提交（需要用户在GitHub有账号）
let ghToken: string | null = null;

/**
 * 设置GitHub Token
 * 可以从 localStorage 读取用户提供的 token
 */
export function setGitHubToken(token: string) {
  ghToken = token;
}

/**
 * 获取监督团数据
 */
export async function getGroupData(groupId: string): Promise<SupervisionGroup | null> {
  try {
    // 每个groupId对应Gist的一个文件
    const response = await fetch(`${GH_API}/${SOCIAL_GIST_ID}`, {
      headers: {
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      },
    });
    
    if (!response.ok) return null;
    
    const gist = await response.json();
    const fileName = `${groupId}.json`;
    const content = gist.files?.[fileName]?.content;
    
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 更新监督团数据
 */
export async function updateGroupData(groupId: string, data: SupervisionGroup): Promise<boolean> {
  try {
    const response = await fetch(`${GH_API}/${SOCIAL_GIST_ID}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      },
      body: JSON.stringify({
        files: {
          [`${groupId}.json`]: {
            content: JSON.stringify(data, null, 2),
          },
        },
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 创建监督团（初始化Gist文件）
 */
export async function createGroup(groupId: string, goalName: string): Promise<SupervisionGroup> {
  const group: SupervisionGroup = {
    id: groupId,
    goalName,
    members: [],
    createdAt: new Date().toISOString(),
  };
  
  await updateGroupData(groupId, group);
  return group;
}

/**
 * 加入监督团
 */
export async function joinGroup(
  groupId: string,
  userId: string,
  userName: string
): Promise<boolean> {
  const group = await getGroupData(groupId);
  if (!group) return false;
  
  // 检查是否已在群组
  if (!group.members.find((m) => m.userId === userId)) {
    group.members.push({
      userId,
      userName,
      streak: 0,
      lastCheckIn: null,
      joinedAt: new Date().toISOString(),
    });
    await updateGroupData(groupId, group);
  }
  
  return true;
}

/**
 * 更新打卡状态
 */
export async function updateCheckIn(
  groupId: string,
  userId: string,
  streak: number
): Promise<boolean> {
  const group = await getGroupData(groupId);
  if (!group) return false;
  
  const member = group.members.find((m) => m.userId === userId);
  if (member) {
    member.streak = streak;
    member.lastCheckIn = new Date().toISOString();
    await updateGroupData(groupId, group);
  }
  
  return true;
}

/**
 * 戳一下别人
 */
export async function pokeMember(
  groupId: string,
  fromUserId: string,
  fromUserName: string,
  toUserId: string
): Promise<boolean> {
  const group = await getGroupData(groupId);
  if (!group) return false;
  
  group.notifications = group.notifications || [];
  group.notifications.push({
    id: Date.now().toString(),
    fromUserId,
    fromUserName,
    toUserId,
    type: "poke",
    createdAt: new Date().toISOString(),
    read: false,
  });
  
  await updateGroupData(groupId, group);
  return true;
}

export interface SupervisionMember {
  userId: string;
  userName: string;
  streak: number;
  lastCheckIn: string | null;
  joinedAt: string;
}

export interface SupervisionGroup {
  id: string;
  goalName: string;
  members: SupervisionMember[];
  notifications?: Notification[];
  createdAt: string;
}

interface Notification {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  type: string;
  createdAt: string;
  read: boolean;
}

/**
 * 生成邀请链接
 */
export function generateInviteLink(groupId: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}?group=${groupId}`;
}
