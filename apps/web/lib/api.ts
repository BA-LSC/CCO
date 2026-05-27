import { prepareImageForUpload } from "./prepare-image-upload";
import { prepareVideoForUpload } from "./prepare-video-upload";
import { markDeployWait, probeServerAppVersion } from "@/lib/app-update";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function isHtmlResponse(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

function fallbackMessageForStatus(status: number): string {
  if (status === 401) return "Sign in required.";
  if (status === 403) return "You don't have access to this resource.";
  if (status === 404) return "The requested resource was not found.";
  if (status >= 500) return "The server is unavailable. Try again in a moment.";
  return `Request failed (${status}).`;
}

function parseApiError(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed || isHtmlResponse(trimmed)) {
    return fallbackMessageForStatus(status);
  }

  try {
    const body = JSON.parse(trimmed) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error === "object") {
      return JSON.stringify(body.error);
    }
  } catch {
    /* plain text */
  }

  if (trimmed.length > 240) return fallbackMessageForStatus(status);
  return trimmed;
}

async function maybeHandleDeployUnavailable(res: Response, text: string): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const body = JSON.parse(text) as { updating?: boolean };
    if (body.updating) {
      markDeployWait();
      return true;
    }
  } catch {
    // ignore
  }
  const probe = await probeServerAppVersion();
  if (probe.updating) {
    markDeployWait();
    return true;
  }
  return false;
}

/** Safe message for UI when catching unknown errors. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (!msg || isHtmlResponse(msg)) return "Something went wrong. Please try again.";
    if (msg.length > 240) return "Something went wrong. Please try again.";
    return msg;
  }
  return "Something went wrong. Please try again.";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    if (await maybeHandleDeployUnavailable(res, text)) {
      throw new Error("Updating CCO…");
    }
    throw new Error(parseApiError(text, res.status));
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessageForStatus(res.status || 500));
  }

  return (await res.json()) as T;
}

export async function uploadImage(file: File): Promise<string> {
  const prepared = await prepareImageForUpload(file);
  const form = new FormData();
  form.append("file", prepared);
  const res = await fetch(`${API_BASE}/api/v1/uploads`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, res.status));
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function uploadVideo(file: File): Promise<string> {
  const prepared = await prepareVideoForUpload(file);
  const form = new FormData();
  form.append("file", prepared);
  const res = await fetch(`${API_BASE}/api/v1/uploads`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, res.status));
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export type GroupSummary = {
  id: string;
  name: string;
  pcoGroupId: string;
  imageUrl?: string | null;
};

export type GroupSidebarConversation = {
  id: string;
  slug: string;
  title: string;
  leaderOnly: boolean;
  muted: boolean;
  hasUnread: boolean;
};

export type GroupSidebarItem = GroupSummary & {
  membershipRole: string;
  conversations: GroupSidebarConversation[];
};

export type ServiceTeamSummary = {
  id: string;
  name: string;
  pcoTeamId: string;
  role?: string;
  serviceTypeNames?: string[];
  conversationId?: string | null;
  hasUnread?: boolean;
};

export type DmParticipant = { id: string; displayName: string; avatarUrl?: string | null };

export type DmSummary = {
  id: string;
  participant: DmParticipant;
  hasUnread: boolean;
  lastActivityAt: string | null;
  lastMessagePreview: string | null;
  muted: boolean;
};

export type DmDetail = {
  id: string;
  participant: DmParticipant;
  muted: boolean;
};

export type Reaction = {
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
};

export type GroupMember = {
  id?: string;
  pcoPersonId: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
  onCco: boolean;
  email?: string | null;
};

export type GroupDetail = {
  group: GroupSummary;
  membershipRole: string;
  members: GroupMember[];
  conversations: Array<{
    id: string;
    slug: string;
    title: string;
    leaderOnly: boolean;
    canPost?: boolean;
    muted?: boolean;
    memberCount?: number;
  }>;
};

export type GiphyGifResult = {
  id: string;
  title: string;
  previewUrl: string;
  importUrl: string;
  width: number;
  height: number;
};

export async function importGiphyGif(importUrl: string): Promise<string> {
  const data = await apiFetch<{ url: string }>("/api/v1/giphy/import", {
    method: "POST",
    body: JSON.stringify({ url: importUrl }),
  });
  return data.url;
}

export async function fetchGiphyEnabled(): Promise<boolean> {
  try {
    const data = await apiFetch<{ enabled: boolean }>("/api/v1/giphy/status");
    return data.enabled;
  } catch {
    return false;
  }
}

export type MessageListResponse = {
  messages: Message[];
  hasMore: boolean;
  firstUnreadMessageId: string | null;
  lastReadAt: string | null;
  canPost?: boolean;
};

export type Message = {
  id: string;
  authorId?: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  body: string;
  attachmentUrl: string | null;
  messageType: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: Reaction[];
};

export function formatMention(displayName: string, userId: string): string {
  return `@[${displayName}](${userId})`;
}

/** URL-safe slug for conversation ids */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
