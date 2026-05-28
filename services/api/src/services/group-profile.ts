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

export const IMAGE_REFRESH_BATCH_SIZE = 4;

export async function refreshMissingGroupImages<T extends GroupImageTarget>(
  groupsToRefresh: T[],
  accessToken: string,
): Promise<T[]> {
  const missing = groupsToRefresh.filter((group) => !group.imageUrl);
  if (missing.length === 0) return groupsToRefresh;

  const imageById = new Map<string, string | null>();
  for (let index = 0; index < missing.length; index += IMAGE_REFRESH_BATCH_SIZE) {
    const batch = missing.slice(index, index + IMAGE_REFRESH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((group) =>
        refreshGroupImageFromPco({
          groupId: group.id,
          pcoGroupId: group.pcoGroupId,
          accessToken,
        }).then((imageUrl) => ({ groupId: group.id, imageUrl })),
      ),
    );
    for (let batchIndex = 0; batchIndex < results.length; batchIndex++) {
      const result = results[batchIndex];
      if (result.status === "fulfilled") {
        imageById.set(result.value.groupId, result.value.imageUrl);
      } else {
        console.warn(
          `Could not refresh group image for ${batch[batchIndex].pcoGroupId}:`,
          result.reason,
        );
      }
    }
  }

  if (imageById.size === 0) return groupsToRefresh;

  return groupsToRefresh.map((group) => {
    const imageUrl = imageById.get(group.id);
    if (imageUrl === undefined) return group;
    return { ...group, imageUrl };
  });
}
