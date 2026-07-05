export const BRAND = "#F25F3A";

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
  background: "#F7F4EF",
  card: "#FFFFFF",
  cardElevated: "#FFFCF8",
  text: "#151316",
  textSecondary: "#66606A",
  textTertiary: "#9A929B",
  border: "#E8E0D8",
  primary: BRAND,
  primarySoft: "#FFE8DF",
  success: "#0E9F75",
  successSoft: "#E4F7EF",
  danger: "#E5486D",
  dangerSoft: "#FFE9EF",
  warning: "#D99400",
  warningSoft: "#FFF1CC",
  overlay: "rgba(0,0,0,0.4)",
};

export const darkColors: ThemeColors = {
  background: "#11100F",
  card: "#1B1918",
  cardElevated: "#24211F",
  text: "#FAF4ED",
  textSecondary: "#BDB2A9",
  textTertiary: "#817770",
  border: "#302B27",
  primary: BRAND,
  primarySoft: "#3A211A",
  success: "#23C899",
  successSoft: "#12352C",
  danger: "#FF6686",
  dangerSoft: "#391821",
  warning: "#F4B63C",
  warningSoft: "#342810",
  overlay: "rgba(0,0,0,0.6)",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
