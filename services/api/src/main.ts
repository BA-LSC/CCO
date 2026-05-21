import app from "./app";
import {
  handleWebSocketClose,
  handleWebSocketOpen,
  verifyWsConversationAccess,
  verifyWsToken,
} from "./realtime/ws";

const port = Number(process.env.API_PORT ?? 3001);

if (process.env.NODE_ENV === "production") {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
  }
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
}

const server = Bun.serve({
  port,
  idleTimeout: 120,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/ws") {
      const token =
        url.searchParams.get("token") ?? req.headers.get("Authorization")?.replace("Bearer ", "");
      return handleWsUpgrade(req, srv, token);
    }
    return app.fetch(req, srv);
  },
  websocket: {
    open(ws) {
      handleWebSocketOpen(ws);
    },
    close(ws) {
      handleWebSocketClose(ws);
    },
  },
});

console.log(`CCO API listening on http://localhost:${port}`);

async function handleWsUpgrade(
  req: Request,
  srv: typeof server,
  token: string | null | undefined,
): Promise<Response> {
  const wsSession = await verifyWsToken(token ?? null);
  if (!wsSession) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) return new Response("conversationId required", { status: 400 });

  const canAccess = await verifyWsConversationAccess(conversationId, wsSession.userId);
  if (!canAccess) return new Response("Forbidden", { status: 403 });

  const upgraded = srv.upgrade(req, {
    data: {
      conversationId,
      unsubscribe: () => {},
    },
  });

  if (!upgraded) return new Response("WebSocket upgrade failed", { status: 500 });
  return new Response(null, { status: 101 });
}

export { server };
