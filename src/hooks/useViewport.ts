"use client";

/**
 * src/hooks/useViewport.ts
 *
 * PRIORITY 1 — RESPONSIVE VIEWPORT FOUNDATION
 *
 * The single source of truth for "how much space does the game have."
 *
 * Responsibilities:
 *   1. Observe the document root with ResizeObserver (one observer for
 *      the whole app — NOT per-game).
 *   2. Read safe-area insets from CSS env() via a probe element.
 *   3. Compute the current Breakpoint from width + orientation.
 *   4. Compute the GameRect available to the canvas after chrome.
 *   5. Write all of this to Zustand via setViewportState once per
 *      debounce cycle.
 *
 * Consumers:
 *   - GameShell reads gameRect to size its canvas wrapper.
 *   - InputManager reads scale to convert pointer coords.
 *   - Touch controls read isTouch and safeArea to position buttons.
 *   - Any game component that needs breakpoint-specific rendering.
 *
 * Mount this hook ONCE in GameRouter (or a top-level layout component).
 * Do NOT mount it per-game. The ResizeObserver targets the document root.
 *
 * Usage:
 *   // In GameRouter.tsx, add at the top of the component:
 *   useViewport();
 *
 *   // Anywhere else, just read from the store:
 *   const { breakpoint, gameRect, safeArea } = useGameStore(s => s.viewportState);
 */

import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@/store/gameStore";
import type { Breakpoint, SafeAreaInsets, ViewportState } from "@/store/gameStore";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Shell header height in CSS px — the row containing the back button and
 * the global React HUD strip. GameRect.y is offset by this.
 * If GameShell ever changes its header height, update this constant.
 */
const SHELL_HEADER_H = 0; // GameShell currently uses position:absolute HUD,
                           // so header subtracts 0px from game area.
                           // Set to e.g. 48 if you add a persistent header bar.

/**
 * Debounce delay for resize events in ms.
 * Long enough to skip intermediate sizes during window-drag, short enough
 * that orientation changes feel immediate on mobile.
 */
const RESIZE_DEBOUNCE_MS = 80;

/**
 * Breakpoint thresholds in CSS px (width-based, landscape/portrait aware).
 * These mirror the values in globals.css media queries.
 */
const BP_MOBILE_MAX_W  = 767;
const BP_TABLET_MAX_W  = 1199;

// ─── Safe-area probe ──────────────────────────────────────────────────────────

/**
 * CSS env() variables cannot be read via JS directly.
 * We create a 0×0 probe element with padding set to env(safe-area-inset-*),
 * then read its computed style. This is the standard technique.
 *
 * The probe is created once and reused on every resize — no repeated DOM
 * allocation in the hot path.
 */
let probeEl: HTMLElement | null = null;

function getOrCreateProbe(): HTMLElement {
  if (probeEl) return probeEl;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:0",
    "height:0",
    "overflow:hidden",
    "pointer-events:none",
    "visibility:hidden",
    "padding-top:env(safe-area-inset-top,0px)",
    "padding-right:env(safe-area-inset-right,0px)",
    "padding-bottom:env(safe-area-inset-bottom,0px)",
    "padding-left:env(safe-area-inset-left,0px)",
  ].join(";");
  document.body.appendChild(el);
  probeEl = el;
  return el;
}

function readSafeArea(): SafeAreaInsets {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const probe = getOrCreateProbe();
  const cs = window.getComputedStyle(probe);

  const parse = (v: string) => parseFloat(v) || 0;

  return {
    top:    parse(cs.paddingTop),
    right:  parse(cs.paddingRight),
    bottom: parse(cs.paddingBottom),
    left:   parse(cs.paddingLeft),
  };
}

// ─── Breakpoint computation ────────────────────────────────────────────────────

function computeBreakpoint(
  w: number,
  orientation: "portrait" | "landscape"
): Breakpoint {
  if (w <= BP_MOBILE_MAX_W) {
    return orientation === "portrait" ? "mobile-portrait" : "mobile-landscape";
  }
  if (w <= BP_TABLET_MAX_W) {
    return orientation === "portrait" ? "tablet-portrait" : "tablet-landscape";
  }
  return "desktop-landscape";
}

// ─── Touch detection ──────────────────────────────────────────────────────────

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

// ─── GameRect computation ─────────────────────────────────────────────────────

/**
 * Given the container dimensions and safe-area insets, compute the rect
 * available for the game canvas.
 *
 * For the current architecture (GameShell with position:absolute HUD),
 * the full container area is available. Safe-area insets are subtracted
 * so the canvas never underlaps a notch or home indicator.
 */
