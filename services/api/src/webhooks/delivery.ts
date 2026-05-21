import { webhookDeliveries } from "../db/schema";
import { db } from "../db";

export async function recordWebhookDelivery(params: {
  deliveryId: string;
  eventType: string;
}): Promise<"new" | "duplicate"> {
  const inserted = await db
    .insert(webhookDeliveries)
    .values({
      deliveryId: params.deliveryId,
      eventType: params.eventType,
    })
    .onConflictDoNothing({ target: webhookDeliveries.deliveryId })
    .returning({ id: webhookDeliveries.id });

  return inserted[0] ? "new" : "duplicate";
}
