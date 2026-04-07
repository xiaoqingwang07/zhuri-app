"use client";

import { UserCurrency, DIAMOND_PRICES } from "@/lib/currency";

interface DiamondShopProps {
  currency: UserCurrency;
  onBuyCard: () => boolean;
  onBuyPack: () => boolean;
  onClose: () => void;
}

export default function DiamondShop({ currency, onBuyCard, onBuyPack, onClose }: DiamondShopProps) {
  const handleBuyCard = () => {
    if (onBuyCard()) {
      // Success - could show a toast
    }
  };

  const handleBuyPack = () => {
    if (onBuyPack()) {
      // Success - could show a toast
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">💎</div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">钻石商店</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            你有 <span className="font-bold text-[var(--accent)]">{currency.diamonds}</span> 钻石，
            <span className="font-bold text-[var(--accent)]">{currency.resurrectionCards}</span> 张复活卡
          </p>
        </div>

        <div className="space-y-3">
          {/* Single resurrection card */}
          <button
            onClick={handleBuyCard}
            disabled={currency.diamonds < DIAMOND_PRICES.resurrectionCard}
            className={`w-full p-4 rounded-2xl text-left transition-all btn-press ${
              currency.diamonds >= DIAMOND_PRICES.resurrectionCard
                ? "bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/10"
                : "bg-[var(--bg-secondary)] opacity-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎫</span>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">复活卡 ×1</p>
                  <p className="text-xs text-[var(--text-secondary)]">保护1天不断</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-lg">💎</span>
                <span className="font-bold text-[var(--accent)]">
                  {DIAMOND_PRICES.resurrectionCard}
                </span>
              </div>
            </div>
          </button>

          {/* 3 resurrection cards pack */}
          <button
            onClick={handleBuyPack}
            disabled={currency.diamonds < DIAMOND_PRICES.resurrectionPack3}
            className={`w-full p-4 rounded-2xl text-left transition-all btn-press ${
              currency.diamonds >= DIAMOND_PRICES.resurrectionPack3
                ? "bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/10"
                : "bg-[var(--bg-secondary)] opacity-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📦</span>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">复活卡 ×3 <span className="text-xs text-[var(--success)] bg-[var(--success)]/10 px-1.5 py-0.5 rounded">省5钻石</span></p>
                  <p className="text-xs text-[var(--text-secondary)]">保护3天不断</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-lg">💎</span>
                <span className="font-bold text-[var(--accent)]">
                  {DIAMOND_PRICES.resurrectionPack3}
                </span>
              </div>
            </div>
          </button>

          {/* Free diamonds - watch ad (placeholder) */}
          <button
            disabled
            className="w-full p-4 rounded-2xl text-left bg-[var(--bg-secondary)] opacity-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📺</span>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">看视频领钻石</p>
                  <p className="text-xs text-[var(--text-secondary)]">即将上线</p>
                </div>
              </div>
              <span className="text-sm text-[var(--text-secondary)]">+3</span>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
