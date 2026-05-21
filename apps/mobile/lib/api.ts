const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

function authHeaders(sessionToken: string, pcoAccessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${sessionToken}`,
    "Content-Type": "application/json",
  };
  if (pcoAccessToken) headers["x-pco-access-token"] = pcoAccessToken;
  return headers;
}

export type GroupSummary = { id: string; name: string; pcoGroupId: string };

export type GroupDetail = {
  group: GroupSummary;
  membershipRole: string;
  members: Array<{ id: string; displayName: string; role: string }>;
  conversations: Array<{
    id: string;
    slug: string;
    title: string;
    leaderOnly: boolean;
    muted?: boolean;
  }>;
};

export type Message = {
  id: string;
  authorId?: string;
  authorName: string;
  body: string;
  attachmentUrl?: string | null;
  messageType?: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: Array<{ userId: string; emoji: string; userName: string }>;
};

export async function fetchGroups(sessionToken: string): Promise<GroupSummary[]> {
  const res = await fetch(`${API_URL}/v1/groups`, {
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
  const data = (await res.json()) as { groups: GroupSummary[] };
  return data.groups;
}

export async function syncGroups(sessionToken: string, pcoAccessToken?: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/groups/sync`, {
    method: "POST",
    headers: authHeaders(sessionToken, pcoAccessToken),
  });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
}

export async function registerPushToken(sessionToken: string, expoPushToken: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/push/register`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ expoPushToken }),
  });
  if (!res.ok) throw new Error(`Push register failed: ${res.status}`);
}

export async function fetchGroupDetail(
  sessionToken: string,
  groupId: string,
): Promise<GroupDetail> {
  const res = await fetch(`${API_URL}/v1/groups/${groupId}`, {
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) throw new Error(`Failed to load group: ${res.status}`);
  return (await res.json()) as GroupDetail;
}

export async function fetchMessages(
  sessionToken: string,
  conversationId: string,
): Promise<Message[]> {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
  const data = (await res.json()) as { messages: Message[] };
  return data.messages;
}

export async function sendMessage(
  sessionToken: string,
  conversationId: string,
  body: string,
  clientMessageId: string,
): Promise<Message> {
  const res = await fetch(`${API_URL}/v1/messages?conversationId=${conversationId}`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ body, clientMessageId }),
  });
  if (!res.ok) throw new Error(`Send failed: ${res.status}`);
  const data = (await res.json()) as { message: Message };
  return data.message;
}

export async function updateMessage(
  sessionToken: string,
  messageId: string,
  body: string,
): Promise<Message> {
  const res = await fetch(`${API_URL}/v1/messages/${messageId}`, {
    method: "PATCH",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  const data = (await res.json()) as { message: Message };
  return data.message;
}

export async function deleteMessage(sessionToken: string, messageId: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/messages/${messageId}`, {
    method: "DELETE",
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function addReaction(
  sessionToken: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/messages/${messageId}/reactions`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error(`Reaction failed: ${res.status}`);
}

export async function fetchWsToken(sessionToken: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/v1/session/ws-token`, {
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token: string | null };
  return data.token;
}

export function wsUrl(conversationId: string, wsToken: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/v1/ws?conversationId=${conversationId}&token=${encodeURIComponent(wsToken)}`;
}

export { API_URL };
