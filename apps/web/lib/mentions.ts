/** Matches @Display Name tokens embedded in message bodies. */
export const MENTION_PATTERN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi;

export function formatMention(displayName: string, userId: string): string {
  return `@[${displayName}](${userId})`;
}

/** DOM children for a mention chip (@ + display name on one baseline). */
export function appendMentionChipChildren(parent: HTMLElement, displayName: string): void {
  const at = document.createElement("span");
  at.className = "mention-at";
  at.setAttribute("aria-hidden", "true");
  at.textContent = "@";

  const name = document.createElement("span");
  name.className = "mention-name";
  name.textContent = displayName;

  parent.replaceChildren(at, name);
}

export function renderMentionBody(body: string): string {
  return body.replace(MENTION_PATTERN, "@$1");
}

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; displayName: string; userId: string };

export function parseMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const re = new RegExp(MENTION_PATTERN.source, "gi");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", displayName: match[1]!, userId: match[2]! });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }

  return segments;
}
