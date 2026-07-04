import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { GoalsProvider } from "@/lib/GoalsContext";
import { initPurchases } from "@/lib/purchases";
import { darkColors, lightColors } from "@/theme/colors";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? darkColors : lightColors;

  useEffect(() => {
    initPurchases().catch(() => {});
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GoalsProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
      </GoalsProvider>
    </GestureHandlerRootView>
  );
}
