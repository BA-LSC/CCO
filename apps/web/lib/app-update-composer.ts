const DRAFT_PREFIX = "cco:composer-draft:";

declare global {
  interface Window {
    __ccoSendInFlight?: boolean;
  }
}

export function isSendInFlight(): boolean {
  return typeof window !== "undefined" && Boolean(window.__ccoSendInFlight);
}

export function setSendInFlight(active: boolean): void {
  if (typeof window === "undefined") return;
  window.__ccoSendInFlight = active;
}

export function saveComposerDraft(conversationId: string, body: string): void {
  if (typeof window === "undefined" || !conversationId) return;
  const trimmed = body.trim();
  if (!trimmed) {
    sessionStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
    return;
  }
  sessionStorage.setItem(`${DRAFT_PREFIX}${conversationId}`, trimmed);
}

export function readComposerDraft(conversationId: string): string | null {
  if (typeof window === "undefined" || !conversationId) return null;
  const draft = sessionStorage.getItem(`${DRAFT_PREFIX}${conversationId}`);
  return draft?.trim() ? draft : null;
}

export function clearComposerDraft(conversationId: string): void {
  if (typeof window === "undefined" || !conversationId) return;
  sessionStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
}

export async function waitForSendIdle(timeoutMs = 8000): Promise<void> {
  if (typeof window === "undefined") return;

  const started = Date.now();
  while (isSendInFlight()) {
    if (Date.now() - started >= timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
