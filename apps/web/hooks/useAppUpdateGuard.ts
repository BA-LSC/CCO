import { useEffect, useState } from "react";
import {
  APP_UPDATE_EVENT,
  isAppUpdateInProgress,
  isDeployWaitActive,
} from "@/lib/app-update";

/** Tracks deploy/update state set by the head bootstrap before React hydrates. */
export function useAppUpdateGuard(): boolean {
  const [blocked, setBlocked] = useState(() => isAppUpdateInProgress());

  useEffect(() => {
    const sync = () => setBlocked(isAppUpdateInProgress() || isDeployWaitActive());
    sync();
    window.addEventListener(APP_UPDATE_EVENT, sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener(APP_UPDATE_EVENT, sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return blocked;
}
