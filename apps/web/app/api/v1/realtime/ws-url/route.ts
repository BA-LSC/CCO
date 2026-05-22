import { resolveRuntimeWebSocketUrl } from "@/lib/websocket-url";

export function GET() {
  const wsUrl = resolveRuntimeWebSocketUrl({
    nextPublicWsUrl: process.env.NEXT_PUBLIC_WS_URL,
    apiDomain: process.env.API_DOMAIN,
    webUrl: process.env.WEB_URL ?? process.env.NEXT_PUBLIC_WEB_URL,
  });

  return Response.json({ wsUrl });
}
