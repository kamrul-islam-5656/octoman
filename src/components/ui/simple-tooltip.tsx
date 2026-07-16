"use client";

import { ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface SimpleTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
}

const GAP = 6;

const sideTransforms: Record<TooltipSide, string> = {
  top: "translate(-50%, -100%)",
  bottom: "translate(-50%, 0)",
  left: "translate(-100%, -50%)",
  right: "translate(0, -50%)",
};

export function SimpleTooltip({ content, children, side = "top", className = "" }: SimpleTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const positionsBySide: Record<TooltipSide, { top: number; left: number }> = {
      top: { top: rect.top - GAP, left: rect.left + rect.width / 2 },
      bottom: { top: rect.bottom + GAP, left: rect.left + rect.width / 2 },
      left: { top: rect.top + rect.height / 2, left: rect.left - GAP },
      right: { top: rect.top + rect.height / 2, left: rect.right + GAP },
    };

    setPosition(positionsBySide[side]);
    setIsVisible(true);
  }

  function hide() {
    setIsVisible(false);
  }

  return (
    <span ref={triggerRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}

      {isVisible && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className={`pointer-events-none fixed z-50 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] shadow-md ${className}`}
              style={{ top: position.top, left: position.left, transform: sideTransforms[side] }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
