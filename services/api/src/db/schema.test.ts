import { describe, expect, test } from "bun:test";
import { groups, organizations, users } from "./schema";

describe("schema", () => {
  test("exports core tables", () => {
    expect(groups).toBeDefined();
    expect(users).toBeDefined();
    expect(organizations).toBeDefined();
  });
});
