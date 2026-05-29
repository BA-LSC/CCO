"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  clampPipPosition,
  usePipPanel,
  type PipPosition,
} from "@/hooks/usePipPanel";

type PipState = ReturnType<typeof usePipPanel>;

type Props = {
  participantCount: number;
  returnLink?: ReactNode;
  children?: ReactNode;
  /** Shared pip state from parent (keeps handle and overlay in sync). */
  pip?: PipState;
  /** Render only the draggable handle bar; media renders in a fixed sibling overlay. */
  chromeOnly?: boolean;
};

export function CallPipShell({
  participantCount,
  returnLink,
  children,
  pip: pipProp,
  chromeOnly = false,
}: Props) {
  const internalPip = usePipPanel();
  const pip = pipProp ?? internalPip;
  const { collapsed, toggleCollapsed, position, setPosition, ready } = pip;
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    if (!ready || !position) return;
    const onResize = () => {
      setPosition(clampPipPosition(position, collapsed));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [collapsed, position, ready, setPosition]);

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button, a")) return;
      const shell = shellRef.current;
      if (!shell || !position) return;
      event.preventDefault();
      const rect = shell.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPosition({
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      });
    },
    [setPosition],
  );

  const onHandlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!ready || !position) return null;

  const style = pipPositionStyle(position);

  return (
    <div
      ref={shellRef}
      className={`call-pip-shell${collapsed ? " call-pip--collapsed" : ""}${chromeOnly ? " call-pip-shell--chrome-only" : ""}`}
      style={style}
    >
      <div
        className="call-pip-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <span className="call-pip-handle-grip" aria-hidden="true" />
        {!collapsed && returnLink ? (
          <span className="call-pip-handle-return">{returnLink}</span>
        ) : null}
        <span className="call-pip-handle-count">
          {participantCount} in call
        </span>
        <button
          type="button"
          className="call-pip-collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand call panel" : "Collapse call panel"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▴" : "▾"}
        </button>
      </div>
      {!collapsed && !chromeOnly ? <div className="call-pip-body">{children}</div> : null}
    </div>
  );
}

function pipPositionStyle(position: PipPosition): { left: number; top: number } {
  return {
    left: position.x,
    top: position.y,
  };
}
