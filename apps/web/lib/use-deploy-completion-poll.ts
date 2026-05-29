"use client";

import { useCallback, useEffect, useRef } from "react";
import { isUpdateAvailable, releaseShasEqual } from "@cco/shared";
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

export type UpdatesReloadStatus = {
  lastApplyError: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
};

export type ValidateUpdatesReloadOptions = {
  /** Release SHA returned from POST /updates/apply (202 accepted or 200 complete). */
  expectedAppliedVersion?: string | null;
};

const DEPLOY_STATUS_RETRY_MS = 400;
const DEPLOY_STATUS_MAX_ATTEMPTS = 40;

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
  const finishingDeployRef = useRef(false);

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
      finishingDeployRef.current = false;
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
      if (finishingDeployRef.current) return;
      finishingDeployRef.current = true;
      sawDeployUpdatingRef.current = true;

      try {
        if (validateBeforeReload) {
          const result = await validateBeforeReload();
          if (cancelled) return;
          if (result === "abort") {
            return;
          }
        }

        await applyAppUpdate();
      } finally {
        if (!cancelled) {
          finishingDeployRef.current = false;
        }
      }
    };

    void pollUntilReady();
    const intervalId = window.setInterval(() => void pollUntilReady(), DEPLOY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deploying, refreshDeployStatusMessage, validateBeforeReload]);
}

/** True when org updates status reflects a finished apply (installed matches target or no update flag). */
export function shouldAcceptUpdatesReload(
  status: UpdatesReloadStatus | null,
  expectedAppliedVersion?: string | null,
): boolean {
  if (!status || status.lastApplyError) return false;

  const expected = expectedAppliedVersion?.trim() || null;
  if (!isUpdateAvailable(status.currentVersion, status.latestVersion)) {
    return true;
  }
  if (expected && releaseShasEqual(status.currentVersion, expected)) {
    return true;
  }
  if (expected && status.latestVersion && releaseShasEqual(status.latestVersion, expected)) {
    return true;
  }
  return false;
}

/** Poll updates status until the DB/catalog catches up after a background apply (202). */
export async function waitForUpdatesStatusAfterDeploy<T extends UpdatesReloadStatus>(
  loadStatus: () => Promise<T>,
  options?: ValidateUpdatesReloadOptions,
): Promise<T | null> {
  const expected = options?.expectedAppliedVersion?.trim() || null;
  let last: T | null = null;

  for (let attempt = 0; attempt < DEPLOY_STATUS_MAX_ATTEMPTS; attempt++) {
    last = await loadStatus();
    if (shouldAcceptUpdatesReload(last, expected)) {
      return last;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, DEPLOY_STATUS_RETRY_MS);
    });
  }

  return last;
}

/** Shared post-deploy validation used by Admin Updates. */
export function validateUpdatesReload(
  status: UpdatesReloadStatus | null,
  onError: (message: string) => void,
  options?: ValidateUpdatesReloadOptions,
): DeployReloadValidation {
  if (!status) return "reload";
  if (status.lastApplyError) {
    clearDeployWait();
    onError(`Apply failed: ${status.lastApplyError}`);
    return "abort";
  }
  if (!shouldAcceptUpdatesReload(status, options?.expectedAppliedVersion)) {
    clearDeployWait();
    onError(
      "Deploy finished but the release is still pending. Check for updates and try Apply again.",
    );
    return "abort";
  }
  return "reload";
}
