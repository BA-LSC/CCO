import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#ffffff" },
          headerTintColor: "#1d4ed8",
          headerTitleStyle: { fontWeight: "600", color: "#0f172a" },
          contentStyle: { backgroundColor: "#f4f6fb" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ title: "Signing in…" }} />
        <Stack.Screen name="groups/[id]" options={{ title: "Chat" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
