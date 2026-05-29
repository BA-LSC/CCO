"use client";

import { useEffect, useState } from "react";

const SPEAKING_OUTLINE_FADE_MS = 320;

/** Keeps the speaking outline visible briefly after speech ends so CSS can fade it out. */
export function useSpeakingOutline(isSpeaking: boolean) {
  const [visible, setVisible] = useState(isSpeaking);

  useEffect(() => {
    if (isSpeaking) {
      setVisible(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(false), SPEAKING_OUTLINE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [isSpeaking]);

  return {
    showOutline: visible,
    isPulsing: isSpeaking,
  };
}

export { SPEAKING_OUTLINE_FADE_MS };
