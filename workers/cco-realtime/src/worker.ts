import { verifyWsConversationAccess } from "./access";
import { extractBearerToken, verifyWsToken } from "./auth";

type SecretsStoreSecretBinding = { get(): Promise<string> };

export interface Env {
  CONVERSATION_ROOM: DurableObjectNamespace;
  USER_INBOX: DurableObjectNamespace;
  DB: D1Database;
  SESSION_SECRET: SecretsStoreSecretBinding | string;
  CF_INTERNAL_SECRET: SecretsStoreSecretBinding | string;
}

async function resolveSecret(
  binding: SecretsStoreSecretBinding | string,
): Promise<string> {
  if (typeof binding === "string") return binding.trim();
  return ((await binding.get()) ?? "").trim();
}

async function readInternalSecret(env: Env): Promise<string> {
  return resolveSecret(env.CF_INTERNAL_SECRET);
}

function authorizeInternal(request: Request, internalSecret: string): boolean {
  const token = extractBearerToken(request, new URL(request.url));
  if (!token) return false;
  return token === internalSecret;
}

function conversationRoomStub(env: Env, conversationId: string): DurableObjectStub {
  const id = env.CONVERSATION_ROOM.idFromName(conversationId);
  return env.CONVERSATION_ROOM.get(id);
}

function userInboxStub(env: Env, userId: string): DurableObjectStub {
  const id = env.USER_INBOX.idFromName(userId);
  return env.USER_INBOX.get(id);
}

async function handleInboxWsUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = extractBearerToken(request, url);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const sessionSecret = await resolveSecret(env.SESSION_SECRET);
  const wsSession = await verifyWsToken(token, sessionSecret);
  if (!wsSession) return new Response("Unauthorized", { status: 401 });

  const stub = userInboxStub(env, wsSession.userId);
  return stub.fetch(new Request("https://user-inbox/subscribe", request));
}

async function handleWsUpgrade(request: Request, env: Env, url: URL): Promise<Response> {
  const token = extractBearerToken(request, url);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const sessionSecret = await resolveSecret(env.SESSION_SECRET);
  const wsSession = await verifyWsToken(token, sessionSecret);
  if (!wsSession) return new Response("Unauthorized", { status: 401 });

  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return new Response("conversationId required", { status: 400 });

  const canAccess = await verifyWsConversationAccess(env.DB, conversationId, wsSession.userId);
  if (!canAccess) return new Response("Forbidden", { status: 403 });

  const stub = conversationRoomStub(env, conversationId);
  return stub.fetch(new Request("https://conversation-room/subscribe", request));
}

async function handleInternalPublish(request: Request, env: Env): Promise<Response> {
  const internalSecret = await readInternalSecret(env);
  if (!authorizeInternal(request, internalSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: { conversationId?: string };
  try {
    event = (await request.json()) as { conversationId?: string };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const conversationId = event.conversationId?.trim();
  if (!conversationId) {
    return new Response("conversationId required", { status: 400 });
  }

  const stub = conversationRoomStub(env, conversationId);
  return stub.fetch(
    new Request("https://conversation-room/internal/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }),
  );
}

async function handleInternalPublishUser(request: Request, env: Env): Promise<Response> {
  const internalSecret = await readInternalSecret(env);
  if (!authorizeInternal(request, internalSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { userId?: string; [key: string]: unknown };
  try {
    body = (await request.json()) as { userId?: string; [key: string]: unknown };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return new Response("userId required", { status: 400 });
  }

  const stub = userInboxStub(env, userId);
  return stub.fetch(
    new Request("https://user-inbox/internal/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/ws/inbox") {
      return handleInboxWsUpgrade(request, env);
    }

    if (url.pathname === "/v1/ws") {
      return handleWsUpgrade(request, env, url);
    }

    if (url.pathname === "/internal/publish" && request.method === "POST") {
      return handleInternalPublish(request, env);
    }

    if (url.pathname === "/internal/publish-user" && request.method === "POST") {
      return handleInternalPublishUser(request, env);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "cco-realtime" });
    }

    return new Response("Not found", { status: 404 });
  },
};
