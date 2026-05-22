import { describe, expect, test } from "bun:test";
import { MessageCreateSchema } from "@cco/shared/schemas";
import { isAllowedAttachmentUrl } from "../lib/uploads";

process.env.SESSION_SECRET ??= "test-secret-must-be-at-least-32-characters-long!!";

describe("message idempotency contract", () => {
  test("requires clientMessageId uuid for deduplication", () => {
    const result = MessageCreateSchema.safeParse({
      body: "hello",
      clientMessageId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing clientMessageId", () => {
    const result = MessageCreateSchema.safeParse({ body: "hello" });
    expect(result.success).toBe(false);
  });
});

describe("attachment URL validation", () => {
  const publicBase = "http://localhost:3001/uploads";

  test("accepts signed upload URLs from the configured origin", () => {
    const url = `${publicBase}/abc.png?sig=abc&exp=9999999999`;
    expect(isAllowedAttachmentUrl(url, publicBase)).toBe(true);
  });

  test("rejects arbitrary external attachment URLs", () => {
    expect(isAllowedAttachmentUrl("https://attacker.example/image.png", publicBase)).toBe(
      false,
    );
  });
});
