/** Messages fetched per page (initial load and each scroll-up request). */
export const MESSAGE_PAGE_SIZE = 30;

export function conversationMessagesPath(
  conversationId: string,
  options?: { before?: string; limit?: number; anchorUnread?: boolean },
): string {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? MESSAGE_PAGE_SIZE));
  if (options?.before) params.set("before", options.before);
  if (options?.anchorUnread) params.set("anchorUnread", "1");
  return `/api/v1/conversations/${conversationId}/messages?${params}`;
}
