import type { Message } from "@/lib/api";
import type { PendingComposerMedia } from "@/lib/composer-media";
import { deferRevokeBlobUrl } from "@/lib/blob-url-lifecycle";
import { sortMessagesByCreatedAt } from "@/lib/message-order";

const PENDING_UPLOAD_ID_PREFIX = "pending-upload:";

export function pendingUploadMessageId(clientMessageId: string): string {
  return `${PENDING_UPLOAD_ID_PREFIX}${clientMessageId}`;
}

export function isPendingUploadMessage(message: Pick<Message, "id" | "pendingUpload">): boolean {
  return message.pendingUpload === true || message.id.startsWith(PENDING_UPLOAD_ID_PREFIX);
}

export function createPendingUploadMessage(params: {
  clientMessageId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  item: PendingComposerMedia;
}): Message {
  return {
    id: pendingUploadMessageId(params.clientMessageId),
    authorId: params.authorId,
    authorName: params.authorName,
    authorAvatarUrl: params.authorAvatarUrl,
    body: "",
    attachmentUrl: null,
    localPreviewUrl: params.item.previewUrl,
    messageType: params.item.kind,
    createdAt: new Date().toISOString(),
    pendingUpload: true,
    clientMessageId: params.clientMessageId,
  };
}

export function revokePendingUploadPreview(message: Message | undefined): void {
  if (message?.localPreviewUrl?.startsWith("blob:")) {
    deferRevokeBlobUrl(message.localPreviewUrl);
  }
}

export function removePendingUploadByClientMessageId(
  messages: Message[],
  clientMessageId: string | undefined,
): Message[] {
  if (!clientMessageId) return messages;
  const pendingId = pendingUploadMessageId(clientMessageId);
  const pending = messages.find((m) => m.id === pendingId);
  revokePendingUploadPreview(pending);
  return messages.filter((m) => m.id !== pendingId);
}

export function replacePendingUploadMessage(
  messages: Message[],
  clientMessageId: string,
  message: Message,
): Message[] {
  const withoutPending = removePendingUploadByClientMessageId(messages, clientMessageId);
  if (withoutPending.some((m) => m.id === message.id)) return withoutPending;
  return sortMessagesByCreatedAt([...withoutPending, message]);
}
