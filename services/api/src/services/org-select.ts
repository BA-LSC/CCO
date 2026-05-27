import { organizations } from "../db/schema";

/** Org columns through migration 0020 (safe before RealtimeKit migrations). */
export const configuredOrganizationColumnsLegacy = {
  id: organizations.id,
  name: organizations.name,
  pcoOrganizationId: organizations.pcoOrganizationId,
  churchCenterSubdomain: organizations.churchCenterSubdomain,
  pcoClientId: organizations.pcoClientId,
  pcoClientSecretEnc: organizations.pcoClientSecretEnc,
  pcoWebhookSecretEnc: organizations.pcoWebhookSecretEnc,
  pcoWebRedirectUri: organizations.pcoWebRedirectUri,
  pcoWebhookUrl: organizations.pcoWebhookUrl,
  pcoOauthScope: organizations.pcoOauthScope,
  setupCompletedAt: organizations.setupCompletedAt,
  setupByUserId: organizations.setupByUserId,
  setupSessionTokenHash: organizations.setupSessionTokenHash,
  vapidPublicKey: organizations.vapidPublicKey,
  vapidPrivateKeyEnc: organizations.vapidPrivateKeyEnc,
  vapidSubject: organizations.vapidSubject,
  giphyApiKeyEnc: organizations.giphyApiKeyEnc,
  createdAt: organizations.createdAt,
};

export type ConfiguredOrganizationRowLegacy = {
  id: string;
  name: string;
  pcoOrganizationId: string;
  churchCenterSubdomain: string | null;
  pcoClientId: string | null;
  pcoClientSecretEnc: string | null;
  pcoWebhookSecretEnc: string | null;
  pcoWebRedirectUri: string | null;
  pcoWebhookUrl: string | null;
  pcoOauthScope: string;
  setupCompletedAt: Date | null;
  setupByUserId: string | null;
  setupSessionTokenHash: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKeyEnc: string | null;
  vapidSubject: string | null;
  giphyApiKeyEnc: string | null;
  createdAt: Date;
};

/** Columns loaded for configured org reads (requires migrations through 0023). */
export const configuredOrganizationColumns = {
  ...configuredOrganizationColumnsLegacy,
  cloudflareAccountId: organizations.cloudflareAccountId,
  realtimeKitAppId: organizations.realtimeKitAppId,
  cloudflareApiTokenEnc: organizations.cloudflareApiTokenEnc,
  realtimeKitPresetHost: organizations.realtimeKitPresetHost,
  realtimeKitPresetMember: organizations.realtimeKitPresetMember,
  realtimeKitPresetGuest: organizations.realtimeKitPresetGuest,
  pcoLastSyncedAt: organizations.pcoLastSyncedAt,
  pcoNightlySyncEnabled: organizations.pcoNightlySyncEnabled,
};

export function extendConfiguredOrganizationRow(
  row: ConfiguredOrganizationRowLegacy,
): ConfiguredOrganizationRow {
  return {
    ...row,
    cloudflareAccountId: null,
    realtimeKitAppId: null,
    cloudflareApiTokenEnc: null,
    realtimeKitPresetHost: null,
    realtimeKitPresetMember: null,
    realtimeKitPresetGuest: null,
    pcoLastSyncedAt: null,
    pcoNightlySyncEnabled: true,
  };
}

export type ConfiguredOrganizationRow = {
  id: string;
  name: string;
  pcoOrganizationId: string;
  churchCenterSubdomain: string | null;
  pcoClientId: string | null;
  pcoClientSecretEnc: string | null;
  pcoWebhookSecretEnc: string | null;
  pcoWebRedirectUri: string | null;
  pcoWebhookUrl: string | null;
  pcoOauthScope: string;
  setupCompletedAt: Date | null;
  setupByUserId: string | null;
  setupSessionTokenHash: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKeyEnc: string | null;
  vapidSubject: string | null;
  giphyApiKeyEnc: string | null;
  cloudflareAccountId: string | null;
  realtimeKitAppId: string | null;
  cloudflareApiTokenEnc: string | null;
  realtimeKitPresetHost: string | null;
  realtimeKitPresetMember: string | null;
  realtimeKitPresetGuest: string | null;
  pcoLastSyncedAt: Date | null;
  pcoNightlySyncEnabled: boolean;
  createdAt: Date;
};