function computeGameRect(
  containerW: number,
  containerH: number,
  safeArea: SafeAreaInsets,
  headerH: number
): { x: number; y: number; width: number; height: number } {
  const x = safeArea.left;
  const y = safeArea.top + headerH;
  const width  = containerW - safeArea.left - safeArea.right;
  const height = containerH - safeArea.top  - safeArea.bottom - headerH;

  return {
    x,
    y,
    width:  Math.max(1, width),
    height: Math.max(1, height),
  };
}

// ─── DPR ──────────────────────────────────────────────────────────────────────

function getDPR(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio ?? 1, 2);
}

// ─── Main hook ────────────────────────────────────────────────────────────────

/**
 * useViewport — mount ONCE at the top of GameRouter.
 *
 * Writes to Zustand on every meaningful resize/orientation change.
 * Debounced at RESIZE_DEBOUNCE_MS to avoid spamming the store during
 * window-drag on desktop.
 */
export function useViewport(): void {
  const setViewportState = useGameStore((s) => s.setViewportState);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);

  const measure = useCallback((isResizing: boolean) => {
    if (typeof window === "undefined") return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const orientation: "portrait" | "landscape" = h > w ? "portrait" : "landscape";
    const breakpoint = computeBreakpoint(w, orientation);
    const safeArea = readSafeArea();
    const gameRect = computeGameRect(w, h, safeArea, SHELL_HEADER_H);
    const dpr = getDPR();
    const isTouch = detectTouch();

    // Scale assumes a 1280×720 world as the reference — this will be
    // overridden by GameShell's per-game ResizeObserver for the actual
    // canvas scale. This top-level scale is the global layout scale.
    const scale = Math.min(w / 1280, h / 720);

    const next: ViewportState = {
      containerW: w,
      containerH: h,
      scale,
      dpr,
      breakpoint,
      orientation,
      safeArea,
      gameRect,
      isTouch,
      isResizing,
    };

    setViewportState(next);
  }, [setViewportState]);

  const debouncedMeasure = useCallback(() => {
    // Mark as resizing immediately (instant feedback for GameShell)
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!isFirstRun.current) {
      // Partial update — just flip isResizing so consumers can react
      // without waiting for the debounce. Full state lands after delay.
      setViewportState({
        ...useGameStore.getState().viewportState,
        isResizing: true,
      });
    }

    debounceTimer.current = setTimeout(() => {
      measure(false); // isResizing: false — settled
      isFirstRun.current = false;
    }, RESIZE_DEBOUNCE_MS);
  }, [measure, setViewportState]);

  useEffect(() => {
    // Initial synchronous measurement — no debounce on mount
    measure(false);
    isFirstRun.current = false;

    // ResizeObserver on documentElement catches ALL size changes:
    // window resize, CSS-triggered size changes, orientation changes,
    // browser chrome showing/hiding on mobile scroll.
    const ro = new ResizeObserver(debouncedMeasure);
    ro.observe(document.documentElement);

    // Orientation change fires before resize on some Android browsers.
    // The 200ms delay gives the viewport time to settle after the flip.
    const handleOrientation = () => {
      setTimeout(debouncedMeasure, 200);
    };
    window.addEventListener("orientationchange", handleOrientation);

    // mediaQueryList change handles pointer type switches (rare but real
    // on convertible Windows devices going tablet mode).
    const pointerMQL = window.matchMedia("(pointer: coarse)");
    const handlePointerChange = () => measure(false);
    pointerMQL.addEventListener("change", handlePointerChange);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", handleOrientation);
      pointerMQL.removeEventListener("change", handlePointerChange);

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [debouncedMeasure, measure]);
}

// ─── Convenience selector hooks ───────────────────────────────────────────────
// These are thin wrappers so game components don't need to write
// (s) => s.viewportState.breakpoint every time.

/**
 * Returns only the breakpoint string — re-renders only when breakpoint
 * changes, not on every pixel of resize.
 */
export function useBreakpoint(): Breakpoint {
  return useGameStore((s) => s.viewportState.breakpoint);
}

/**
 * Returns only the safe-area insets.
 * Touch controls and HUD use this for positioning.
 */
export function useSafeArea(): SafeAreaInsets {
  return useGameStore((s) => s.viewportState.safeArea);
}

/**
 * Returns only the game rect.
 * GameShell uses this to size the canvas wrapper.
 */
export function useGameRect(): { x: number; y: number; width: number; height: number } {
  return useGameStore((s) => s.viewportState.gameRect);
}

/**
 * Returns whether the current device uses touch input.
 */
export function useIsTouch(): boolean {
  return useGameStore((s) => s.viewportState.isTouch);
}

/**
 * Returns true while a resize is debouncing.
 * GameShell can use this to skip canvas re-initialization mid-resize.
 */
export function useIsResizing(): boolean {
  return useGameStore((s) => s.viewportState.isResizing);
}