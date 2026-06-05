"use client";

/**
 * MobileTouchControls.tsx
 *
 * A transparent overlay rendered ABOVE the canvas in HTML/CSS.
 * Communicates via a shared ref — zero React state updates during gameplay.
 *
 * WHY ref-based, not state-based:
 * setState during a touch event triggers a React re-render. A re-render
 * mid-frame can produce tearing or delay the next rAF callback. Using a
 * mutable ref keeps the critical path entirely outside React's scheduler.
 *
 * Layout (landscape-biased, works portrait too):
 *
 *  ┌──────────────────────────────────────┐
 *  │         [GAME CANVAS]                │
 *  │                                      │
 *  │  [←][→]              [JUMP] [SPRINT] │
 *  └──────────────────────────────────────┘
 *
 * On portrait phones the controls shift to bottom-center for thumb reach.
 */

import React, { useEffect, useRef, useCallback } from "react";

export interface TouchState {
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
}

interface MobileTouchControlsProps {
  touchStateRef: React.MutableRefObject<TouchState>;
  visible: boolean;
}

// ─── Individual button ────────────────────────────────────────────────────────

interface TouchButtonProps {
  label: string;
  icon: string;
  onPress: () => void;
  onRelease: () => void;
  style?: React.CSSProperties;
  accent?: string;
}

function TouchButton({
  label,
  icon,
  onPress,
  onRelease,
  style,
  accent = "rgba(255,255,255,0.15)",
}: TouchButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const pressedRef = useRef(false);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;

    const handleStart = (e: TouchEvent) => {
      e.preventDefault(); // prevent 300ms ghost click
      if (!pressedRef.current) {
        pressedRef.current = true;
        onPress();
        el.style.background = "rgba(255,255,255,0.32)";
        el.style.transform = "scale(0.93)";
      }
    };

    const handleEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (pressedRef.current) {
        pressedRef.current = false;
        onRelease();
        el.style.background = accent;
        el.style.transform = "scale(1)";
      }
    };

    el.addEventListener("touchstart", handleStart, { passive: false });
    el.addEventListener("touchend", handleEnd, { passive: false });
    el.addEventListener("touchcancel", handleEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
  }, [onPress, onRelease, accent]);

  return (
    <button
      ref={btnRef}
      aria-label={label}
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.25)",
        background: accent,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: "#fff",
        fontSize: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        transition: "transform 0.06s ease, background 0.06s ease",
        willChange: "transform",
        ...style,
      }}
    >
      {icon}
    </button>
  );
}

// ─── Controls layout ──────────────────────────────────────────────────────────

export default function MobileTouchControls({
  touchStateRef,
  visible,
}: MobileTouchControlsProps) {
  // Memoize handlers so TouchButton doesn't re-register listeners on every render
  const pressLeft    = useCallback(() => { touchStateRef.current.left   = true;  }, [touchStateRef]);
  const releaseLeft  = useCallback(() => { touchStateRef.current.left   = false; }, [touchStateRef]);
  const pressRight   = useCallback(() => { touchStateRef.current.right  = true;  }, [touchStateRef]);
  const releaseRight = useCallback(() => { touchStateRef.current.right  = false; }, [touchStateRef]);
  const pressJump    = useCallback(() => { touchStateRef.current.jump   = true;  }, [touchStateRef]);
  const releaseJump  = useCallback(() => { touchStateRef.current.jump   = false; }, [touchStateRef]);
  const pressSprint  = useCallback(() => { touchStateRef.current.sprint = true;  }, [touchStateRef]);
  const releaseSprint= useCallback(() => { touchStateRef.current.sprint = false; }, [touchStateRef]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none", // pass-through — only buttons receive touches
        zIndex: 10,
      }}
    >
      {/* Left cluster — D-pad style */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          display: "flex",
          gap: 12,
          pointerEvents: "auto",
        }}
      >
        <TouchButton
          label="Move left"
          icon="◀"
          onPress={pressLeft}
          onRelease={releaseLeft}
        />
        <TouchButton
          label="Move right"
          icon="▶"
          onPress={pressRight}
          onRelease={releaseRight}
        />
      </div>

      {/* Right cluster — action buttons */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          display: "flex",
          gap: 12,
          pointerEvents: "auto",
        }}
      >
        <TouchButton
          label="Sprint"
          icon="⚡"
          onPress={pressSprint}
          onRelease={releaseSprint}
          accent="rgba(255, 200, 0, 0.2)"
          style={{ border: "2px solid rgba(255,200,0,0.35)" }}
        />
        <TouchButton
          label="Jump"
          icon="↑"
          onPress={pressJump}
          onRelease={releaseJump}
          accent="rgba(0, 200, 255, 0.2)"
          style={{ border: "2px solid rgba(0,200,255,0.35)" }}
        />
      </div>

      {/* Swipe-to-run hint — fades out after first touch */}
      <SwipeHint />
    </div>
  );
}

// ─── First-launch swipe hint ──────────────────────────────────────────────────

function SwipeHint() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const dismiss = () => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    };

    window.addEventListener("touchstart", dismiss, { once: true });
    // Also auto-dismiss after 3 s so it never obstructs gameplay
    const timer = setTimeout(dismiss, 3000);

    return () => {
      window.removeEventListener("touchstart", dismiss);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        color: "rgba(255,255,255,0.6)",
        fontSize: 13,
        fontFamily: "monospace",
        letterSpacing: "0.1em",
        textAlign: "center",
        pointerEvents: "none",
        transition: "opacity 0.4s ease",
      }}
    >
      USE BUTTONS TO MOVE
    </div>
  );
}