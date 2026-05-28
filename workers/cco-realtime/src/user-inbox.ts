import { DurableObject } from "cloudflare:workers";

import type { RealtimeEvent } from "./conversation-room";

/** Per-user fanout for sidebar previews, unread, and call toasts across conversations. */
export class UserInbox extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/internal/publish" && request.method === "POST") {
      const event = (await request.json()) as RealtimeEvent;
      return Response.json(this.broadcast(event));
    }

    if (url.pathname === "/subscribe") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(_ws: WebSocket, _message: ArrayBuffer | string): Promise<void> {
    // Inbox clients are receive-only.
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    ws.close(code, reason);
  }

  broadcast(event: RealtimeEvent): { ok: true; delivered: number } {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Dead sockets are removed by the runtime on close.
      }
    }
    return { ok: true, delivered: this.ctx.getWebSockets().length };
  }

  subscriberCount(): number {
    return this.ctx.getWebSockets().length;
  }
}
