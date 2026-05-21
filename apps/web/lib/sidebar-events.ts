export type UnreadChangedDetail = {
  conversationId: string;
  hasUnread: boolean;
};

export const UNREAD_CHANGED_EVENT = "cco:unread-changed";

export function dispatchUnreadChanged(detail: UnreadChangedDetail): void {
  window.dispatchEvent(new CustomEvent<UnreadChangedDetail>(UNREAD_CHANGED_EVENT, { detail }));
}

export function subscribeUnreadChanged(
  handler: (detail: UnreadChangedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<UnreadChangedDetail>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(UNREAD_CHANGED_EVENT, listener);
  return () => window.removeEventListener(UNREAD_CHANGED_EVENT, listener);
}
