import { describe, expect, mock, test } from "bun:test";
import {
  RECONCILE_BATCH_SIZE,
  reconcileStaleMemberships,
  reconcileTeamMembershipsForUser,
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

  test("counts successful team reconcile via injectable syncUser", async () => {
    const contexts: ReconcileUserContext[] = [
      {
        userId: "user-a",
        organizationId: "org-1",
        pcoPersonId: "pco-a",
        accessToken: "token-a",
      },
      {
        userId: "user-b",
        organizationId: "org-1",
        pcoPersonId: "pco-b",
        accessToken: "token-b",
      },
    ];

    const syncedUsers: string[] = [];
    const syncUser = async (context: ReconcileUserContext): Promise<boolean> => {
      syncedUsers.push(context.userId);
      return context.userId === "user-a";
    };

    const resynced = await reconcileUserContextsBatch(contexts, RECONCILE_BATCH_SIZE, syncUser);
    expect(syncedUsers).toEqual(["user-a", "user-b"]);
    expect(resynced).toBe(1);
  });
});

describe("reconcileTeamMembershipsForUser", () => {
  test("syncs teams then throttled leader rosters", async () => {
    let teamsSynced = false;
    let rostersSynced = false;

    mock.module("../services/service-teams", () => ({
      syncServiceTeamsFromPco: async () => {
        teamsSynced = true;
        return { created: 0, removed: 0, total: 0 };
      },
      syncLeaderTeamRostersIfStale: async () => {
        rostersSynced = true;
        return { teamsSynced: 0, upserted: 0 };
      },
    }));

    const { reconcileTeamMembershipsForUser: reconcileTeams } = await import("./reconcile");

    const ok = await reconcileTeams({
      userId: "user-1",
      organizationId: "org-1",
      pcoPersonId: "pco-1",
      accessToken: "token-1",
    });

    expect(ok).toBe(true);
    expect(teamsSynced).toBe(true);
    expect(rostersSynced).toBe(true);
  });
});
