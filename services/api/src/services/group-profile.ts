import { fetchGroup, PlanningCenterClient } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { groups } from "../db/schema";

export async function refreshGroupImageFromPco(params: {
  groupId: string;
  pcoGroupId: string;
  accessToken: string;
}): Promise<string | null> {
  const client = new PlanningCenterClient({ accessToken: params.accessToken });
  const remote = await fetchGroup(client, params.pcoGroupId);
  const imageUrl = remote.imageUrl ?? null;

  await db.update(groups).set({ imageUrl }).where(eq(groups.id, params.groupId));

  return imageUrl;
}

type GroupImageTarget = {
  id: string;
  pcoGroupId: string;
  imageUrl?: string | null;
};

export async function refreshMissingGroupImages<T extends GroupImageTarget>(
  groupsToRefresh: T[],
  accessToken: string,
): Promise<T[]> {
  const missing = groupsToRefresh.filter((group) => !group.imageUrl);
  if (missing.length === 0) return groupsToRefresh;

  const imageById = new Map<string, string | null>();
  await Promise.all(
    missing.map(async (group) => {
      try {
        const imageUrl = await refreshGroupImageFromPco({
          groupId: group.id,
          pcoGroupId: group.pcoGroupId,
          accessToken,
        });
        imageById.set(group.id, imageUrl);
      } catch (err) {
        console.warn(`Could not refresh group image for ${group.pcoGroupId}:`, err);
      }
    }),
  );

  if (imageById.size === 0) return groupsToRefresh;

  return groupsToRefresh.map((group) => {
    const imageUrl = imageById.get(group.id);
    if (imageUrl === undefined) return group;
    return { ...group, imageUrl };
  });
}
