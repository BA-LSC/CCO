import { describe, expect, test } from "bun:test";
import {
  PCO_NIGHTLY_RECONCILE_CRON,
  PCO_NIGHTLY_RECONCILE_SCHEDULE_LABEL,
} from "./pco-sync";

describe("pco-sync schedule constants", () => {
  test("matches reconcile-cron worker trigger", () => {
    expect(PCO_NIGHTLY_RECONCILE_CRON).toBe("0 3 * * *");
  });

  test("exposes human-readable schedule label", () => {
    expect(PCO_NIGHTLY_RECONCILE_SCHEDULE_LABEL).toContain("3:00 AM");
  });
});
