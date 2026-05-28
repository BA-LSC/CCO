import { prepareImageForUpload } from "./prepare-image-upload";
import { prepareVideoForUpload } from "./prepare-video-upload";
import { shouldUseMultipartUploadFallback } from "@/lib/cloudflare-deploy";
import {
  isDeployOverlaySuppressed,
  markDeployWait,
  probeServerAppVersion,
} from "@/lib/app-update";

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

function markDeployUnavailable(): void {
  if (isDeployOverlaySuppressed()) {
    markDeployWait({ showOverlay: false });
    return;
  }
  markDeployWait();
}

async function maybeHandleDeployUnavailable(res: Response, text: string): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const body = JSON.parse(text) as { updating?: boolean };
    if (body.updating) {
      markDeployUnavailable();
      return true;
    }
  } catch {
    // ignore
  }
  const probe = await probeServerAppVersion();
  if (probe.updating) {
    markDeployUnavailable();
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

type PresignResponse = {
  uploadUrl: string;
  url: string;
  contentType: string;
};

const STORAGE_CORS_BLOCKED =
  "Upload to storage was blocked by the browser. Your admin may need to configure R2 bucket CORS for your chat site.";

function uploadFetchErrorMessage(stage: "presign" | "storage", err: unknown): string {
  if (err instanceof TypeError && err.message.trim() === "Failed to fetch") {
    if (stage === "storage") {
      return STORAGE_CORS_BLOCKED;
    }
    return "Could not reach the upload service. Check your connection and try again.";
  }
  return getErrorMessage(err);
}

async function uploadMediaViaPresign(file: File, contentType: string): Promise<string> {
  let presign: PresignResponse;
  try {
    const chatOrigin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : undefined;
    presign = await apiFetch<PresignResponse>("/api/v1/uploads/presign", {
      method: "POST",
      body: JSON.stringify({
        contentType,
        size: file.size,
        ...(chatOrigin ? { chatOrigin } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message !== "Failed to fetch") {
      throw err;
    }
    throw new Error(uploadFetchErrorMessage("presign", err));
  }

  if (!presign.uploadUrl?.trim()) {
    throw new Error("Upload service returned an invalid storage URL. Please try again.");
  }

  try {
    const putRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": presign.contentType || contentType },
      body: file,
    });
    if (!putRes.ok) {
      const detail = (await putRes.text()).trim();
      throw new Error(
        detail && detail.length <= 240 ? detail : "Upload to storage failed. Please try again.",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message !== "Failed to fetch") {
      throw err;
    }
    throw new Error(uploadFetchErrorMessage("storage", err));
  }
  return presign.url;
}

function isPresignUnavailableError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return msg.includes("R2 uploads are not configured") || /\(\s*503\s*\)/.test(msg);
}

async function uploadMediaMultipart(file: File, contentType: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/uploads`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    const error = parseApiError(text, res.status);
    throw new Error(error);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

async function uploadPreparedMedia(
  file: File,
  contentType: string,
): Promise<string> {
  try {
    return await uploadMediaViaPresign(file, contentType);
  } catch (presignErr) {
    if (isStorageCorsBlockedError(presignErr)) {
      return uploadMediaMultipart(file, contentType);
    }
    if (shouldUseMultipartUploadFallback() && isPresignUnavailableError(presignErr)) {
      return uploadMediaMultipart(file, contentType);
    }
    throw presignErr;
  }
}

function isStorageCorsBlockedError(err: unknown): boolean {
  return getErrorMessage(err).includes(STORAGE_CORS_BLOCKED);
}

export async function uploadImage(file: File): Promise<string> {
  const prepared = await prepareImageForUpload(file);
  const contentType = prepared.type || "image/jpeg";
  return uploadPreparedMedia(prepared, contentType);
}

export async function uploadVideo(file: File): Promise<string> {
  const prepared = await prepareVideoForUpload(file);
  const contentType = prepared.type || "video/mp4";
  return uploadPreparedMedia(prepared, contentType);
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
  hasRestrictedAccess: boolean;
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

export type PeerUser = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type MessageListResponse = {
  messages: Message[];
  hasMore: boolean;
  firstUnreadMessageId: string | null;
  lastReadAt: string | null;
  canPost?: boolean;
  peerLastReadAt?: string | null;
  peerUser?: PeerUser | null;
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
  clientMessageId?: string;
  /** Client-only blob preview while an attachment upload is in progress. */
  localPreviewUrl?: string;
  pendingUpload?: boolean;
  uploadFailed?: boolean;
  /** Client-only while a text message is awaiting server confirmation. */
  pendingSend?: boolean;
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
