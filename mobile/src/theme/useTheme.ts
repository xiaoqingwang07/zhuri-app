import { useColorScheme } from "react-native";
import { darkColors, lightColors, ThemeColors } from "./colors";

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return { colors: isDark ? darkColors : lightColors, isDark };
}
