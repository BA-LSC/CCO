import type { SQL } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/schema";
import { ensureCloudflareOrganizationColumnsBestEffort } from "./org-schema-capabilities";
import {
  configuredOrganizationColumns,
  type ConfiguredOrganizationRow,
} from "./org-select";

export function resolveDeploymentHostnames(): {
  apiHost: string | null;
  chatHost: string | null;
} {
  const apiHost =
    process.env.API_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase() ||
    null;
  const webUrl = process.env.WEB_URL?.trim();
  let chatHost: string | null = null;
  if (webUrl) {
    try {
      chatHost = new URL(webUrl).hostname.toLowerCase();
    } catch {
      chatHost = null;
    }
  }
  return { apiHost, chatHost };
}

export function orgMatchesDeploymentHostnames(
  org: Pick<ConfiguredOrganizationRow, "pcoWebRedirectUri" | "pcoWebhookUrl">,
  hosts: { apiHost: string | null; chatHost: string | null },
): boolean {
  if (!hosts.apiHost && !hosts.chatHost) return false;
  try {
    const webhookHost = org.pcoWebhookUrl
      ? new URL(org.pcoWebhookUrl).hostname.toLowerCase()
      : null;
    const redirectHost = org.pcoWebRedirectUri
      ? new URL(org.pcoWebRedirectUri).hostname.toLowerCase()
      : null;
    if (hosts.apiHost && webhookHost !== hosts.apiHost) return false;
    if (hosts.chatHost && redirectHost !== hosts.chatHost) return false;
    return true;
  } catch {
    return false;
  }
}

function isEstablishedOrganization(row: ConfiguredOrganizationRow): boolean {
  const pcoOrgId = row.pcoOrganizationId?.trim();
  return Boolean(
    row.setupCompletedAt &&
      pcoOrgId &&
      !pcoOrgId.startsWith("pending-") &&
      row.pcoClientId,
  );
}

export function pickConfiguredOrganizationRow(
  rows: ConfiguredOrganizationRow[],
): ConfiguredOrganizationRow | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const hosts = resolveDeploymentHostnames();
  const hostnameMatches = rows.filter((row) => orgMatchesDeploymentHostnames(row, hosts));
  const candidates = hostnameMatches.length > 0 ? hostnameMatches : rows;

  const established = candidates.filter(isEstablishedOrganization);
  if (established.length > 0) return established[0];

  const withPcoOrg = candidates.find(
    (row) => row.pcoOrganizationId?.trim() && !row.pcoOrganizationId.startsWith("pending-"),
  );
  if (withPcoOrg) return withPcoOrg;

  return candidates[0];
}

export async function selectConfiguredOrganizationRow(
  where: SQL | undefined,
): Promise<ConfiguredOrganizationRow | null> {
  await ensureCloudflareOrganizationColumnsBestEffort();

  const rows = await db
    .select(configuredOrganizationColumns)
    .from(organizations)
    .where(where)
    .orderBy(desc(organizations.lastUpdateCheckAt), desc(organizations.setupCompletedAt));

  return pickConfiguredOrganizationRow(rows);
}
