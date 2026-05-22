import { mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveUploadFile } from "./lib/serve-upload";
import { isDeployDraining } from "./lib/deploy-status";
import { getUploadDir } from "./lib/uploads";
import { authRouter } from "./routes/auth";
import { mountPcoOAuth } from "./auth/pco-oauth";
import type { AuthVariables } from "./middleware/auth";
import { conversationsRouter } from "./routes/conversations";
import { dmsRouter } from "./routes/dms";
import { groupsRouter } from "./routes/groups";
import { messagesRouter } from "./routes/messages";
import { pushRouter } from "./routes/push";
import { sessionRouter } from "./routes/session";
import { servicesRouter } from "./routes/services";
import { uploadsRouter } from "./routes/uploads";
import { configurePubSub } from "./realtime/pubsub";
import { setupRouter } from "./routes/setup";
import { settingsRouter } from "./routes/settings";
import { unreadRouter } from "./routes/unread";
import { presenceRouter } from "./routes/presence";
import { webhooksRouter } from "./webhooks/pco";

void mkdir(getUploadDir(), { recursive: true });

configurePubSub();

const app = new Hono<{ Variables: AuthVariables }>();

const corsOrigins = [
  process.env.WEB_URL ?? "http://localhost:3000",
  process.env.MOBILE_ORIGIN ?? "http://localhost:8081",
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return corsOrigins[0];
      return corsOrigins.includes(origin) ? origin : corsOrigins[0];
    },
    credentials: true,
  }),
);

app.get("/health", async (c) => {
  const draining = await isDeployDraining();
  return c.json({ ok: true, draining });
});
app.get("/uploads/:filename", serveUploadFile);
app.route("/v1/uploads", uploadsRouter);
app.route("/auth", authRouter);
mountPcoOAuth(app);
app.route("/v1/groups", groupsRouter);
app.route("/v1/dms", dmsRouter);
app.route("/v1/conversations", conversationsRouter);
app.route("/v1/messages", messagesRouter);
app.route("/v1/session", sessionRouter);
app.route("/v1/push", pushRouter);
app.route("/v1/unread", unreadRouter);
app.route("/v1/services", servicesRouter);
app.route("/v1/setup", setupRouter);
app.route("/v1/settings", settingsRouter);
app.route("/v1/presence", presenceRouter);
app.route("/webhooks", webhooksRouter);

app.onError((err, c) => {
  console.error("Unhandled API error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: message }, 500);
});

export default app;
