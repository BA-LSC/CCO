import { z } from "zod";

export const MessageCreateSchema = z
  .object({
    body: z.string().max(10000).default(""),
    clientMessageId: z.string().uuid(),
    attachmentUrl: z.string().url().optional(),
    messageType: z.enum(["text", "image"]).optional(),
  })
  .refine((data) => data.body.trim().length > 0 || data.attachmentUrl, {
    message: "Message must have text or an attachment",
  });

export const GroupRoleSchema = z.enum(["member", "leader", "admin"]);

export type GroupRole = z.infer<typeof GroupRoleSchema>;
