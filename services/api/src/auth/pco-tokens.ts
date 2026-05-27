import type { TokenResponse } from "@cco/pco-client";
import { refreshAccessToken } from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { userPcoCredentials } from "../db/schema";
import { decryptSecret, encryptSecret } from "./token-crypto";

import { getActiveOrgOAuthCredentials } from "../services/org-oauth";

function expiresAtFromToken(token: TokenResponse): Date | null {
  if (!token.expires_in) return null;
  return new Date(Date.now() + token.expires_in * 1000);
}

export async function savePcoTokens(userId: string, token: TokenResponse): Promise<void> {
  const expiresAt = expiresAtFromToken(token);
  const updatedAt = new Date();
  await db
    .insert(userPcoCredentials)
    .values({
      userId,
      accessToken: encryptSecret(token.access_token),
      refreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
      expiresAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: userPcoCredentials.userId,
      set: {
        accessToken: encryptSecret(token.access_token),
        refreshToken: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

export async function getPcoAccessToken(userId: string): Promise<string | null> {
  let row;
  try {
    row = await db
      .select()
      .from(userPcoCredentials)
      .where(eq(userPcoCredentials.userId, userId))
      .limit(1);
  } catch (err) {
    console.error("getPcoAccessToken DB error:", err);
    return null;
  }

  const creds = row[0];
  if (!creds) return null;

  const expiresSoon =
    creds.expiresAt && creds.expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (expiresSoon && creds.refreshToken) {
    try {
      const oauth = await getActiveOrgOAuthCredentials();
      if (!oauth) return decryptSecret(creds.accessToken);
      const refreshed = await refreshAccessToken({
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        refreshToken: decryptSecret(creds.refreshToken),
      });
      await savePcoTokens(userId, refreshed);
      return refreshed.access_token;
    } catch (err) {
      console.warn("PCO token refresh failed:", err);
    }
  }

  return decryptSecret(creds.accessToken);
}

export async function deletePcoTokens(userId: string): Promise<void> {
  await db.delete(userPcoCredentials).where(eq(userPcoCredentials.userId, userId));
}
