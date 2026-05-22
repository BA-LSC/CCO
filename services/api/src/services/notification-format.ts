import { fetchPersonAvatarUrl, PlanningCenterClient } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import type { MessageDto } from "./messages";
import { getOrgPcoAccessToken } from "./org-config";
import { getConfiguredOrganization } from "./org-oauth";
import { refreshUserAvatarFromPco } from "./user-profile";

export type ConversationNotificationKind = "dm" | "group" | "team";

export type ConversationNotificationMeta = {
  url: string;
  title: string;
  kind: ConversationNotificationKind;
};

export function formatNotificationBody(
  text: string,
  maxLines = 2,
  maxLineLength = 100,
): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "New message";

  const lines: string[] = [];
  let remaining = normalized;

  while (remaining.length > 0 && lines.length < maxLines) {
    const newlineIndex = remaining.indexOf("\n");
    if (newlineIndex >= 0 && newlineIndex < maxLineLength) {
      lines.push(remaining.slice(0, newlineIndex).trimEnd());
      remaining = remaining.slice(newlineIndex + 1).trimStart();
      continue;
    }

    if (remaining.length <= maxLineLength) {
      lines.push(remaining);
      break;
    }

    let breakAt = remaining.lastIndexOf(" ", maxLineLength);
    if (breakAt < Math.floor(maxLineLength * 0.5)) breakAt = maxLineLength;

    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining.length > 0 && lines.length === maxLines) {
    const lastIndex = maxLines - 1;
    const lastLine = lines[lastIndex] ?? "";
    lines[lastIndex] = lastLine.endsWith("…") ? lastLine : `${lastLine.trimEnd()}…`;
  }

  return lines.join("\n");
}

export function resolveNotificationImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return trimmed;
  return null;
}

export async function resolveAuthorAvatarForNotification(authorId: string): Promise<string | null> {
  try {
    const row = await db
      .select({ avatarUrl: users.avatarUrl, pcoPersonId: users.pcoPersonId })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    const existing = resolveNotificationImageUrl(row[0]?.avatarUrl);
    if (existing) return existing;

    const refreshed = resolveNotificationImageUrl(
      await refreshUserAvatarFromPco(authorId).catch(() => null),
    );
    if (refreshed) return refreshed;

    const pcoPersonId = row[0]?.pcoPersonId;
    if (!pcoPersonId) return null;

    const org = await getConfiguredOrganization();
    if (!org) return null;

    const accessToken = await getOrgPcoAccessToken(org.id);
    if (!accessToken) return null;

    const client = new PlanningCenterClient({ accessToken });
    const avatarUrl = resolveNotificationImageUrl(await fetchPersonAvatarUrl(client, pcoPersonId));
    if (avatarUrl) {
      await db.update(users).set({ avatarUrl }).where(eq(users.id, authorId));
    }
    return avatarUrl;
  } catch {
    return null;
  }
}

function messagePreview(message: MessageDto): string {
  if (message.attachmentUrl) {
    return message.body.trim() || "Sent an image";
  }
  return message.body.trim();
}

export async function buildMessageNotificationContent(params: {
  message: MessageDto;
  meta: ConversationNotificationMeta;
  mention?: boolean;
}): Promise<{ title: string; body: string; image: string | null }> {
  const preview = messagePreview(params.message);
  const title =
    params.meta.kind === "dm" ? params.message.authorName.trim() || "Message" : params.meta.title;

  let bodyText = preview;
  if (params.mention) {
    bodyText = preview
      ? `${params.message.authorName} mentioned you\n${preview}`
      : `${params.message.authorName} mentioned you`;
  } else if (params.meta.kind !== "dm") {
    bodyText = preview
      ? `${params.message.authorName}: ${preview}`
      : `${params.message.authorName} sent a message`;
  }

  const image =
    resolveNotificationImageUrl(params.message.authorAvatarUrl) ??
    (await resolveAuthorAvatarForNotification(params.message.authorId));

  return {
    title,
    body: formatNotificationBody(bodyText),
    image,
  };
}
