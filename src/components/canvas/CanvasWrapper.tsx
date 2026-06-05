"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
  cssWidth: number;
  cssHeight: number;
}

export interface CanvasWrapperHandle {
  getCanvas: () => HTMLCanvasElement | null;
  getContext: () => CanvasRenderingContext2D | null;
  getSize: () => CanvasSize;
  forceResize: () => void;
}

export type ResizeStrategy =
  | "stretch"       // Canvas fills container, ignores aspect ratio
  | "contain"       // Letterbox: fit inside container, preserve ratio
  | "cover"         // Fill container, crop edges, preserve ratio
  | "fixed";        // Always exactly designWidth × designHeight in CSS px

export interface CanvasWrapperProps {
  /** Called once the canvas is ready with its 2D context */
  onReady?: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void;
  /** Called every frame — receives the context and size, NOT a game loop */
  onResize?: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void;
  /** Aspect ratio in [width, height] form, e.g. [16, 9] */
  aspectRatio?: [number, number];
  /** The logical design resolution */
  designWidth?: number;
  designHeight?: number;
  /** How the canvas scales inside its container */
  resizeStrategy?: ResizeStrategy;
  /** Enable device pixel ratio scaling for crisp rendering */
  enableDPR?: boolean;
  /** Custom class for the outer wrapper div */
  className?: string;
  /** Custom CSS background (default transparent) */
  background?: string;
  /** Whether to show a subtle scanline overlay (retro aesthetic) */
  scanlines?: boolean;
  /** Optional loading overlay shown until onReady resolves */
  loading?: boolean;
  /** Accessibility label */
  ariaLabel?: string;
  /** ID forwarded to the <canvas> element */
  canvasId?: string;
  /** Whether the canvas is interactive (default true) */
  interactive?: boolean;
}

// ─── Resize Utilities ─────────────────────────────────────────────────────────

function computeContainSize(
  containerW: number,
  containerH: number,
  designW: number,
  designH: number
): { cssWidth: number; cssHeight: number; offsetX: number; offsetY: number } {
  const scale = Math.min(containerW / designW, containerH / designH);
  const cssWidth = Math.floor(designW * scale);
  const cssHeight = Math.floor(designH * scale);
  const offsetX = Math.floor((containerW - cssWidth) / 2);
  const offsetY = Math.floor((containerH - cssHeight) / 2);
  return { cssWidth, cssHeight, offsetX, offsetY };
}

function computeCoverSize(
  containerW: number,
  containerH: number,
  designW: number,
  designH: number
): { cssWidth: number; cssHeight: number; offsetX: number; offsetY: number } {
  const scale = Math.max(containerW / designW, containerH / designH);
  const cssWidth = Math.floor(designW * scale);
  const cssHeight = Math.floor(designH * scale);
  const offsetX = Math.floor((containerW - cssWidth) / 2);
  const offsetY = Math.floor((containerH - cssHeight) / 2);
  return { cssWidth, cssHeight, offsetX, offsetY };
}

// ─── Scanline Overlay (pure CSS, zero JS cost) ───────────────────────────────

const ScanlineOverlay: React.FC = () => (
  <div
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 10,
      backgroundImage:
        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
      mixBlendMode: "multiply",
    }}
  />
);

// ─── Loading Veil ─────────────────────────────────────────────────────────────

