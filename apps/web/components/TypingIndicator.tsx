"use client";

import { formatTypingLabel } from "@/lib/typing-label";

type Props = {
  displayNames: string[];
};

export function TypingIndicator({ displayNames }: Props) {
  const label = formatTypingLabel(displayNames);
  if (!label) return null;

  return (
    <div className="composer-typing-indicator" role="status" aria-live="polite" aria-atomic="true">
      <span className="composer-typing-label">{label}</span>
      <span className="composer-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
