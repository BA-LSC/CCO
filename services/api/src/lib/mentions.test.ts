import { describe, expect, test } from "bun:test";
import { extractMentionedUserIds, formatMention, renderMentionBody } from "./mentions";

describe("mentions", () => {
  test("extracts user ids from mention tokens", () => {
    const body = `Hello ${formatMention("Alex", "550e8400-e29b-41d4-a716-446655440000")}!`;
    expect(extractMentionedUserIds(body)).toEqual(["550e8400-e29b-41d4-a716-446655440000"]);
  });

  test("renders mention body for display", () => {
    const body = formatMention("Alex", "550e8400-e29b-41d4-a716-446655440000");
    expect(renderMentionBody(body)).toBe("@Alex");
  });
});
