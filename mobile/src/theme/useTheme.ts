import { useColorScheme } from "react-native";
import {
  darkColors,
  darkGradients,
  lightColors,
  lightGradients,
  ThemeColors,
  ThemeGradients,
} from "./colors";

export function useTheme(): {
  colors: ThemeColors;
  gradients: ThemeGradients;
  isDark: boolean;
} {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return {
    colors: isDark ? darkColors : lightColors,
    gradients: isDark ? darkGradients : lightGradients,
    isDark,
  };
}
