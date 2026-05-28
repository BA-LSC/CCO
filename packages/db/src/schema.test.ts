import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import {
  D1_TABLE_COUNT,
  getD1IncrementalMigrationFilenames,
  getD1MigrationSqlFiles,
  getD1MigrationsFolder,
  organizations,
  users,
  messages,
  conversations,
} from "./index.js";
import { d1Tables } from "./schema.d1.js";
import { fetchLastMessagesForConversationsD1 } from "./queries/unread.d1.js";

function applyBaselineSqlite(db: Database): void {
  const path = getD1MigrationSqlFiles()[0]!;
  db.exec(readFileSync(path, "utf8"));
  const folder = getD1MigrationsFolder();
  const gitRepoMigration = `${folder}/0003_org_git_repo_url.sql`;
  db.exec(readFileSync(gitRepoMigration, "utf8"));
  const secretsStoreMigration = `${folder}/0004_secrets_store.sql`;
  db.exec(readFileSync(secretsStoreMigration, "utf8"));
  const autoUpdateIntervalMigration = `${folder}/0005_auto_update_check_interval.sql`;
  db.exec(readFileSync(autoUpdateIntervalMigration, "utf8"));
}

describe("D1 schema", () => {
  test("exports 18 tables", () => {
    expect(Object.keys(d1Tables)).toHaveLength(D1_TABLE_COUNT);
    expect(D1_TABLE_COUNT).toBe(18);
  });

  test("baseline migration path exists", () => {
    const folder = getD1MigrationsFolder();
    expect(folder.endsWith("drizzle/d1")).toBe(true);
    const files = getD1MigrationSqlFiles();
    expect(files).toHaveLength(1);
    expect(files[0]!.endsWith("0000_d1_baseline.sql")).toBe(true);
  });

  test("round-trip insert and select on organizations and users", () => {
    const sqlite = new Database(":memory:");
    applyBaselineSqlite(sqlite);
    const db = drizzle(sqlite);

    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = Date.now();

    db.insert(organizations)
      .values({
        id: orgId,
        name: "Test Church",
        pcoOrganizationId: "pco-org-1",
        createdAt: new Date(now),
      })
      .run();

    db.insert(users)
      .values({
        id: userId,
        organizationId: orgId,
        pcoPersonId: "person-1",
        email: "test@example.com",
        displayName: "Test User",
        createdAt: new Date(now),
      })
      .run();

    const row = db.select().from(users).where(eq(users.id, userId)).get();
    expect(row?.displayName).toBe("Test User");
    expect(row?.organizationId).toBe(orgId);
  });
});

describe("fetchLastMessagesForConversationsD1", () => {
  test("returns latest non-deleted message per conversation", async () => {
    const sqlite = new Database(":memory:");
    applyBaselineSqlite(sqlite);
    const db = drizzle(sqlite);

    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const convA = crypto.randomUUID();
    const convB = crypto.randomUUID();
    const t0 = Date.now();

    db.insert(organizations)
      .values({
        id: orgId,
        name: "Church",
        pcoOrganizationId: "pco-1",
        createdAt: new Date(t0),
      })
      .run();
    db.insert(users)
      .values({
        id: userId,
        organizationId: orgId,
        pcoPersonId: "p1",
        email: "a@test.com",
        displayName: "Alice",
        createdAt: new Date(t0),
      })
      .run();
    db.insert(conversations)
      .values([
        {
          id: convA,
          dmPairKey: "a|b",
          title: "DM A",
        },
        {
          id: convB,
          dmPairKey: "c|d",
          title: "DM B",
        },
      ])
      .run();

    db.insert(messages)
      .values([
        {
          id: crypto.randomUUID(),
          conversationId: convA,
          authorId: userId,
          body: "older",
          clientMessageId: "c1",
          createdAt: new Date(t0 - 1000),
        },
        {
          id: crypto.randomUUID(),
          conversationId: convA,
          authorId: userId,
          body: "newest",
          clientMessageId: "c2",
          createdAt: new Date(t0),
        },
        {
          id: crypto.randomUUID(),
          conversationId: convA,
          authorId: userId,
          body: "deleted",
          clientMessageId: "c3",
          deletedAt: new Date(t0),
          createdAt: new Date(t0 + 1000),
        },
        {
          id: crypto.randomUUID(),
          conversationId: convB,
          authorId: userId,
          body: "only",
          clientMessageId: "c4",
          createdAt: new Date(t0),
        },
      ])
      .run();

    const result = await fetchLastMessagesForConversationsD1(db as never, [convA, convB]);

    expect(result.get(convA)?.body).toBe("newest");
    expect(result.get(convB)?.body).toBe("only");
  });
});
