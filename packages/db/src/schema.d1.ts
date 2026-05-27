import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const uuidPrimaryKey = (name: string) =>
  text(name).primaryKey().$defaultFn(() => crypto.randomUUID());

const timestampMs = (name: string) => integer(name, { mode: "timestamp_ms" });

const timestampMsNow = (name: string) =>
  timestampMs(name)
    .notNull()
    .$defaultFn(() => new Date());

export const organizations = sqliteTable("organizations", {
  id: uuidPrimaryKey("id"),
  name: text("name").notNull(),
  pcoOrganizationId: text("pco_organization_id").notNull().unique(),
  churchCenterSubdomain: text("church_center_subdomain"),
  pcoClientId: text("pco_client_id"),
  pcoClientSecretEnc: text("pco_client_secret_enc"),
  pcoWebhookSecretEnc: text("pco_webhook_secret_enc"),
  pcoWebRedirectUri: text("pco_web_redirect_uri"),
  pcoWebhookUrl: text("pco_webhook_url"),
  pcoOauthScope: text("pco_oauth_scope").notNull().default("people groups services"),
  setupCompletedAt: timestampMs("setup_completed_at"),
  setupByUserId: text("setup_by_user_id"),
  setupSessionTokenHash: text("setup_session_token_hash"),
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKeyEnc: text("vapid_private_key_enc"),
  vapidSubject: text("vapid_subject"),
  giphyApiKeyEnc: text("giphy_api_key_enc"),
  cloudflareAccountId: text("cloudflare_account_id"),
  realtimeKitAppId: text("realtime_kit_app_id"),
  cloudflareApiTokenEnc: text("cloudflare_api_token_enc"),
  cloudflareR2BucketName: text("cloudflare_r2_bucket_name"),
  cloudflareR2AccessKeyIdEnc: text("cloudflare_r2_access_key_id_enc"),
  cloudflareR2SecretAccessKeyEnc: text("cloudflare_r2_secret_access_key_enc"),
  cloudflareR2PublicUrl: text("cloudflare_r2_public_url"),
  cloudflareHyperdriveId: text("cloudflare_hyperdrive_id"),
  cloudflareKvPresenceNamespaceId: text("cloudflare_kv_presence_namespace_id"),
  cloudflareKvDeployNamespaceId: text("cloudflare_kv_deploy_namespace_id"),
  cloudflarePushQueueId: text("cloudflare_push_queue_id"),
  cloudflarePlatformProvisionedAt: timestampMs("cloudflare_platform_provisioned_at"),
  realtimeKitPresetHost: text("realtime_kit_preset_host"),
  realtimeKitPresetMember: text("realtime_kit_preset_member"),
  realtimeKitPresetGuest: text("realtime_kit_preset_guest"),
  pcoLastSyncedAt: timestampMs("pco_last_synced_at"),
  installedReleaseVersion: text("installed_release_version"),
  autoUpdateEnabled: integer("auto_update_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  lastUpdateCheckAt: timestampMs("last_update_check_at"),
  createdAt: timestampMsNow("created_at"),
});

export const users = sqliteTable(
  "users",
  {
    id: uuidPrimaryKey("id"),
    organizationId: text("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoPersonId: text("pco_person_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    theme: text("theme").notNull().default("1"),
    siteAdministrator: integer("site_administrator", { mode: "boolean" })
      .notNull()
      .default(false),
    statusPreset: text("status_preset").notNull().default("active"),
    statusMessage: text("status_message"),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [
    uniqueIndex("users_org_person").on(t.organizationId, t.pcoPersonId),
    index("users_pco_person_id_idx").on(t.pcoPersonId),
  ],
);

export const groups = sqliteTable(
  "groups",
  {
    id: uuidPrimaryKey("id"),
    organizationId: text("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoGroupId: text("pco_group_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    archivedAt: timestampMs("archived_at"),
  },
  (t) => [uniqueIndex("groups_org_pco").on(t.organizationId, t.pcoGroupId)],
);

export const groupMemberships = sqliteTable(
  "group_memberships",
  {
    id: uuidPrimaryKey("id"),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"),
    syncedAt: timestampMsNow("synced_at"),
  },
  (t) => [
    uniqueIndex("membership_group_user").on(t.groupId, t.userId),
    index("group_memberships_user_id_idx").on(t.userId),
  ],
);

export const mobileAuthCodes = sqliteTable("mobile_auth_codes", {
  id: uuidPrimaryKey("id"),
  code: text("code").notNull().unique(),
  sessionToken: text("session_token").notNull(),
  expiresAt: timestampMs("expires_at").notNull(),
  usedAt: timestampMs("used_at"),
  createdAt: timestampMsNow("created_at"),
});

export const userPcoCredentials = sqliteTable("user_pco_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestampMs("expires_at"),
  updatedAt: timestampMsNow("updated_at"),
});

export const pushTokens = sqliteTable(
  "push_tokens",
  {
    id: uuidPrimaryKey("id"),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [uniqueIndex("push_tokens_user_token").on(t.userId, t.expoPushToken)],
);

export const webPushSubscriptions = sqliteTable(
  "web_push_subscriptions",
  {
    id: uuidPrimaryKey("id"),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [uniqueIndex("web_push_subscriptions_user_endpoint").on(t.userId, t.endpoint)],
);

export const serviceTeams = sqliteTable(
  "service_teams",
  {
    id: uuidPrimaryKey("id"),
    organizationId: text("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoTeamId: text("pco_team_id").notNull(),
    name: text("name").notNull(),
    serviceTypeNames: text("service_type_names"),
    syncedAt: timestampMsNow("synced_at"),
  },
  (t) => [uniqueIndex("service_teams_org_pco").on(t.organizationId, t.pcoTeamId)],
);

export const serviceTeamMemberships = sqliteTable(
  "service_team_memberships",
  {
    id: uuidPrimaryKey("id"),
    teamId: text("team_id")
      .references(() => serviceTeams.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"),
    syncedAt: timestampMsNow("synced_at"),
  },
  (t) => [uniqueIndex("service_team_membership_unique").on(t.teamId, t.userId)],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: uuidPrimaryKey("id"),
    groupId: text("group_id").references(() => groups.id),
    serviceTeamId: text("service_team_id").references(() => serviceTeams.id),
    dmPairKey: text("dm_pair_key"),
    slug: text("slug").notNull().default("general"),
    title: text("title").notNull(),
    leaderOnly: integer("leader_only", { mode: "boolean" }).notNull().default(false),
    archivedAt: timestampMs("archived_at"),
  },
  (t) => [
    uniqueIndex("conversations_group_slug").on(t.groupId, t.slug),
    uniqueIndex("conversations_dm_pair_key").on(t.dmPairKey),
    index("conversations_group_id_active_idx").on(t.groupId),
  ],
);

export const conversationMembers = sqliteTable(
  "conversation_members",
  {
    id: uuidPrimaryKey("id"),
    conversationId: text("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
    lastReadAt: timestampMs("last_read_at"),
  },
  (t) => [
    uniqueIndex("conversation_members_unique").on(t.conversationId, t.userId),
    index("conversation_members_user_id_idx").on(t.userId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: uuidPrimaryKey("id"),
    conversationId: text("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    authorId: text("author_id")
      .references(() => users.id)
      .notNull(),
    body: text("body").notNull().default(""),
    attachmentUrl: text("attachment_url"),
    messageType: text("message_type").notNull().default("text"),
    clientMessageId: text("client_message_id").notNull(),
    editedAt: timestampMs("edited_at"),
    deletedAt: timestampMs("deleted_at"),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [
    uniqueIndex("messages_idempotent").on(t.conversationId, t.clientMessageId),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
  ],
);

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: uuidPrimaryKey("id"),
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestampMsNow("processed_at"),
  },
  (t) => [uniqueIndex("webhook_deliveries_delivery_id").on(t.deliveryId)],
);

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: uuidPrimaryKey("id"),
    messageId: text("message_id")
      .references(() => messages.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [uniqueIndex("message_reactions_unique").on(t.messageId, t.userId, t.emoji)],
);

export const callSessions = sqliteTable(
  "call_sessions",
  {
    id: uuidPrimaryKey("id"),
    conversationId: text("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    hostUserId: text("host_user_id")
      .references(() => users.id)
      .notNull(),
    realtimeKitMeetingId: text("realtime_kit_meeting_id").notNull(),
    status: text("status").notNull().default("ringing"),
    startedAt: timestampMsNow("started_at"),
    endedAt: timestampMs("ended_at"),
  },
  (t) => [
    index("call_sessions_conversation_id_idx").on(t.conversationId),
    index("call_sessions_realtime_kit_meeting_id_idx").on(t.realtimeKitMeetingId),
  ],
);

export const callParticipants = sqliteTable(
  "call_participants",
  {
    id: uuidPrimaryKey("id"),
    callSessionId: text("call_session_id")
      .references(() => callSessions.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => users.id),
    guestLabel: text("guest_label"),
    realtimeKitParticipantId: text("realtime_kit_participant_id"),
    role: text("role").notNull().default("member"),
    invitedAt: timestampMsNow("invited_at"),
    joinedAt: timestampMs("joined_at"),
    leftAt: timestampMs("left_at"),
  },
  (t) => [
    index("call_participants_call_session_id_idx").on(t.callSessionId),
    index("call_participants_user_id_idx").on(t.userId),
  ],
);

export const callInviteTokens = sqliteTable(
  "call_invite_tokens",
  {
    id: uuidPrimaryKey("id"),
    callSessionId: text("call_session_id")
      .references(() => callSessions.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull(),
    targetUserId: text("target_user_id").references(() => users.id),
    targetEmail: text("target_email"),
    targetDisplayName: text("target_display_name"),
    createdByUserId: text("created_by_user_id")
      .references(() => users.id)
      .notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    revokedAt: timestampMs("revoked_at"),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestampMsNow("created_at"),
  },
  (t) => [index("call_invite_tokens_call_session_id_idx").on(t.callSessionId)],
);

/** All D1 table definitions (18 tables — mirrors Postgres schema in services/api). */
export const d1Tables = {
  organizations,
  users,
  groups,
  groupMemberships,
  mobileAuthCodes,
  userPcoCredentials,
  pushTokens,
  webPushSubscriptions,
  serviceTeams,
  serviceTeamMemberships,
  conversations,
  conversationMembers,
  messages,
  webhookDeliveries,
  messageReactions,
  callSessions,
  callParticipants,
  callInviteTokens,
} as const;

export type D1Schema = typeof d1Tables;
