import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getSessionToken } from "@/lib/auth";
import {
  addReaction,
  deleteMessage,
  fetchGroupDetail,
  fetchMessages,
  fetchWsToken,
  sendMessage,
  updateMessage,
  wsUrl,
  type Message,
} from "@/lib/api";
import { randomClientMessageId } from "@/lib/uuid";

import { theme } from "@/lib/theme";

const REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏"];

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("Group");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    const token = await getSessionToken();
    if (!token || !id) {
      setError("Not signed in");
      return;
    }
    try {
      const detail = await fetchGroupDetail(token, id);
      setTitle(detail.group.name);
      const general = detail.conversations.find((c) => c.slug === "general");
      if (!general) {
        setError("No conversation found for this group");
        return;
      }
      setConversationId(general.id);
      const history = await fetchMessages(token, general.id);
      setMessages(history);

      const meRes = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001"}/v1/session/me`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (meRes.ok) {
        const me = (await meRes.json()) as { userId: string };
        setCurrentUserId(me.userId);
      }

      wsRef.current?.close();
      const wsToken = await fetchWsToken(token);
      if (!wsToken) {
        setError("Could not connect to realtime updates");
        return;
      }
      const ws = new WebSocket(wsUrl(general.id, wsToken));
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data as string) as {
            type: string;
            message?: Message;
            messageId?: string;
            reaction?: { userId: string; emoji: string };
            action?: string;
          };
          if (data.type === "message.created" && data.message) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message!.id)) return prev;
              return [...prev, data.message!];
            });
          }
          if (data.type === "message.updated" && data.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === data.message!.id ? { ...m, ...data.message! } : m)),
            );
          }
          if (data.type === "message.deleted" && data.messageId) {
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
          }
        } catch {
          // ignore
        }
      };
      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat");
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => wsRef.current?.close();
  }, [load]);

  async function handleSend() {
    if (!body.trim() || !conversationId || sending) return;
    const token = await getSessionToken();
    if (!token) return;
    setSending(true);
    try {
      const message = await sendMessage(
        token,
        conversationId,
        body.trim(),
        randomClientMessageId(),
      );
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: string) {
    const token = await getSessionToken();
    if (!token) return;
    await deleteMessage(token, messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }

  async function handleEdit(message: Message) {
    const token = await getSessionToken();
    if (!token) return;
    const updated = await updateMessage(token, message.id, `${message.body} (edited)`);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? updated : m)));
  }

  async function handleReaction(messageId: string, emoji: string) {
    const token = await getSessionToken();
    if (!token) return;
    await addReaction(token, messageId, emoji);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          {conversationId ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/call/[conversationId]", params: { conversationId } })
              }
            >
              <Text style={styles.callBtn}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, messages.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>Be the first to say hello.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.bubble}>
            <Text style={styles.author}>{item.authorName}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <View style={styles.row}>
              {REACTIONS.map((emoji) => (
                <Pressable key={emoji} onPress={() => void handleReaction(item.id, emoji)}>
                  <Text>{emoji}</Text>
                </Pressable>
              ))}
              {currentUserId && item.authorId === currentUserId && (
                <>
                  <Pressable onPress={() => void handleEdit(item)}>
                    <Text style={styles.action}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleDelete(item.id)}>
                    <Text style={[styles.action, styles.danger]}>Delete</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="Message…"
          editable={!sending}
        />
        <Pressable style={styles.send} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  back: { color: theme.colors.primary, marginBottom: 8, fontWeight: "500" },
  title: { fontSize: 22, fontWeight: "700", color: theme.colors.text, flex: 1 },
  callBtn: { color: theme.colors.primary, fontWeight: "600", fontSize: 16 },
  error: { color: theme.colors.danger, padding: 12, backgroundColor: theme.colors.dangerSoft },
  list: { padding: 16 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: theme.colors.text, marginBottom: 6 },
  emptyBody: { fontSize: 14, color: theme.colors.muted },
  bubble: {
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: theme.radius,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  author: { fontWeight: "600", marginBottom: 4, color: theme.colors.text },
  body: { fontSize: 16, color: theme.colors.text, lineHeight: 22 },
  row: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" },
  action: { color: theme.colors.primary, fontSize: 13, fontWeight: "500" },
  danger: { color: theme.colors.danger },
  time: { fontSize: 11, color: theme.colors.muted, marginTop: 6 },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.text,
  },
  send: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius,
    justifyContent: "center",
    paddingHorizontal: 16,
    minWidth: 72,
    alignItems: "center",
  },
  sendText: { color: "#fff", fontWeight: "600" },
});
