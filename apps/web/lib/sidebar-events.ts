export type UnreadChangedDetail = {
  conversationId: string;
  hasUnread: boolean;
};

export const UNREAD_CHANGED_EVENT = "cco:unread-changed";
export const SIDEBAR_RELOAD_EVENT = "cco:sidebar-reload";

export function dispatchSidebarReload(): void {
  window.dispatchEvent(new CustomEvent(SIDEBAR_RELOAD_EVENT));
}

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
