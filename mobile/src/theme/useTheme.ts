import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import { kvGet, kvSet } from "@/lib/db";
import {
  darkColors,
  darkGradients,
  lightColors,
  lightGradients,
  ThemeColors,
  ThemeGradients,
} from "./colors";

/**
 * 主题偏好。
 *
 * 之前直接读系统配色，用户没法自己选 —— 系统是深色，App 就永远是深色。
 * 现在存一个偏好：跟随系统 / 强制浅色 / 强制深色。
 */
export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "theme_pref";

export const THEME_OPTIONS: { id: ThemePref; label: string }[] = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
];

function loadPref(): ThemePref {
  const saved = kvGet(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

interface ThemeValue {
  colors: ThemeColors;
  gradients: ThemeGradients;
  isDark: boolean;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(loadPref);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    kvSet(THEME_KEY, p);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const isDark = pref === "system" ? system === "dark" : pref === "dark";
    return {
      colors: isDark ? darkColors : lightColors,
      gradients: isDark ? darkGradients : lightGradients,
      isDark,
      pref,
      setPref,
    };
  }, [pref, system, setPref]);

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Provider 之外（理论上不该发生）退回系统配色，保证不崩
  const isDark = false;
  return {
    colors: lightColors,
    gradients: lightGradients,
    isDark,
    pref: "system",
    setPref: () => {},
  };
}
