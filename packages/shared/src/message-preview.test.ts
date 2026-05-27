import { describe, expect, test } from "bun:test";
import { formatSidebarMessagePreview } from "./message-preview";

describe("formatSidebarMessagePreview", () => {
  test("returns null for empty text messages", () => {
    expect(formatSidebarMessagePreview({ body: "   " })).toBeNull();
  });

  test("renders mention tokens", () => {
    expect(
      formatSidebarMessagePreview({
        body: "Hey @[Alex](550e8400-e29b-41d4-a716-446655440000)",
      }),
    ).toBe("Hey @Alex");
  });

  test("uses attachment fallback when body is empty", () => {
    expect(
      formatSidebarMessagePreview({
        body: "",
        attachmentUrl: "https://example.com/a.jpg",
        messageType: "image",
      }),
    ).toBe("Sent an image");
  });

  test("prefixes own messages with You:", () => {
    expect(
      formatSidebarMessagePreview({
        body: "On my way",
        authorIsSelf: true,
      }),
    ).toBe("You: On my way");
  });

  test("prefixes other participant messages with display name", () => {
    expect(
      formatSidebarMessagePreview({
        body: "whats up",
        authorDisplayName: "Gabreil",
      }),
    ).toBe("Gabreil: whats up");
  });

  test("prefers You prefix over author display name", () => {
    expect(
      formatSidebarMessagePreview({
        body: "On my way",
        authorIsSelf: true,
        authorDisplayName: "Gabreil",
      }),
    ).toBe("You: On my way");
  });

  test("truncates long previews with sender prefix", () => {
    const preview = formatSidebarMessagePreview({
      body: "This is a very long message that should be truncated for the sidebar preview row display",
      authorDisplayName: "Gabreil",
      maxLength: 30,
    });
    expect(preview).toBeTruthy();
    expect(preview!.startsWith("Gabreil: ")).toBe(true);
    expect(preview!.length).toBeLessThanOrEqual(32);
    expect(preview!.endsWith("…")).toBe(true);
  });

  test("truncates long previews", () => {
    const preview = formatSidebarMessagePreview({
      body: "This is a very long message that should be truncated for the sidebar preview row display",
      maxLength: 30,
    });
    expect(preview).toBeTruthy();
    expect(preview!.length).toBeLessThanOrEqual(32);
    expect(preview!.endsWith("…")).toBe(true);
  });
});
