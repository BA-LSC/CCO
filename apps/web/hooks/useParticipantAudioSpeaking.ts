"use client";

import { useEffect, useState } from "react";

const SPEAKING_LEVEL = 0.08;
const SPEAKING_HOLD_MS = 350;

/** True while the participant's mic input exceeds a speech threshold. */
export function useParticipantAudioSpeaking(
  audioTrack: MediaStreamTrack | null | undefined,
  audioEnabled: boolean,
): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!audioEnabled || !audioTrack || audioTrack.readyState !== "live") {
      setSpeaking(false);
      return;
    }

    const audioContext = new AudioContext();
    const stream = new MediaStream([audioTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    source.connect(analyser);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let holdUntil = 0;
    let frame = 0;

    const sample = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i += 1) sum += bins[i]!;
      const level = sum / bins.length / 255;
      const now = performance.now();

      if (level > SPEAKING_LEVEL) {
        holdUntil = now + SPEAKING_HOLD_MS;
        setSpeaking(true);
      } else if (now >= holdUntil) {
        setSpeaking(false);
      }

      frame = requestAnimationFrame(sample);
    };

    frame = requestAnimationFrame(sample);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void audioContext.close();
      setSpeaking(false);
    };
  }, [audioEnabled, audioTrack, audioTrack?.id]);

  return speaking;
}
