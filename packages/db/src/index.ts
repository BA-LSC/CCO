export {
  createD1Client,
  createDb,
  getD1MigrationsFolder,
  getD1MigrationSqlFiles,
  getD1IncrementalMigrationFilenames,
  readD1BaselineSql,
  runMigrations,
  applyBaselineMigration,
  type CcoD1Database,
} from "./client.js";

export {
  d1Tables,
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
  type D1Schema,
} from "./schema.d1.js";

export {
  fetchLastMessagesForConversationsD1,
  lastMessagesForConversationsSql,
  type LastConversationMessage,
} from "./queries/unread.d1.js";

export {
  ensureCloudflareOrganizationColumns,
  ensureCloudflarePlatformColumns,
  ensureCallSessionSchema,
  callParticipantsTableExists,
  ensureExtendedOrganizationSchema,
  hasExtendedOrganizationColumns,
  resetExtendedOrganizationColumnsCache,
} from "./queries/org-schema.d1.js";

export const D1_TABLE_COUNT = 18;
