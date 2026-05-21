import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  clearSession,
  getPcoAccessToken,
  getSessionToken,
  signInWithPlanningCenter,
} from "@/lib/auth";
import { fetchGroups, syncGroups } from "@/lib/api";
import { theme } from "@/lib/theme";

export default function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getSessionToken();
    if (!token) {
      setSignedIn(false);
      setError(null);
      setGroups([]);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    try {
      const data = await fetchGroups(token);
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleSignIn() {
    try {
      setError(null);
      await signInWithPlanningCenter();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function handleSync() {
    const token = await getSessionToken();
    if (!token) return;
    setLoading(true);
    try {
      const pcoToken = await getPcoAccessToken();
      await syncGroups(token, pcoToken ?? undefined);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await clearSession();
    setGroups([]);
    setSignedIn(false);
    setError(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Text style={styles.title}>CCO</Text>
        <Text style={styles.subtitle}>Your Planning Center groups</Text>

        {!signedIn ? (
          <Pressable style={styles.button} onPress={handleSignIn}>
            <Text style={styles.buttonText}>Sign in with Planning Center</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.button} onPress={handleSync} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sync from Planning Center</Text>
              )}
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={handleSignOut}>
              <Text style={styles.buttonSecondaryText}>Sign out</Text>
            </Pressable>
          </>
        )}

        {error && (
          <View style={styles.alertError}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {signedIn && groups.length === 0 && !loading && !error && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyBody}>Sync from Planning Center to pull in your groups.</Text>
          </View>
        )}

        {groups.map((g) => (
          <Pressable
            key={g.id}
            style={styles.card}
            onPress={() => router.push(`/groups/${g.id}`)}
          >
            <Text style={styles.cardTitle}>{g.name}</Text>
            <Text style={styles.cardChevron}>→</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  container: { padding: 24, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", color: theme.colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: theme.colors.muted, marginBottom: 8 },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: theme.radius,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  buttonSecondary: {
    padding: 14,
    borderRadius: theme.radius,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  buttonSecondaryText: { color: theme.colors.text, fontWeight: "500" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  alertError: {
    backgroundColor: theme.colors.dangerSoft,
    padding: 12,
    borderRadius: theme.radius,
  },
  errorText: { color: theme.colors.danger },
  empty: {
    padding: 24,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.text, marginBottom: 6 },
  emptyBody: { fontSize: 14, color: theme.colors.muted, textAlign: "center" },
  card: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: theme.colors.text, flex: 1 },
  cardChevron: { color: theme.colors.muted, fontSize: 18 },
});
