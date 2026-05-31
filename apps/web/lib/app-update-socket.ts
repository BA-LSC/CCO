import { APP_UPDATE_EVENT } from "@/lib/app-update";

/** Drop realtime sockets when a deploy/update starts so clients reconnect after reload. */
export function closeWebSocketOnAppUpdate(getSocket: () => WebSocket | null): () => void {
  if (typeof window === "undefined") return () => {};

  const onUpdating = () => {
    const ws = getSocket();
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };

  window.addEventListener(APP_UPDATE_EVENT, onUpdating);
  return () => window.removeEventListener(APP_UPDATE_EVENT, onUpdating);
}
