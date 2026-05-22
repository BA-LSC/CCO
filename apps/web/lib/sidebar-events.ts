export type UnreadChangedDetail = {
  conversationId: string;
  hasUnread: boolean;
};

export type ConversationUpdatedDetail = {
  conversationId: string;
  leaderOnly?: boolean;
  title?: string;
};

export const UNREAD_CHANGED_EVENT = "cco:unread-changed";
export const SIDEBAR_RELOAD_EVENT = "cco:sidebar-reload";
export const CONVERSATION_UPDATED_EVENT = "cco:conversation-updated";

export function dispatchSidebarReload(): void {
  window.dispatchEvent(new CustomEvent(SIDEBAR_RELOAD_EVENT));
}

export function dispatchUnreadChanged(detail: UnreadChangedDetail): void {
  window.dispatchEvent(new CustomEvent<UnreadChangedDetail>(UNREAD_CHANGED_EVENT, { detail }));
}

export function dispatchConversationUpdated(detail: ConversationUpdatedDetail): void {
  window.dispatchEvent(new CustomEvent<ConversationUpdatedDetail>(CONVERSATION_UPDATED_EVENT, { detail }));
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

export function subscribeConversationUpdated(
  handler: (detail: ConversationUpdatedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ConversationUpdatedDetail>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(CONVERSATION_UPDATED_EVENT, listener);
  return () => window.removeEventListener(CONVERSATION_UPDATED_EVENT, listener);
}
