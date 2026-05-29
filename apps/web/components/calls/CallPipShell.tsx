"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { formatCallLiveDuration } from "@/lib/call-timeline";
import { SidebarChevronIcon } from "@/components/PanelHeaderIcons";
import {
  clampPipPoint,
  cornerPosition,
  pipDimensions,
  resolvePipBounds,
  usePipPanel,
  type PipCorner,
  type PipPoint,
} from "@/hooks/usePipPanel";

const PIP_INTRO_OFFSET_PX = 28;

function pipIntroOffsetLayout(
  layout: { x: number; y: number; width: number; height: number },
  corner: PipCorner,
) {
  const offset = PIP_INTRO_OFFSET_PX;
  switch (corner) {
    case "bottom-left":
      return { ...layout, x: layout.x - offset, y: layout.y + offset };
    case "top-right":
      return { ...layout, x: layout.x + offset, y: layout.y - offset };
    case "top-left":
      return { ...layout, x: layout.x - offset, y: layout.y - offset };
    case "bottom-right":
    default:
      return { ...layout, x: layout.x + offset, y: layout.y + offset };
  }
}

type PipState = ReturnType<typeof usePipPanel>;

type Props = {
  bounds: DOMRect | null;
  pip: PipState;
  title: string;
  startedAt: string | null;
  onTitleClick?: () => void;
  children: ReactNode;
};

function liveElapsedSeconds(startedAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
}

function useCallElapsedLabel(startedAt: string | null): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return useMemo(() => {
    if (!startedAt) return null;
    return formatCallLiveDuration(liveElapsedSeconds(startedAt, nowMs));
  }, [nowMs, startedAt]);
}

export function CallPipShell({
  bounds,
  pip,
  title,
  startedAt,
  onTitleClick,
  children,
}: Props) {
  const {
    collapsed,
    toggleCollapsed,
    corner,
    dragPoint,
    setDragPoint,
    snapDragToCorner,
    ready,
  } = pip;
  const durationLabel = useCallElapsedLabel(startedAt);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [snapReady, setSnapReady] = useState(false);

  const resolvedBounds = useMemo(() => resolvePipBounds(bounds), [bounds]);

  const layout = useMemo(() => {
    if (dragPoint) {
      const size = pipDimensions(collapsed, resolvedBounds.width);
      const clamped = clampPipPoint(dragPoint, size, resolvedBounds);
      return { ...size, ...clamped };
    }
    return cornerPosition(corner, resolvedBounds, collapsed);
  }, [collapsed, corner, dragPoint, resolvedBounds]);

  useEffect(() => {
    if (!ready) {
      setSnapReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setSnapReady(true));
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  const displayLayout = useMemo(() => {
    if (dragPoint || snapReady) return layout;
    return pipIntroOffsetLayout(layout, corner);
  }, [corner, dragPoint, layout, snapReady]);

  const dragging = dragPoint !== null;
  const snapAnimating = snapReady && !dragging;

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      const shell = shellRef.current;
      if (!shell) return;
      event.preventDefault();
      const rect = shell.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      setDragPoint({ x: rect.left, y: rect.top });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [setDragPoint],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next: PipPoint = {
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      };
      const size = pipDimensions(collapsed, resolvedBounds.width);
      setDragPoint(clampPipPoint(next, size, resolvedBounds));
    },
    [collapsed, resolvedBounds, setDragPoint],
  );

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const size = pipDimensions(collapsed, resolvedBounds.width);
      const point = clampPipPoint(
        {
          x: event.clientX - drag.offsetX,
          y: event.clientY - drag.offsetY,
        },
        size,
        resolvedBounds,
      );
      snapDragToCorner(point, resolvedBounds, collapsed);
    },
    [collapsed, resolvedBounds, snapDragToCorner],
  );

  if (!ready) return null;

  return (
    <div
      ref={shellRef}
      className={[
        "call-pip",
        collapsed ? "call-pip--collapsed" : "",
        dragging ? "call-pip--dragging" : "",
        snapAnimating ? "call-pip--snap" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: displayLayout.x,
        top: displayLayout.y,
        width: displayLayout.width,
        height: displayLayout.height,
      }}
    >
      <div
        className="call-pip__handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="call-pip__headline">
          {onTitleClick ? (
            <button
              type="button"
              className="call-pip__title"
              title={title}
              aria-label={`Return to ${title} chat`}
              onClick={onTitleClick}
            >
              {title}
            </button>
          ) : (
            <span className="call-pip__title" title={title}>
              {title}
            </span>
          )}
          {durationLabel ? (
            <>
              <span className="call-pip__sep" aria-hidden="true">
                ·
              </span>
              <span className="call-pip__duration">{durationLabel}</span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          className="call-pip__toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand call" : "Collapse call"}
          aria-expanded={!collapsed}
        >
          <SidebarChevronIcon className="call-pip__toggle-icon" />
        </button>
      </div>
      {!collapsed ? <div className="call-pip__body">{children}</div> : null}
    </div>
  );
}
