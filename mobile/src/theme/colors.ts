export const BRAND = "#FF6B35";

export interface ThemeColors {
  background: string;
  card: string;
  cardElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: "#F7F7F9",
  card: "#FFFFFF",
  cardElevated: "#FFFFFF",
  text: "#1A1A1E",
  textSecondary: "#6B6B72",
  textTertiary: "#9C9CA3",
  border: "#ECECEF",
  primary: BRAND,
  primarySoft: "#FFF0E9",
  success: "#34C759",
  successSoft: "#E8F9ED",
  danger: "#FF3B30",
  dangerSoft: "#FFECEB",
  warning: "#FF9500",
  warningSoft: "#FFF4E5",
  overlay: "rgba(0,0,0,0.4)",
};

export const darkColors: ThemeColors = {
  background: "#000000",
  card: "#1C1C1E",
  cardElevated: "#2C2C2E",
  text: "#F5F5F7",
  textSecondary: "#A1A1A8",
  textTertiary: "#6E6E76",
  border: "#2C2C2E",
  primary: BRAND,
  primarySoft: "#3A2318",
  success: "#30D158",
  successSoft: "#12301C",
  danger: "#FF453A",
  dangerSoft: "#3A1715",
  warning: "#FF9F0A",
  warningSoft: "#382A10",
  overlay: "rgba(0,0,0,0.6)",
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
