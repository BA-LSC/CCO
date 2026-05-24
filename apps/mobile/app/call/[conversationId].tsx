import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
} from "@cloudflare/realtimekit-react-native";
import { RtkMeeting } from "@cloudflare/realtimekit-react-native-ui";
import { getSessionToken } from "@/lib/auth";
import { joinCallById, startOrJoinCall } from "@/lib/api";
import { theme } from "@/lib/theme";

function MeetingView({ onLeave }: { onLeave: () => void }) {
  const { meeting } = useRealtimeKitMeeting();

  useEffect(() => {
    if (!meeting) return;
    const handler = () => onLeave();
    meeting.self.on("roomLeft", handler);
    return () => {
      meeting.self.off("roomLeft", handler);
    };
  }, [meeting, onLeave]);

  if (!meeting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return <RtkMeeting meeting={meeting} />;
}

export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId: string; callId?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [meeting, initMeeting] = useRealtimeKitClient();

  useEffect(() => {
    async function load() {
      const token = await getSessionToken();
      if (!token) {
        setError("Not signed in");
        return;
      }
      try {
        const result = params.callId
          ? await joinCallById(token, params.callId)
          : await startOrJoinCall(token, params.conversationId);
        await initMeeting({ authToken: result.authToken });
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join call");
      }
    }
    void load();
  }, [params.callId, params.conversationId, initMeeting]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>Joining call…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.leaveButton} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Leave</Text>
      </Pressable>
      <RealtimeKitProvider value={meeting}>
        <MeetingView onLeave={() => router.back()} />
      </RealtimeKitProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: theme.colors.danger, marginBottom: 16, textAlign: "center" },
  loadingText: { color: theme.colors.textMuted, marginTop: 12 },
  leaveButton: {
    position: "absolute",
    top: 56,
    right: 16,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
