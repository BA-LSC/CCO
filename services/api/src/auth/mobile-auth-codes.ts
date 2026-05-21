import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { mobileAuthCodes } from "../db/schema";

const CODE_TTL_MS = 5 * 60 * 1000;

export async function createMobileAuthCode(sessionToken: string): Promise<string> {
  const code = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(mobileAuthCodes).values({ code, sessionToken, expiresAt });
  return code;
}

export async function redeemMobileAuthCode(
  code: string,
): Promise<{ sessionToken: string } | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(mobileAuthCodes)
    .where(
      and(
        eq(mobileAuthCodes.code, code),
        isNull(mobileAuthCodes.usedAt),
        gt(mobileAuthCodes.expiresAt, now),
      ),
    )
    .limit(1);

  if (!rows[0]) return null;

  await db
    .update(mobileAuthCodes)
    .set({ usedAt: now })
    .where(eq(mobileAuthCodes.id, rows[0].id));

  return { sessionToken: rows[0].sessionToken };
}
