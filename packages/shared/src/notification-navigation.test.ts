import { describe, expect, test } from "bun:test";
import { appendNotificationAnchorToUrl, NOTIFICATION_ANCHOR_QUERY } from "./notification-navigation";

describe("appendNotificationAnchorToUrl", () => {
  test("appends anchor query to a path", () => {
    expect(appendNotificationAnchorToUrl("/dms/abc")).toBe(
      `/dms/abc?${NOTIFICATION_ANCHOR_QUERY}=1`,
    );
  });

  test("preserves existing query params", () => {
    expect(appendNotificationAnchorToUrl("/teams/t1?sync=1")).toBe(
      `/teams/t1?sync=1&${NOTIFICATION_ANCHOR_QUERY}=1`,
    );
  });

  test("preserves hash fragments", () => {
    expect(appendNotificationAnchorToUrl("/groups/g1/c/c1#composer")).toBe(
      `/groups/g1/c/c1?${NOTIFICATION_ANCHOR_QUERY}=1#composer`,
    );
  });
});
