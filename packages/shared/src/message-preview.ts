/** Matches @Display Name tokens embedded in message bodies. */
const MENTION_PATTERN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi;

export function renderMentionBody(body: string): string {
  return body.replace(MENTION_PATTERN, "@$1");
}

export type SidebarMessagePreviewInput = {
  body: string;
  attachmentUrl?: string | null;
  messageType?: string | null;
  /** When true, prefixes preview with "You: " (Discord-style for own messages). */
  authorIsSelf?: boolean;
  /** When set and not authorIsSelf, prefixes preview with "{name}: ". */
  authorDisplayName?: string;
  maxLength?: number;
};

function attachmentFallback(messageType?: string | null): string {
  if (messageType === "video") return "Sent a video";
  if (messageType === "image") return "Sent an image";
  return "Sent an attachment";
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const breakAt = slice.lastIndexOf(" ");
  const trimmed =
    breakAt >= Math.floor(maxLength * 0.5) ? slice.slice(0, breakAt).trimEnd() : slice.trimEnd();
  return trimmed.endsWith("…") ? trimmed : `${trimmed}…`;
}

/** Single-line preview for DM sidebar rows and similar compact UI. */
export function formatSidebarMessagePreview(input: SidebarMessagePreviewInput): string | null {
  const maxLength = input.maxLength ?? 80;
  const renderedBody = collapseWhitespace(renderMentionBody(input.body.trim()));
  let text = renderedBody;

  if (input.attachmentUrl) {
    text = renderedBody || attachmentFallback(input.messageType);
  }

  if (!text) return null;

  if (input.authorIsSelf) {
    text = `You: ${text}`;
  } else {
    const name = input.authorDisplayName?.trim();
    if (name) text = `${name}: ${text}`;
  }

  return truncatePreview(text, maxLength);
}
