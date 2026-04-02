"use client";

import { useState, useEffect } from "react";

interface InviteModalProps {
  onClose: () => void;
}

export default function InviteModal({ onClose }: InviteModalProps) {
  const [userId] = useState(() => {
    let id = localStorage.getItem("zhuri_user_id");
    if (!id) {
      id = "user_" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("zhuri_user_id", id);
    }
    return id;
  });

  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = `${window.location.origin}/join/${userId}`;
    setInviteLink(link);
  }, [userId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = inviteLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/80" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] rounded-2xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">👥</div>
          <h2 className="text-xl font-bold text-white">邀请朋友加入</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            分享链接，朋友一起监督打卡
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-[var(--bg-primary)] rounded-xl p-4 break-all">
            <p className="text-xs text-[var(--text-secondary)] mb-1">邀请链接</p>
            <p className="text-sm text-white/80 select-all">{inviteLink}</p>
          </div>

          <button
            onClick={handleCopy}
            className={`w-full py-3 font-semibold rounded-xl transition-colors ${
              copied
                ? "bg-[var(--success)] text-white"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent-light)]"
            }`}
          >
            {copied ? "✓ 已复制！" : "复制邀请链接"}
          </button>

          <div className="text-center text-xs text-[var(--text-secondary)]">
            <p>朋友打开链接即可加入你的监督小组</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-[var(--text-secondary)] hover:text-white transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
