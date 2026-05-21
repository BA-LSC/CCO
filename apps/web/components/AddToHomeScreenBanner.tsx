"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dismissAddToHomeScreen,
  getAddToHomeScreenPlatform,
  shouldShowAddToHomeScreenBanner,
  type AddToHomeScreenPlatform,
} from "@/lib/add-to-homescreen";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function platformInstructions(platform: AddToHomeScreenPlatform): string {
  if (platform === "ios") {
    return "Tap Share, then Add to Home Screen for quick access.";
  }
  if (platform === "android") {
    return "Install CCO on your home screen for quick access.";
  }
  return "Add this app to your home screen for quick access.";
}

export function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<AddToHomeScreenPlatform>("other");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const update = () => {
      if (!shouldShowAddToHomeScreenBanner()) {
        setVisible(false);
        return;
      }
      setPlatform(getAddToHomeScreenPlatform());
      setVisible(true);
    };

    update();

    const onDisplayModeChange = () => update();
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    standaloneMq.addEventListener("change", onDisplayModeChange);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", () => {
      setVisible(false);
      setInstallPrompt(null);
    });

    return () => {
      standaloneMq.removeEventListener("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  const dismiss = useCallback(() => {
    dismissAddToHomeScreen();
    setVisible(false);
  }, []);

  const runInstall = useCallback(async () => {
    if (!installPrompt) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstalling(false);
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  if (!visible) return null;

  const canNativeInstall = platform === "android" && installPrompt !== null;

  return (
    <div className="a2hs-banner" role="region" aria-label="Add to home screen">
      <div className="a2hs-banner-inner">
        <p className="a2hs-banner-text">
          <strong>Add CCO to your home screen</strong>
          <span>{platformInstructions(platform)}</span>
        </p>
        <div className="a2hs-banner-actions">
          {canNativeInstall && (
            <button
              type="button"
              className="a2hs-banner-btn a2hs-banner-btn-primary"
              disabled={installing}
              onClick={() => void runInstall()}
            >
              {installing ? "Installing…" : "Install"}
            </button>
          )}
          <button type="button" className="a2hs-banner-btn" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
