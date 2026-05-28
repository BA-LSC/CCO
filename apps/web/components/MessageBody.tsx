import type { ReactNode } from "react";
import { parseMentionSegments } from "@/lib/mentions";

/** Renders message text with highlighted @mentions. */
export function MessageBody({
  body,
  currentUserId,
}: {
  body: string;
  currentUserId?: string;
}) {
  const segments = parseMentionSegments(body);
  if (segments.length === 0) return null;

  const parts: ReactNode[] = segments.map((segment, index) => {
    if (segment.type === "text") {
      return segment.value;
    }
    const isSelfMention = Boolean(currentUserId && segment.userId === currentUserId);
    return (
      <span
        key={`${index}-${segment.userId}`}
        className={isSelfMention ? "mention mention--self" : "mention"}
      >
        <span className="mention-at" aria-hidden="true">
          @
        </span>
        <span className="mention-name">{segment.displayName}</span>
      </span>
    );
  });

  return <span className="message-body">{parts}</span>;
}
