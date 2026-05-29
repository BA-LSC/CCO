import { describe, expect, test } from "bun:test";
import { escapeLikePattern } from "./db-search";

describe("escapeLikePattern", () => {
  test("wraps query in wildcards", () => {
    expect(escapeLikePattern("sam")).toBe("%sam%");
  });

  test("strips like metacharacters", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("%abcd%");
  });
});
