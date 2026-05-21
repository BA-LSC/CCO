import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { completeMobileAuth, saveMobileSession } from "@/lib/auth";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    void (async () => {
      if (params.error) {
        setMessage(params.error);
        return;
      }
      if (!params.code) {
        setMessage("Missing authorization code from CCO.");
        return;
      }
      try {
        const sessionToken = await completeMobileAuth(String(params.code));
        await saveMobileSession({ sessionToken });
        router.replace("/(tabs)/groups");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Sign in failed");
      }
    })();
  }, [params.code, params.error, router]);

  return (
    <View style={styles.container}>
      {!params.error && <ActivityIndicator size="large" color="#1a5fb4" />}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  text: { marginTop: 16, fontSize: 16, textAlign: "center" },
});
