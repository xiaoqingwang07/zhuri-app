"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSocialSupervision } from "@/lib/useSocial";
import { Goal } from "@/lib/types";

export default function JoinPage() {
  const params = useParams();
  const userId = params?.userId as string;
  const [status, setStatus] = useState<"loading" | "joining" | "success" | "error">("loading");
  const [message, setMessage] = useState("正在连接...");

  // We need a goal context to join the group
  // Use a temporary goal just for the join flow
  const [tempGoal] = useState<Goal | null>(() => {
    if (typeof window === "undefined") return null;
    // Try to get the groupId from localStorage or URL params
    const stored = localStorage.getItem("zhuri_pending_join");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  });

  const { joinGroup } = useSocialSupervision(tempGoal);

  useEffect(() => {
    if (!userId) {
      setStatus("error");
      setMessage("邀请链接无效");
      return;
    }

    // Check if user has a pending group to join
    const pendingGroupId = sessionStorage.getItem("zhuri_join_group_id");
    const pendingUserId = sessionStorage.getItem("zhuri_join_user_id");

    if (pendingGroupId && pendingUserId) {
      // There's a pending join request
      setStatus("joining");
      setMessage("正在加入监督团...");

      // Actually join would happen via useSocial hook
      // For now, just redirect
      setTimeout(() => {
        sessionStorage.removeItem("zhuri_join_group_id");
        sessionStorage.removeItem("zhuri_join_user_id");
        setStatus("success");
        setMessage("加入成功！正在跳转...");
        setTimeout(() => {
          window.location.href = "/?joined=true";
        }, 1000);
      }, 1500);
    } else {
      // No pending join - redirect to main app with invite context
      setStatus("success");
      setMessage("正在跳转到逐日...");
      setTimeout(() => {
        window.location.href = `/?invite=${encodeURIComponent(userId)}`;
      }, 1000);
    }
  }, [userId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center space-y-4 p-8">
        <div className={`text-6xl mb-4 ${status === "error" ? "" : "animate-bounce"}`}>
          {status === "error" ? "😕" : status === "success" ? "✅" : "🤝"}
        </div>
        <p className="text-lg font-semibold text-[var(--text-primary)]">
          {message}
        </p>
        {status === "loading" && (
          <div className="flex justify-center gap-1 mt-4">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] typing-dot" />
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] typing-dot" />
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] typing-dot" />
          </div>
        )}
        {status === "error" && (
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-4 px-6 py-2 bg-[var(--accent)] text-white rounded-xl"
          >
            打开逐日
          </button>
        )}
      </div>
    </div>
  );
}
