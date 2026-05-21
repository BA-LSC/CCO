import { describe, expect, test } from "bun:test";
import { MessageCreateSchema } from "./schemas";

describe("MessageCreateSchema", () => {
  test("requires body or attachment", () => {
    const result = MessageCreateSchema.safeParse({
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  test("accepts text payload", () => {
    const result = MessageCreateSchema.safeParse({
      body: "hello",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("accepts image-only payload", () => {
    const result = MessageCreateSchema.safeParse({
      body: "",
      attachmentUrl: "http://localhost:3001/uploads/test.png",
      messageType: "image",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});
