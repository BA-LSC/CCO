import { describe, expect, test } from "bun:test";
import { reconcileStaleMemberships } from "./reconcile";

describe("reconcileStaleMemberships", () => {
  test("is exported as async function", () => {
    expect(typeof reconcileStaleMemberships).toBe("function");
  });
});
