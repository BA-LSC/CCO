import { verifyWsConversationAccess } from "./access";
import { extractBearerToken, verifyWsToken } from "./auth";

export interface Env {
  CONVERSATION_ROOM: DurableObjectNamespace;
  DB: D1Database;
  SESSION_SECRET: string;
  CF_INTERNAL_SECRET: string;
}

function readInternalSecret(env: Env): string {
  return env.CF_INTERNAL_SECRET.trim();
}

function authorizeInternal(request: Request, env: Env): boolean {
  const token = extractBearerToken(request, new URL(request.url));
  if (!token) return false;
  return token === readInternalSecret(env);
}

function conversationRoomStub(env: Env, conversationId: string): DurableObjectStub {
  const id = env.CONVERSATION_ROOM.idFromName(conversationId);
  return env.CONVERSATION_ROOM.get(id);
}

async function handleWsUpgrade(request: Request, env: Env, url: URL): Promise<Response> {
  const token = extractBearerToken(request, url);
  if (!token) return new Response("Unauthorized", { status: 401 });

  const wsSession = await verifyWsToken(token, env.SESSION_SECRET);
  if (!wsSession) return new Response("Unauthorized", { status: 401 });

  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return new Response("conversationId required", { status: 400 });

  const canAccess = await verifyWsConversationAccess(env.DB, conversationId, wsSession.userId);
  if (!canAccess) return new Response("Forbidden", { status: 403 });

  const stub = conversationRoomStub(env, conversationId);
  return stub.fetch(new Request("https://conversation-room/subscribe", request));
}

async function handleInternalPublish(request: Request, env: Env): Promise<Response> {
  if (!authorizeInternal(request, env)) {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/v1/ws") {
      return handleWsUpgrade(request, env, url);
    }

    if (url.pathname === "/internal/publish" && request.method === "POST") {
      return handleInternalPublish(request, env);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "cco-realtime" });
    }

    return new Response("Not found", { status: 404 });
  },
};
