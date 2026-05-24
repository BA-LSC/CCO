import { describe, expect, test } from "bun:test";
import { formatMention, parseMentionSegments, renderMentionBody } from "./mentions";

describe("mentions", () => {
  test("renders mention tokens for display", () => {
    const body = `Hello ${formatMention("Sam McDonald", "241e2bd9-b998-492a-a0e1-e712bfe8c754")}!`;
    expect(renderMentionBody(body)).toBe("Hello @Sam McDonald!");
  });

  test("parses mention segments", () => {
    const body = formatMention("Alex", "550e8400-e29b-41d4-a716-446655440000");
    expect(parseMentionSegments(body)).toEqual([
      {
        type: "mention",
        displayName: "Alex",
        userId: "550e8400-e29b-41d4-a716-446655440000",
      },
    ]);
  });
});
