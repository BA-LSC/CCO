export const PCO_WEBHOOK_SUBSCRIPTIONS = [
  {
    eventType: "groups.v2.events.membership.created",
    label: "Group membership created",
  },
  {
    eventType: "groups.v2.events.membership.updated",
    label: "Group membership updated",
  },
  {
    eventType: "groups.v2.events.membership.destroyed",
    label: "Group membership removed",
  },
  {
    eventType: "people.v2.events.person.created",
    label: "Person created",
  },
  {
    eventType: "people.v2.events.person.updated",
    label: "Person profile updated",
  },
] as const;

export type PcoWebhookSubscription =
  (typeof PCO_WEBHOOK_SUBSCRIPTIONS)[number]["eventType"];

export const PCO_WEBHOOK_EVENT_TYPES = PCO_WEBHOOK_SUBSCRIPTIONS.map(
  (subscription) => subscription.eventType,
) as PcoWebhookSubscription[];
