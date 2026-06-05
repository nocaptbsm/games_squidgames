/**
 * useCanvasScale.ts
 *
 * Handles DPR-aware canvas sizing with debounced resize observation.
 *
 * Problems solved:
 * 1. Blurry canvas on Retina/high-DPR screens (canvas logical ≠ physical px)
 * 2. Jank from resize events firing 60/sec during window drag
 * 3. Safari's fractional DPR causing subpixel blur
 * 4. Flip between portrait/landscape on mobile causing wrong aspect ratio
 *
 * Strategy: "contain" mode — game world is fixed 1280×720, letterboxed
 * inside the container. The CSS transform scales the canvas up/down
 * without changing the internal resolution mid-game.
 *
 * WHY fixed internal resolution:
 * Changing canvas.width/height mid-session clears the canvas AND causes
 * the GPU to re-allocate texture memory — a guaranteed jank spike.
 * Scaling via CSS transform is free (compositor-only, no repaint).
 */

import { useEffect, useRef, useCallback } from "react";
import { QualitySettings } from "./useAdaptiveQuality";

export const GAME_W = 1280;
export const GAME_H = 720;

interface UseCanvasScaleOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLElement>;
  qualityRef: React.MutableRefObject<QualitySettings>;
}

export function useCanvasScale({
  canvasRef,
  containerRef,
  qualityRef,
}: UseCanvasScaleOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyScale = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = qualityRef.current.pixelRatio;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Compute scale to fit game world inside container (letterbox)
    const scaleX = cw / GAME_W;
    const scaleY = ch / GAME_H;
    const scale  = Math.min(scaleX, scaleY); // "contain"

    // Physical canvas size = game resolution × DPR
    const physW = Math.round(GAME_W * dpr);
    const physH = Math.round(GAME_H * dpr);

    // Only resize the canvas backing store if the size actually changed.
    // Resize is expensive — avoid it on every orientation change.
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width  = physW;
      canvas.height = physH;

      // Scale the 2D context to match DPR so game code uses logical px
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    }

    // CSS: render the canvas at game resolution, then scale to container
    canvas.style.width  = `${GAME_W}px`;
    canvas.style.height = `${GAME_H}px`;
    canvas.style.transformOrigin = "top left";
    canvas.style.transform = `scale(${scale})`;

    // Center in container
    const offsetX = (cw - GAME_W * scale) / 2;
    const offsetY = (ch - GAME_H * scale) / 2;
    canvas.style.marginLeft = `${offsetX}px`;
    canvas.style.marginTop  = `${offsetY}px`;
  }, [canvasRef, containerRef, qualityRef]);

  const debouncedApply = useCallback(() => {
    // Debounce by 100ms — prevents 60 resize events during window drag
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(applyScale, 100);
  }, [applyScale]);

  useEffect(() => {
    // Initial apply
    applyScale();

    // ResizeObserver is more reliable than window resize:
    // catches CSS-triggered size changes, sidebar expand, etc.
    const ro = new ResizeObserver(debouncedApply);
    if (containerRef.current) ro.observe(containerRef.current);

    // Orientation change fires BEFORE resize on some Android browsers;
    // wait 200ms for the viewport to settle
    const handleOrientation = () => setTimeout(applyScale, 200);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", handleOrientation);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [applyScale, debouncedApply, containerRef]);

  return { applyScale };
}

// ─── Canvas context helpers ───────────────────────────────────────────────────

/**
 * Get a 2D context pre-configured for performance:
 * - desynchronized: reduces input latency by decoupling canvas from browser composite
 * - alpha: false on opaque canvases (skips alpha compositing — free speedup)
 * - willReadFrequently: false (we never call getImageData in the hot path)
 */
export function getOptimizedContext(
  canvas: HTMLCanvasElement,
  alpha = false
): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", {
    alpha,
    desynchronized: true,    // lower latency on supported browsers
    willReadFrequently: false,
  });
}

/**
 * Pre-render a static background layer to an offscreen canvas.
 * During gameplay, blit this with a single drawImage() instead of
 * redrawing hundreds of background primitives every frame.
 *
 * Usage:
 *   const bgCanvas = bakeBackground(draw => { draw.fillRect(...); });
 *   // In render loop:
 *   ctx.drawImage(bgCanvas, 0, 0);
 */
export function bakeBackground(
  draw: (ctx: CanvasRenderingContext2D) => void
): OffscreenCanvas | HTMLCanvasElement {
  // OffscreenCanvas has better perf where supported
  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(GAME_W, GAME_H);
    const ctx = oc.getContext("2d") as OffscreenCanvasRenderingContext2D;
    draw(ctx as unknown as CanvasRenderingContext2D);
    return oc;
  }

  // Fallback
  const el = document.createElement("canvas");
  el.width  = GAME_W;
  el.height = GAME_H;
  const ctx = el.getContext("2d")!;
  draw(ctx);
  return el;
}