const LoadingVeil: React.FC = () => (
  <motion.div
    key="canvas-loading-veil"
    initial={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.82)",
      backdropFilter: "blur(6px)",
    }}
  >
    <motion.div
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "3px solid rgba(255,255,255,0.15)",
        borderTopColor: "rgba(255,255,255,0.9)",
      }}
      className="animate-spin"
    />
  </motion.div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const CanvasWrapper = forwardRef<CanvasWrapperHandle, CanvasWrapperProps>(
  (
    {
      onReady,
      onResize,
      designWidth = 1280,
      designHeight = 720,
      resizeStrategy = "contain",
      enableDPR = true,
      className = "",
      background = "transparent",
      scanlines = false,
      loading = false,
      ariaLabel = "Game Canvas",
      canvasId,
      interactive = true,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const sizeRef = useRef<CanvasSize>({
      width: designWidth,
      height: designHeight,
      dpr: 1,
      cssWidth: designWidth,
      cssHeight: designHeight,
    });
    const isReadyRef = useRef(false);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // CSS position state for the canvas element (contain / cover need offsets)
    const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>({
      position: "absolute",
      top: 0,
      left: 0,
      width: designWidth,
      height: designHeight,
    });

    // ── Compute & apply sizing ───────────────────────────────────────────────
    const applySize = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = ctxRef.current;
      if (!ctx) return;

      const dpr = enableDPR ? Math.min(window.devicePixelRatio || 1, 3) : 1;
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;

      let cssWidth: number;
      let cssHeight: number;
      let offsetX = 0;
      let offsetY = 0;

      

      switch (resizeStrategy) {
        case "stretch": {
          cssWidth = containerW;
          cssHeight = containerH;
          break;
        }
        case "contain": {
          const r = computeContainSize(containerW, containerH, designWidth, designHeight);
          cssWidth = r.cssWidth;
          cssHeight = r.cssHeight;
          offsetX = r.offsetX;
          offsetY = r.offsetY;
          break;
        }
        case "cover": {
          const r = computeCoverSize(containerW, containerH, designWidth, designHeight);
          cssWidth = r.cssWidth;
          cssHeight = r.cssHeight;
          offsetX = r.offsetX;
          offsetY = r.offsetY;
          break;
        }
        case "fixed":
        default: {
          cssWidth = designWidth;
          cssHeight = designHeight;
          offsetX = Math.floor((containerW - designWidth) / 2);
          offsetY = Math.floor((containerH - designHeight) / 2);
          break;
        }
      }

      // For stretch strategy, logical size tracks CSS size
      const logicalW =
        resizeStrategy === "stretch" ? containerW : designWidth;
      const logicalH =
        resizeStrategy === "stretch" ? containerH : designHeight;

      // Set backing buffer size (DPR-scaled)
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);

      // Reset transform and apply DPR scale
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Apply CSS dimensions
      setCanvasStyle({
        position: "absolute",
        left: offsetX,
        top: offsetY,
        width: cssWidth,
        height: cssHeight,
        imageRendering: "pixelated",
      });

      sizeRef.current = {
        width: logicalW,
        height: logicalH,
        dpr,
        cssWidth,
        cssHeight,
      };

      if (isReadyRef.current) {
        onResize?.(ctx, sizeRef.current);
      }
    }, [
      designWidth,
      designHeight,
      resizeStrategy,
      enableDPR,
      onResize,
    ]);

    // ── Initialise canvas and context ────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d", {
        alpha: background === "transparent",
        desynchronized: true,
        willReadFrequently: false,
      });

      if (!ctx) {
        console.error("[CanvasWrapper] Failed to acquire 2D context.");
        return;
      }

      ctxRef.current = ctx;

      // Initial size pass (synchronous, before first paint)
      applySize();

      isReadyRef.current = true;
      onReady?.(ctx, sizeRef.current);

      // ── ResizeObserver on the container ──────────────────────────────────
      const ro = new ResizeObserver(() => {
        applySize();
      });

      if (containerRef.current) {
        ro.observe(containerRef.current);
      }

      resizeObserverRef.current = ro;

      return () => {
        ro.disconnect();
        isReadyRef.current = false;
        ctxRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-apply sizing when strategy or design dims change at runtime
    useEffect(() => {
      if (isReadyRef.current) applySize();
    }, [applySize]);

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => canvasRef.current,
        getContext: () => ctxRef.current,
        getSize: () => sizeRef.current,
        forceResize: () => applySize(),
      }),
      [applySize]
    );

    // ── Render ───────────────────────────────────────────────────────────────
    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden select-none ${className}`}
        style={{
          background,
          width: "100%",
          height: "100%",
          touchAction: interactive ? "none" : "auto",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          id={canvasId}
          role="img"
          aria-label={ariaLabel}
          style={canvasStyle}
          tabIndex={interactive ? 0 : -1}
        />

        {scanlines && <ScanlineOverlay />}

        <AnimatePresence>{loading && <LoadingVeil />}</AnimatePresence>
      </div>
    );
  }
);

CanvasWrapper.displayName = "CanvasWrapper";

export default CanvasWrapper;