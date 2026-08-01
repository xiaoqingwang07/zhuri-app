import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { trackAppOpen } from "@/lib/analytics";
import { installErrorReporting } from "@/lib/errorReport";
import { GoalsProvider } from "@/lib/GoalsContext";
import { initPurchases } from "@/lib/purchases";
import { ThemeProvider, useTheme } from "@/theme/useTheme";

SplashScreen.preventAutoHideAsync();

/** 抽出来是因为要在 ThemeProvider 内部才能用 useTheme */
function RootStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="create"
          options={{ presentation: "modal", gestureEnabled: false }}
        />
        <Stack.Screen name="goal/[id]" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen
          name="onboarding"
          options={{ presentation: "fullScreenModal", gestureEnabled: false }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    installErrorReporting();
    initPurchases().catch(() => {});
    trackAppOpen();
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <GoalsProvider>
          <RootStack />
        </GoalsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
