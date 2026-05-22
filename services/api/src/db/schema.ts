import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  pcoOrganizationId: text("pco_organization_id").notNull().unique(),
  churchCenterSubdomain: text("church_center_subdomain"),
  pcoClientId: text("pco_client_id"),
  pcoClientSecretEnc: text("pco_client_secret_enc"),
  pcoWebhookSecretEnc: text("pco_webhook_secret_enc"),
  pcoWebRedirectUri: text("pco_web_redirect_uri"),
  pcoWebhookUrl: text("pco_webhook_url"),
  pcoOauthScope: text("pco_oauth_scope").notNull().default("people groups services"),
  setupCompletedAt: timestamp("setup_completed_at"),
  setupByUserId: uuid("setup_by_user_id"),
  setupSessionTokenHash: text("setup_session_token_hash"),
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKeyEnc: text("vapid_private_key_enc"),
  vapidSubject: text("vapid_subject"),
  giphyApiKeyEnc: text("giphy_api_key_enc"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoPersonId: text("pco_person_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    theme: text("theme").notNull().default("1"),
    siteAdministrator: boolean("site_administrator").notNull().default(false),
    statusPreset: text("status_preset").notNull().default("active"),
    statusMessage: text("status_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_org_person").on(t.organizationId, t.pcoPersonId)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoGroupId: text("pco_group_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    archivedAt: timestamp("archived_at"),
  },
  (t) => [uniqueIndex("groups_org_pco").on(t.organizationId, t.pcoGroupId)],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => groups.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("membership_group_user").on(t.groupId, t.userId)],
);

export const mobileAuthCodes = pgTable("mobile_auth_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  sessionToken: text("session_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userPcoCredentials = pgTable("user_pco_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("push_tokens_user_token").on(t.userId, t.expoPushToken)],
);

export const webPushSubscriptions = pgTable(
  "web_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("web_push_subscriptions_user_endpoint").on(t.userId, t.endpoint)],
);

export const serviceTeams = pgTable(
  "service_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    pcoTeamId: text("pco_team_id").notNull(),
    name: text("name").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("service_teams_org_pco").on(t.organizationId, t.pcoTeamId)],
);

export const serviceTeamMemberships = pgTable(
  "service_team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .references(() => serviceTeams.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("service_team_membership_unique").on(t.teamId, t.userId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").references(() => groups.id),
    serviceTeamId: uuid("service_team_id").references(() => serviceTeams.id),
    dmPairKey: text("dm_pair_key"),
    slug: text("slug").notNull().default("general"),
    title: text("title").notNull(),
    leaderOnly: boolean("leader_only").notNull().default(false),
    archivedAt: timestamp("archived_at"),
  },
  (t) => [
    uniqueIndex("conversations_group_slug").on(t.groupId, t.slug),
    uniqueIndex("conversations_dm_pair_key").on(t.dmPairKey),
  ],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    muted: boolean("muted").notNull().default(false),
    lastReadAt: timestamp("last_read_at"),
  },
  (t) => [uniqueIndex("conversation_members_unique").on(t.conversationId, t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id)
      .notNull(),
    authorId: uuid("author_id")
      .references(() => users.id)
      .notNull(),
    body: text("body").notNull().default(""),
    attachmentUrl: text("attachment_url"),
    messageType: text("message_type").notNull().default("text"),
    clientMessageId: text("client_message_id").notNull(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("messages_idempotent").on(t.conversationId, t.clientMessageId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("webhook_deliveries_delivery_id").on(t.deliveryId)],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .references(() => messages.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("message_reactions_unique").on(t.messageId, t.userId, t.emoji)],
);
