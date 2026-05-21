import type { ReactNode } from "react";

/** Renders message text with highlighted @mentions. */
export function MessageBody({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  const re = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`${match.index}-${match[2]}`} className="mention">
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  if (parts.length === 0) return null;
  return <span className="message-body">{parts}</span>;
}
