import type { MessageDto } from "./messages";

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

function messagePreview(message: MessageDto): string {
  if (message.attachmentUrl) {
    return message.body.trim() || "Sent an image";
  }
  return message.body.trim();
}

export function buildMessageNotificationContent(params: {
  message: MessageDto;
  meta: ConversationNotificationMeta;
  mention?: boolean;
}): { title: string; body: string; image: string | null } {
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

  return {
    title,
    body: formatNotificationBody(bodyText),
    image: params.message.authorAvatarUrl ?? null,
  };
}
