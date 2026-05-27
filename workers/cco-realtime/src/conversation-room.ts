import { DurableObject } from "cloudflare:workers";

export type RealtimeEvent = {
  type: string;
  conversationId: string;
  [key: string]: unknown;
};

type Subscriber = WebSocket;

export class ConversationRoom extends DurableObject {
  private subscribers = new Set<Subscriber>();

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
      this.subscribers.add(server);
      server.addEventListener("close", () => this.subscribers.delete(server));
      server.addEventListener("error", () => this.subscribers.delete(server));
      server.accept();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  broadcast(event: RealtimeEvent): { ok: true; delivered: number } {
    const payload = JSON.stringify(event);
    for (const ws of this.subscribers) {
      try {
        ws.send(payload);
      } catch {
        this.subscribers.delete(ws);
      }
    }
    return { ok: true, delivered: this.subscribers.size };
  }

  /** Test helper — subscriber count without WebSocket I/O. */
  subscriberCount(): number {
    return this.subscribers.size;
  }
}
