"use client";

import { useCallback, useEffect, useState } from "react";
import { viewportBounds } from "@/hooks/useChatPanelBounds";

const COLLAPSED_KEY = "cco-call-pip-collapsed";
const CORNER_KEY = "cco-call-pip-corner";
const LEGACY_POS_KEY = "cco-call-pip-pos";

export const PIP_PADDING_PX = 16;
export const PIP_WIDTH_PX = 280;
export const PIP_HEADER_HEIGHT_PX = 32;
export const PIP_BODY_HEIGHT_PX = 176;

export type PipCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type PipPoint = { x: number; y: number };

const CORNERS: PipCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(COLLAPSED_KEY) === "1";
}

function readCorner(): PipCorner | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CORNER_KEY);
  if (raw && CORNERS.includes(raw as PipCorner)) {
    return raw as PipCorner;
  }
  return null;
}

function readLegacyPoint(): PipPoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LEGACY_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PipPoint;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

export function pipDimensions(collapsed: boolean, boundsWidth: number) {
  const width = Math.min(
    PIP_WIDTH_PX,
    Math.max(160, boundsWidth - PIP_PADDING_PX * 2),
  );
  const height = (collapsed ? 0 : PIP_BODY_HEIGHT_PX) + PIP_HEADER_HEIGHT_PX;
  return { width, height };
}

export function resolvePipBounds(bounds: DOMRect | null): DOMRect {
  return bounds ?? viewportBounds();
}

export function cornerPosition(
  corner: PipCorner,
  bounds: DOMRect,
  collapsed: boolean,
): { x: number; y: number; width: number; height: number } {
  const { width, height } = pipDimensions(collapsed, bounds.width);

  switch (corner) {
    case "top-left":
      return {
        x: bounds.left + PIP_PADDING_PX,
        y: bounds.top + PIP_PADDING_PX,
        width,
        height,
      };
    case "top-right":
      return {
        x: bounds.right - width - PIP_PADDING_PX,
        y: bounds.top + PIP_PADDING_PX,
        width,
        height,
      };
    case "bottom-left":
      return {
        x: bounds.left + PIP_PADDING_PX,
        y: bounds.bottom - height - PIP_PADDING_PX,
        width,
        height,
      };
    case "bottom-right":
    default:
      return {
        x: bounds.right - width - PIP_PADDING_PX,
        y: bounds.bottom - height - PIP_PADDING_PX,
        width,
        height,
      };
  }
}

export function nearestCorner(
  pos: PipPoint,
  size: { width: number; height: number },
  bounds: DOMRect,
): PipCorner {
  const cx = pos.x + size.width / 2;
  const cy = pos.y + size.height / 2;
  const horizontal = cx < bounds.left + bounds.width / 2 ? "left" : "right";
  const vertical = cy < bounds.top + bounds.height / 2 ? "top" : "bottom";
  return `${vertical}-${horizontal}` as PipCorner;
}

export function clampPipPoint(
  pos: PipPoint,
  size: { width: number; height: number },
  bounds: DOMRect,
): PipPoint {
  return {
    x: Math.min(
      Math.max(bounds.left + PIP_PADDING_PX, pos.x),
      bounds.right - size.width - PIP_PADDING_PX,
    ),
    y: Math.min(
      Math.max(bounds.top + PIP_PADDING_PX, pos.y),
      bounds.bottom - size.height - PIP_PADDING_PX,
    ),
  };
}

export function usePipPanel() {
  const [collapsed, setCollapsedState] = useState(false);
  const [corner, setCornerState] = useState<PipCorner>("bottom-right");
  const [dragPoint, setDragPointState] = useState<PipPoint | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedCollapsed = readCollapsed();
    const storedCorner = readCorner();
    const legacyPoint = readLegacyPoint();
    const bounds = viewportBounds();

    setCollapsedState(storedCollapsed);

    if (storedCorner) {
      setCornerState(storedCorner);
    } else if (legacyPoint) {
      const size = pipDimensions(storedCollapsed, bounds.width);
      setCornerState(nearestCorner(legacyPoint, size, bounds));
    }

    setReady(true);
  }, []);

  const persistCorner = useCallback((next: PipCorner) => {
    setCornerState(next);
    sessionStorage.setItem(CORNER_KEY, next);
    sessionStorage.removeItem(LEGACY_POS_KEY);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      sessionStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const setDragPoint = useCallback((next: PipPoint | null) => {
    setDragPointState(next);
  }, []);

  const snapDragToCorner = useCallback(
    (point: PipPoint, bounds: DOMRect, collapsed: boolean) => {
      const size = pipDimensions(collapsed, bounds.width);
      const clamped = clampPipPoint(point, size, bounds);
      persistCorner(nearestCorner(clamped, size, bounds));
      setDragPointState(null);
    },
    [persistCorner],
  );

  return {
    collapsed,
    setCollapsed,
    toggleCollapsed,
    corner,
    setCorner: persistCorner,
    dragPoint,
    setDragPoint,
    snapDragToCorner,
    ready,
  };
}
