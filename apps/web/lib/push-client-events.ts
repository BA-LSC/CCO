export type PushClientMessage = {
  type: "cco:unread-push";
  conversationId?: string;
  url?: string;
};

export const PUSH_CLIENT_MESSAGE = "cco:unread-push";

export function isPushClientMessage(data: unknown): data is PushClientMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as PushClientMessage).type === PUSH_CLIENT_MESSAGE
  );
}
