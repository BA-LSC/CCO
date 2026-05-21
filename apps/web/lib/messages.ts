/** Messages fetched per page (initial load and each scroll-up request). */
export const MESSAGE_PAGE_SIZE = 30;

export function conversationMessagesPath(
  conversationId: string,
  options?: { before?: string; limit?: number },
): string {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? MESSAGE_PAGE_SIZE));
  if (options?.before) params.set("before", options.before);
  return `/api/v1/conversations/${conversationId}/messages?${params}`;
}
