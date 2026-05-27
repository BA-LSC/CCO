import { sql, type SQL } from "drizzle-orm";
import type { CcoD1Database } from "../client.js";

export type LastConversationMessage = {
  authorId: string;
  createdAt: Date;
  body: string;
  messageType: string;
  attachmentUrl: string | null;
};

/**
 * SQLite/D1 equivalent of Postgres `DISTINCT ON (conversation_id)` in services/api unread.ts.
 * Uses ROW_NUMBER() window — supported by D1 (SQLite 3.39+).
 */
export function lastMessagesForConversationsSql(conversationIds: string[]): SQL {
  if (conversationIds.length === 0) {
    throw new Error("conversationIds must not be empty");
  }

  return sql`
    SELECT conversation_id, author_id, created_at, body, message_type, attachment_url
    FROM (
      SELECT
        conversation_id,
        author_id,
        created_at,
        body,
        message_type,
        attachment_url,
        ROW_NUMBER() OVER (
          PARTITION BY conversation_id
          ORDER BY created_at DESC
        ) AS rn
      FROM messages
      WHERE conversation_id IN (${sql.join(
        conversationIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        AND deleted_at IS NULL
    )
    WHERE rn = 1
  `;
}

export async function fetchLastMessagesForConversationsD1(
  db: CcoD1Database,
  conversationIds: string[],
): Promise<Map<string, LastConversationMessage>> {
  const result = new Map<string, LastConversationMessage>();
  if (conversationIds.length === 0) return result;

  const rows = await db.all(lastMessagesForConversationsSql(conversationIds));

  for (const row of rows as Array<{
    conversation_id: string;
    author_id: string;
    created_at: number | Date;
    body: string;
    message_type: string;
    attachment_url: string | null;
  }>) {
    const createdAt =
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    result.set(row.conversation_id, {
      authorId: row.author_id,
      createdAt,
      body: row.body,
      messageType: row.message_type,
      attachmentUrl: row.attachment_url,
    });
  }

  return result;
}
