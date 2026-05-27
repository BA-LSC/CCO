import {
  applyAppUpdate,
  checkAppVersion,
  clearDeployWait,
  DEPLOY_POLL_MS,
  isDeployPending,
  markDeployWait,
  probeServerAppVersion,
  shouldRunAppUpdateChecks,
} from "@/lib/app-update";

const RECONNECT_MS = 5_000;

function isUpdateOverlayVisible(): boolean {
  return (
    typeof document !== "undefined" &&
    Boolean(document.getElementById("cco-app-update-overlay"))
  );
}

/** Finish a deploy: full reload when the update screen was shown, otherwise version-check only. */
async function finishDeployUpdate(): Promise<void> {
  if (isDeployPending() || isUpdateOverlayVisible()) {
    if (!isDeployPending()) {
      markDeployWait();
    }
    await applyAppUpdate();
    return;
  }
  clearDeployWait();
  await checkAppVersion();
}

/** Push deploy overlay updates via SSE with fast polling as a fallback. */
export function listenForDeployEvents(): () => void {
  if (typeof window === "undefined" || !shouldRunAppUpdateChecks()) {
    return () => {};
  }

  let source: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let pollTimer: number | null = null;
  let stopped = false;
  let finishing = false;

  const handleSignal = (updating: boolean) => {
    if (updating) {
      markDeployWait();
      return;
    }
    void finishDeployUpdateSafely();
  };

  const finishDeployUpdateSafely = async () => {
    if (finishing) return;
    finishing = true;
    try {
      await finishDeployUpdate();
    } finally {
      finishing = false;
    }
  };

  const pollDeployState = async () => {
    const { updating } = await probeServerAppVersion();
    if (updating) {
      markDeployWait();
      return;
    }
    if (isDeployPending()) {
      await finishDeployUpdateSafely();
    }
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
  void pollDeployState();
  pollTimer = window.setInterval(() => void pollDeployState(), DEPLOY_POLL_MS);

  return () => {
    stopped = true;
    source?.close();
    source = null;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (pollTimer !== null) window.clearInterval(pollTimer);
  };
}
