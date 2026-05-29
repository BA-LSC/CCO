import { DEFAULT_PCO_OAUTH_SCOPE } from "@cco/pco-client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { organizations } from "../db/schema";
import { isMissingOrgMigrationColumnsError } from "./org-db-migrations";
import { ensureOrganizationSchemaForWrite } from "./org-schema-capabilities";
import { isCloudflareRuntime } from "../runtime/worker-context";

export type InsertOrganizationParams = {
  name: string;
  pcoOrganizationId: string;
  churchCenterSubdomain?: string | null;
  pcoClientId?: string | null;
  pcoClientSecretEnc?: string | null;
  pcoWebhookSecretEnc?: string | null;
  pcoWebRedirectUri?: string | null;
  pcoWebhookUrl?: string | null;
  pcoOauthScope?: string;
};

async function insertOrganizationLegacyD1(params: InsertOrganizationParams): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  const scope = params.pcoOauthScope ?? DEFAULT_PCO_OAUTH_SCOPE;

  await db.execute(sql`
    INSERT INTO "organizations" (
      "id",
      "name",
      "pco_organization_id",
      "church_center_subdomain",
      "pco_oauth_scope",
      "created_at"
    ) VALUES (
      ${id},
      ${params.name},
      ${params.pcoOrganizationId},
      ${params.churchCenterSubdomain ?? null},
      ${scope},
      ${now}
    )
  `);

  return id;
}

/** Insert an organization row after ensuring D1/Postgres columns exist for Drizzle. */
export async function insertOrganization(params: InsertOrganizationParams): Promise<string> {
  try {
    await ensureOrganizationSchemaForWrite();
  } catch (err) {
    console.warn("[organization-write] schema ensure before insert:", err);
  }

  const values = {
    name: params.name,
    pcoOrganizationId: params.pcoOrganizationId,
    churchCenterSubdomain: params.churchCenterSubdomain ?? null,
    ...(params.pcoClientId !== undefined ? { pcoClientId: params.pcoClientId } : {}),
    ...(params.pcoClientSecretEnc !== undefined
      ? { pcoClientSecretEnc: params.pcoClientSecretEnc }
      : {}),
    ...(params.pcoWebhookSecretEnc !== undefined
      ? { pcoWebhookSecretEnc: params.pcoWebhookSecretEnc }
      : {}),
    ...(params.pcoWebRedirectUri !== undefined ? { pcoWebRedirectUri: params.pcoWebRedirectUri } : {}),
    ...(params.pcoWebhookUrl !== undefined ? { pcoWebhookUrl: params.pcoWebhookUrl } : {}),
    ...(params.pcoOauthScope !== undefined ? { pcoOauthScope: params.pcoOauthScope } : {}),
  };

  try {
    const [created] = await db
      .insert(organizations)
      .values(values)
      .returning({ id: organizations.id });
    return created.id;
  } catch (err) {
    if (!isCloudflareRuntime() || !isMissingOrgMigrationColumnsError(err)) {
      throw err;
    }
    console.warn("[organization-write] Drizzle insert failed; using legacy D1 columns:", err);
    return insertOrganizationLegacyD1(params);
  }
}
