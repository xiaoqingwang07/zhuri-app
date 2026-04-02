"use client";

import { useState, useEffect, useCallback } from "react";

export interface UserCurrency {
  diamonds: number;
  resurrectionCards: number;
}

const CURRENCY_KEY = "zhuri_currency";

export const INITIAL_CURRENCY: UserCurrency = {
  diamonds: 5, // Start with 5 free diamonds
  resurrectionCards: 0,
};

export const DIAMOND_PRICES = {
  resurrectionCard: 10, // 1 resurrection card costs 10 diamonds
  resurrectionPack3: 25, // 3 resurrection cards cost 25 diamonds
};

export function loadCurrency(): UserCurrency {
  if (typeof window === "undefined") return INITIAL_CURRENCY;
  
  const stored = localStorage.getItem(CURRENCY_KEY);
  if (!stored) return INITIAL_CURRENCY;
  
  try {
    return JSON.parse(stored);
  } catch {
    return INITIAL_CURRENCY;
  }
}

export function saveCurrency(currency: UserCurrency): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENCY_KEY, JSON.stringify(currency));
}

export function useCurrency() {
  const [currency, setCurrency] = useState<UserCurrency>(INITIAL_CURRENCY);

  useEffect(() => {
    setCurrency(loadCurrency());
  }, []);

  const updateCurrency = useCallback((updates: Partial<UserCurrency>) => {
    setCurrency((prev) => {
      const updated = { ...prev, ...updates };
      saveCurrency(updated);
      return updated;
    });
  }, []);

  const addDiamonds = useCallback((amount: number) => {
    updateCurrency({ diamonds: currency.diamonds + amount });
  }, [currency.diamonds, updateCurrency]);

  const spendDiamonds = useCallback((amount: number): boolean => {
    if (currency.diamonds < amount) return false;
    updateCurrency({ diamonds: currency.diamonds - amount });
    return true;
  }, [currency.diamonds, updateCurrency]);

  const buyResurrectionCard = useCallback((): boolean => {
    if (currency.diamonds < DIAMOND_PRICES.resurrectionCard) return false;
    updateCurrency({
      diamonds: currency.diamonds - DIAMOND_PRICES.resurrectionCard,
      resurrectionCards: currency.resurrectionCards + 1,
    });
    return true;
  }, [currency, updateCurrency]);

  const buyResurrectionPack = useCallback((): boolean => {
    if (currency.diamonds < DIAMOND_PRICES.resurrectionPack3) return false;
    updateCurrency({
      diamonds: currency.diamonds - DIAMOND_PRICES.resurrectionPack3,
      resurrectionCards: currency.resurrectionCards + 3,
    });
    return true;
  }, [currency, updateCurrency]);

  const useResurrectionCard = useCallback((): boolean => {
    if (currency.resurrectionCards <= 0) return false;
    updateCurrency({ resurrectionCards: currency.resurrectionCards - 1 });
    return true;
  }, [currency.resurrectionCards, updateCurrency]);

  const rewardForSupervising = useCallback(() => {
    // Give 1 diamond for helping others
    addDiamonds(1);
  }, [addDiamonds]);

  return {
    currency,
    addDiamonds,
    spendDiamonds,
    buyResurrectionCard,
    buyResurrectionPack,
    useResurrectionCard,
    rewardForSupervising,
  };
}
