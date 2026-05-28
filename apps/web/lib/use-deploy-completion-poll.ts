"use client";

import { useCallback, useEffect, useRef } from "react";
import { isUpdateAvailable } from "@cco/shared";
import {
  applyAppUpdate,
  clearDeployWait,
  DEPLOY_POLL_MS,
  isDeployPending,
  probeServerAppVersion,
} from "@/lib/app-update";
import { resolveDeployStatusMessage } from "@/lib/deploy-phase";
import { getClientBuildVersion } from "@/lib/build-version";

export type DeployReloadValidation = "reload" | "abort";

export type UseDeployCompletionPollOptions = {
  deploying: boolean;
  /** Called when deploy finishes; return "abort" to skip reload (caller clears deploy state). */
  validateBeforeReload?: () => Promise<DeployReloadValidation>;
  /** Live step labels — only used on Admin Settings (inline deploying UI). */
  onDeployStatusMessage?: (message: string) => void;
};

/** True when the server is no longer draining and this tab should reload. */
export function shouldFinishDeployPoll(options: {
  updating: boolean;
  sawDeployUpdating: boolean;
  deployWaitPending: boolean;
  serverVersion: string | null;
  clientVersion: string;
  unavailable: boolean;
}): boolean {
  if (options.updating) return false;
  if (options.sawDeployUpdating || options.deployWaitPending) return true;
  if (options.unavailable || !options.serverVersion || options.clientVersion === "dev") {
    return false;
  }
  return options.serverVersion !== options.clientVersion;
}

export function useDeployCompletionPoll({
  deploying,
  validateBeforeReload,
  onDeployStatusMessage,
}: UseDeployCompletionPollOptions): void {
  const sawDeployUpdatingRef = useRef(false);
  const deployStartedAtRef = useRef<number | null>(null);

  const refreshDeployStatusMessage = useCallback(
    (updating: boolean, deployPhase: string | null) => {
      const elapsedMs = deployStartedAtRef.current
        ? Date.now() - deployStartedAtRef.current
        : 0;
      const message = resolveDeployStatusMessage({
        phase: deployPhase,
        updating,
        elapsedMs,
      });
      onDeployStatusMessage?.(message);
    },
    [onDeployStatusMessage],
  );

  useEffect(() => {
    if (!deploying) {
      deployStartedAtRef.current = null;
      sawDeployUpdatingRef.current = false;
      return;
    }

    if (deployStartedAtRef.current === null) {
      deployStartedAtRef.current = Date.now();
    }

    let cancelled = false;

    const pollUntilReady = async () => {
      const { updating, version: serverVersion, unavailable, deployPhase } =
        await probeServerAppVersion();
      if (cancelled) return;
      if (onDeployStatusMessage) {
        refreshDeployStatusMessage(updating, deployPhase);
      }
      if (updating) {
        sawDeployUpdatingRef.current = true;
        return;
      }

      const clientVersion = getClientBuildVersion();
      if (
        !shouldFinishDeployPoll({
          updating,
          sawDeployUpdating: sawDeployUpdatingRef.current,
          deployWaitPending: isDeployPending(),
          serverVersion,
          clientVersion,
          unavailable,
        })
      ) {
        return;
      }
      sawDeployUpdatingRef.current = true;

      if (validateBeforeReload) {
        const result = await validateBeforeReload();
        if (cancelled) return;
        if (result === "abort") return;
      }

      void applyAppUpdate();
    };

    void pollUntilReady();
    const intervalId = window.setInterval(() => void pollUntilReady(), DEPLOY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deploying, refreshDeployStatusMessage, validateBeforeReload]);
}

/** Shared post-deploy validation used by Admin Updates. */
export function validateUpdatesReload(
  status: {
    lastApplyError: string | null;
    currentVersion: string | null;
    latestVersion: string | null;
  } | null,
  onError: (message: string) => void,
): DeployReloadValidation {
  if (!status) return "reload";
  if (status.lastApplyError) {
    clearDeployWait();
    onError(`Apply failed: ${status.lastApplyError}`);
    return "abort";
  }
  if (
    status.latestVersion != null &&
    isUpdateAvailable(status.currentVersion, status.latestVersion)
  ) {
    clearDeployWait();
    onError(
      "Deploy finished but the release is still pending. Check for updates and try Apply again.",
    );
    return "abort";
  }
  return "reload";
}
