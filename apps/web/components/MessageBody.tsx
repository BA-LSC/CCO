import type { ReactNode } from "react";
import { parseMentionSegments } from "@/lib/mentions";

/** Renders message text with highlighted @mentions. */
export function MessageBody({ body }: { body: string }) {
  const segments = parseMentionSegments(body);
  if (segments.length === 0) return null;

  const parts: ReactNode[] = segments.map((segment, index) => {
    if (segment.type === "text") {
      return segment.value;
    }
    return (
      <span key={`${index}-${segment.userId}`} className="mention">
        @{segment.displayName}
      </span>
    );
  });

  return <span className="message-body">{parts}</span>;
}
