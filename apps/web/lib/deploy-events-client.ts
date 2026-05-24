import {
  checkAppVersion,
  clearDeployWait,
  markDeployWait,
  shouldRunAppUpdateChecks,
} from "@/lib/app-update";

const RECONNECT_MS = 5_000;

/** Push deploy overlay updates via SSE instead of waiting for poll intervals. */
export function listenForDeployEvents(): () => void {
  if (typeof window === "undefined" || !shouldRunAppUpdateChecks()) {
    return () => {};
  }

  let source: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;

  const handleSignal = (updating: boolean) => {
    if (updating) {
      markDeployWait();
      return;
    }
    clearDeployWait();
    void checkAppVersion();
  };

  const connect = () => {
    if (stopped) return;
    source?.close();
    source = new EventSource("/api/deploy-events");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { updating?: boolean };
        handleSignal(Boolean(data.updating));
      } catch {
        // ignore malformed payloads
      }
    };

    source.onerror = () => {
      source?.close();
      source = null;
      if (stopped) return;
      reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
    };
  };

  connect();

  return () => {
    stopped = true;
    source?.close();
    source = null;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
  };
}
