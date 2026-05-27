import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { CcoD1Database } from "@cco/db";
import { getWorkerD1 } from "../runtime/worker-context";
import * as schema from "./schema";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  return "postgresql://connect:connect@localhost:5432/connect";
}

let postgresDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getPostgresDb(): typeof postgresDb & object {
  if (!postgresDb) {
    const client = postgres(databaseUrl(), {
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
    postgresDb = drizzle(client, { schema });
  }
  return postgresDb;
}

function activeDb(): NonNullable<typeof postgresDb> | CcoD1Database {
  return getWorkerD1() ?? getPostgresDb();
}

/** Postgres by default; D1 when running inside the Cloudflare Worker context. */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const active = activeDb();
    const value = Reflect.get(active, prop, receiver);
    if (typeof value === "function") {
      return value.bind(active);
    }
    return value;
  },
}) as ReturnType<typeof drizzle<typeof schema>>;
