import { organizations } from "../db/schema";

/** Columns loaded for configured org reads (requires migrations through 0023). */
export const configuredOrganizationColumns = {
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
  cloudflareAccountId: organizations.cloudflareAccountId,
  realtimeKitAppId: organizations.realtimeKitAppId,
  cloudflareApiTokenEnc: organizations.cloudflareApiTokenEnc,
  realtimeKitPresetHost: organizations.realtimeKitPresetHost,
  realtimeKitPresetMember: organizations.realtimeKitPresetMember,
  realtimeKitPresetGuest: organizations.realtimeKitPresetGuest,
  pcoLastSyncedAt: organizations.pcoLastSyncedAt,
  createdAt: organizations.createdAt,
};

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
  createdAt: Date;
};
