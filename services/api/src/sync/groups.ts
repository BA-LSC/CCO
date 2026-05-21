import type { SimpleGroup } from "@cco/pco-client";

export type ExistingGroup = { pcoGroupId: string; name: string; imageUrl?: string | null };

export type MergeGroupsResult = {
  toCreate: SimpleGroup[];
  toUpdate: Array<{ pcoGroupId: string; name: string; imageUrl?: string | null }>;
};

export function mergeGroups(
  existing: ExistingGroup[],
  incoming: SimpleGroup[],
): MergeGroupsResult {
  const byId = new Map(existing.map((g) => [g.pcoGroupId, g]));
  const toCreate: SimpleGroup[] = [];
  const toUpdate: Array<{ pcoGroupId: string; name: string; imageUrl?: string | null }> = [];

  for (const group of incoming) {
    const prev = byId.get(group.pcoGroupId);
    if (!prev) {
      toCreate.push(group);
      continue;
    }
    const prevImage = prev.imageUrl ?? null;
    const nextImage = group.imageUrl ?? null;
    if (prev.name !== group.name || prevImage !== nextImage) {
      toUpdate.push({
        pcoGroupId: group.pcoGroupId,
        name: group.name,
        imageUrl: nextImage,
      });
    }
  }

  return { toCreate, toUpdate };
}
