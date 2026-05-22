import { eq, inArray } from "drizzle-orm";
import { parseUserStatusPreset, type UserStatus, type UserStatusPreset } from "@cco/shared";
import { db } from "../db";
import { users } from "../db/schema";

export async function getUsersStatus(userIds: string[]): Promise<Record<string, UserStatus>> {
  if (userIds.length === 0) return {};

  const rows = await db
    .select({
      id: users.id,
      statusPreset: users.statusPreset,
      statusMessage: users.statusMessage,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  const statuses: Record<string, UserStatus> = {};
  for (const row of rows) {
    statuses[row.id] = {
      preset: parseUserStatusPreset(row.statusPreset),
      message: row.statusMessage,
    };
  }

  return statuses;
}

export async function updateUserStatus(params: {
  userId: string;
  preset?: UserStatusPreset;
  message?: string | null;
}): Promise<UserStatus> {
  const updates: { statusPreset?: UserStatusPreset; statusMessage?: string | null } = {};

  if (params.preset !== undefined) {
    updates.statusPreset = params.preset;
  }
  if (params.message !== undefined) {
    const trimmed = params.message?.trim() ?? "";
    updates.statusMessage = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(updates).length === 0) {
    const existing = await db
      .select({ statusPreset: users.statusPreset, statusMessage: users.statusMessage })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    const row = existing[0];
    return {
      preset: parseUserStatusPreset(row?.statusPreset),
      message: row?.statusMessage ?? null,
    };
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, params.userId))
    .returning({ statusPreset: users.statusPreset, statusMessage: users.statusMessage });

  return {
    preset: parseUserStatusPreset(updated.statusPreset),
    message: updated.statusMessage,
  };
}
