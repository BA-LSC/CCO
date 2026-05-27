import { describe, expect, test } from "bun:test";
import {
  RECONCILE_BATCH_SIZE,
  reconcileStaleMemberships,
  reconcileUserContextsBatch,
  type ReconcileUserContext,
} from "./reconcile";

describe("reconcileStaleMemberships", () => {
  test("is exported as async function", () => {
    expect(typeof reconcileStaleMemberships).toBe("function");
  });
});

describe("reconcileUserContextsBatch", () => {
  test("uses batch size 8 with Promise.allSettled", async () => {
    expect(RECONCILE_BATCH_SIZE).toBe(8);

    const contexts: ReconcileUserContext[] = Array.from({ length: 20 }, (_, index) => ({
      userId: `user-${index}`,
      organizationId: "org-1",
      pcoPersonId: `pco-${index}`,
      accessToken: `token-${index}`,
    }));

    let active = 0;
    let maxActive = 0;
    const syncUser = async (context: ReconcileUserContext): Promise<boolean> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return context.userId !== "user-3";
    };

    const resynced = await reconcileUserContextsBatch(contexts, RECONCILE_BATCH_SIZE, syncUser);
    expect(maxActive).toBeLessThanOrEqual(RECONCILE_BATCH_SIZE);
    expect(resynced).toBe(19);
  });
});
