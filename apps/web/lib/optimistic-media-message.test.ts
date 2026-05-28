import { describe, expect, test } from "bun:test";
import type { Message } from "@/lib/api";
import {
  createPendingUploadMessage,
  pendingUploadMessageId,
  replacePendingUploadMessage,
} from "@/lib/optimistic-media-message";
import type { PendingComposerMedia } from "@/lib/composer-media";

describe("optimistic media messages", () => {
  test("creates pending upload rows with blob preview", () => {
    const item: PendingComposerMedia = {
      id: "media-1",
      file: new File(["x"], "photo.png", { type: "image/png" }),
      previewUrl: "blob:preview",
      kind: "image",
    };
    const message = createPendingUploadMessage({
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      authorId: "user-1",
      authorName: "You",
      item,
    });

    expect(message.id).toBe(pendingUploadMessageId("550e8400-e29b-41d4-a716-446655440000"));
    expect(message.pendingUpload).toBe(true);
    expect(message.localPreviewUrl).toBe("blob:preview");
    expect(message.attachmentUrl).toBeNull();
  });

  test("replaces pending upload with server message", () => {
    const pending = createPendingUploadMessage({
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
      authorId: "user-1",
      authorName: "You",
      item: {
        id: "media-1",
        file: new File(["x"], "photo.png", { type: "image/png" }),
        previewUrl: "blob:preview",
        kind: "image",
      },
    });
    const saved: Message = {
      id: "msg-1",
      authorId: "user-1",
      authorName: "You",
      body: "",
      attachmentUrl: "https://chat.example.com/api/v1/uploads/photo.png?sig=x&exp=1",
      messageType: "image",
      createdAt: "2026-05-27T00:00:00.000Z",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const next = replacePendingUploadMessage([pending], saved.clientMessageId!, saved);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("msg-1");
    expect(next[0]?.pendingUpload).toBeUndefined();
  });
});
