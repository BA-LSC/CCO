"use client";

import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  clampPipPoint,
  cornerPosition,
  pipDimensions,
  resolvePipBounds,
  usePipPanel,
  type PipPoint,
} from "@/hooks/usePipPanel";

type PipState = ReturnType<typeof usePipPanel>;

type Props = {
  bounds: DOMRect | null;
  pip: PipState;
  children: ReactNode;
};

export function CallPipShell({ bounds, pip, children }: Props) {
  const {
    collapsed,
    toggleCollapsed,
    corner,
    dragPoint,
    setDragPoint,
    snapDragToCorner,
    ready,
  } = pip;
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const resolvedBounds = useMemo(() => resolvePipBounds(bounds), [bounds]);

  const layout = useMemo(() => {
    if (dragPoint) {
      const size = pipDimensions(collapsed, resolvedBounds.width);
      const clamped = clampPipPoint(dragPoint, size, resolvedBounds);
      return { ...size, ...clamped };
    }
    return cornerPosition(corner, resolvedBounds, collapsed);
  }, [collapsed, corner, dragPoint, resolvedBounds]);

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
      className={`call-pip${collapsed ? " call-pip--collapsed" : ""}`}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
      }}
    >
      <div
        className="call-pip__handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span className="call-pip__title">Call</span>
        <button
          type="button"
          className="call-pip__toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand call" : "Collapse call"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▴" : "▾"}
        </button>
      </div>
      {!collapsed ? <div className="call-pip__body">{children}</div> : null}
    </div>
  );
}
