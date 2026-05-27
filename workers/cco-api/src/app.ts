import { Hono } from "hono";
import { cors } from "hono/cors";
import { mountPcoOAuth } from "../../../services/api/src/auth/pco-oauth";
import type { AuthVariables } from "../../../services/api/src/middleware/auth";
import { isDeployDraining } from "../../../services/api/src/lib/deploy-status";
import { serveUploadFile } from "../../../services/api/src/lib/serve-upload";
import { configurePubSub } from "../../../services/api/src/realtime/pubsub";
import { authRouter } from "../../../services/api/src/routes/auth";
import { mountConversationCallRoutes, callsRouter } from "../../../services/api/src/routes/calls";
import { conversationsRouter } from "../../../services/api/src/routes/conversations";
import { dmsRouter } from "../../../services/api/src/routes/dms";
import { groupsRouter } from "../../../services/api/src/routes/groups";
import { internalRouter } from "../../../services/api/src/routes/internal";
import { messagesRouter } from "../../../services/api/src/routes/messages";
import { presenceRouter } from "../../../services/api/src/routes/presence";
import { pushRouter } from "../../../services/api/src/routes/push";
import { servicesRouter } from "../../../services/api/src/routes/services";
import { sessionRouter } from "../../../services/api/src/routes/session";
import { settingsRouter } from "../../../services/api/src/routes/settings";
import { setupRouter } from "../../../services/api/src/routes/setup";
import { unreadRouter } from "../../../services/api/src/routes/unread";
import { uploadsRouter } from "../../../services/api/src/routes/uploads";

configurePubSub();

/** Hono app for Cloudflare Workers — Bun-only routes excluded (see README). */
export function createApp(): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  const corsOrigins = [
    process.env.WEB_URL ?? "http://localhost:3000",
    process.env.MOBILE_ORIGIN ?? "http://localhost:8081",
  ];

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return corsOrigins[0]!;
        return corsOrigins.includes(origin) ? origin : corsOrigins[0]!;
      },
      credentials: true,
    }),
  );

  app.get("/health", async (c) => {
    const draining = await isDeployDraining();
    return c.json({ ok: true, draining, runtime: "cloudflare" });
  });

  app.get("/uploads/:filename", serveUploadFile);
  app.route("/v1/uploads", uploadsRouter);
  app.route("/auth", authRouter);
  mountPcoOAuth(app);
  app.route("/v1/groups", groupsRouter);
  app.route("/v1/dms", dmsRouter);
  mountConversationCallRoutes(conversationsRouter);
  app.route("/v1/conversations", conversationsRouter);
  app.route("/v1/calls", callsRouter);
  app.route("/v1/messages", messagesRouter);
  app.route("/v1/session", sessionRouter);
  app.route("/v1/push", pushRouter);
  app.route("/v1/unread", unreadRouter);
  app.route("/v1/services", servicesRouter);
  app.route("/v1/setup", setupRouter);
  app.route("/v1/settings", settingsRouter);
  app.route("/v1/presence", presenceRouter);
  app.route("/internal", internalRouter);

  app.onError((err, c) => {
    console.error("Unhandled API error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: message }, 500);
  });

  return app;
}
