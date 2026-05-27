import * as d1Schema from "@cco/db/schema";
import * as pgSchema from "./schema.pg.js";

const useD1Schema = process.env.CCO_BUNDLE_TARGET === "cloudflare";

function pick<T>(d1: T, pg: T): T {
  return useD1Schema ? d1 : pg;
}

export const organizations = pick(d1Schema.organizations, pgSchema.organizations);
export const users = pick(d1Schema.users, pgSchema.users);
export const groups = pick(d1Schema.groups, pgSchema.groups);
export const groupMemberships = pick(d1Schema.groupMemberships, pgSchema.groupMemberships);
export const mobileAuthCodes = pick(d1Schema.mobileAuthCodes, pgSchema.mobileAuthCodes);
export const userPcoCredentials = pick(d1Schema.userPcoCredentials, pgSchema.userPcoCredentials);
export const pushTokens = pick(d1Schema.pushTokens, pgSchema.pushTokens);
export const webPushSubscriptions = pick(
  d1Schema.webPushSubscriptions,
  pgSchema.webPushSubscriptions,
);
export const serviceTeams = pick(d1Schema.serviceTeams, pgSchema.serviceTeams);
export const serviceTeamMemberships = pick(
  d1Schema.serviceTeamMemberships,
  pgSchema.serviceTeamMemberships,
);
export const conversations = pick(d1Schema.conversations, pgSchema.conversations);
export const conversationMembers = pick(d1Schema.conversationMembers, pgSchema.conversationMembers);
export const messages = pick(d1Schema.messages, pgSchema.messages);
export const webhookDeliveries = pick(d1Schema.webhookDeliveries, pgSchema.webhookDeliveries);
export const messageReactions = pick(d1Schema.messageReactions, pgSchema.messageReactions);
export const callSessions = pick(d1Schema.callSessions, pgSchema.callSessions);
export const callParticipants = pick(d1Schema.callParticipants, pgSchema.callParticipants);
export const callInviteTokens = pick(d1Schema.callInviteTokens, pgSchema.callInviteTokens);
