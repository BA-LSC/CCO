"use client";

import { useCallback, useEffect, useState } from "react";

const COLLAPSED_KEY = "cco-call-pip-collapsed";
const POS_KEY = "cco-call-pip-pos";

export type PipPosition = { x: number; y: number };

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(COLLAPSED_KEY) === "1";
}

function readPosition(): PipPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PipPosition;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

export function defaultPipPosition(collapsed: boolean): PipPosition {
  const margin = 20;
  const width = Math.min(360, window.innerWidth - margin * 2);
  const height = collapsed ? 48 : Math.min(240, window.innerHeight - 120);
  return {
    x: Math.max(margin, window.innerWidth - width - margin),
    y: Math.max(margin, window.innerHeight - height - margin),
  };
}

export function clampPipPosition(pos: PipPosition, collapsed: boolean): PipPosition {
  const margin = 8;
  const width = Math.min(360, window.innerWidth - margin * 2);
  const height = collapsed ? 48 : Math.min(240, window.innerHeight - 120);
  return {
    x: Math.min(Math.max(margin, pos.x), window.innerWidth - width - margin),
    y: Math.min(Math.max(margin, pos.y), window.innerHeight - height - margin),
  };
}

export function usePipPanel() {
  const [collapsed, setCollapsedState] = useState(false);
  const [position, setPositionState] = useState<PipPosition | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedCollapsed = readCollapsed();
    const storedPosition = readPosition();
    setCollapsedState(storedCollapsed);
    setPositionState(
      storedPosition
        ? clampPipPosition(storedPosition, storedCollapsed)
        : defaultPipPosition(storedCollapsed),
    );
    setReady(true);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
    setPositionState((prev) => {
      if (!prev) return prev;
      const next = clampPipPosition(prev, value);
      sessionStorage.setItem(POS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      sessionStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      setPositionState((pos) => {
        if (!pos) return pos;
        const clamped = clampPipPosition(pos, next);
        sessionStorage.setItem(POS_KEY, JSON.stringify(clamped));
        return clamped;
      });
      return next;
    });
  }, []);

  const setPosition = useCallback(
    (next: PipPosition) => {
      const clamped = clampPipPosition(next, readCollapsed());
      setPositionState(clamped);
      sessionStorage.setItem(POS_KEY, JSON.stringify(clamped));
    },
    [],
  );

  return {
    collapsed,
    setCollapsed,
    toggleCollapsed,
    position,
    setPosition,
    ready,
  };
}
