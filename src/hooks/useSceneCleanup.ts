/**
 * useSceneCleanup.ts
 *
 * Centralized resource cleanup for the game scene.
 * Prevents memory leaks across hot reloads, remounts, and navigation.
 *
 * Resources managed:
 * - Canvas backing store reset
 * - Particle pool flush
 * - Audio context suspension
 * - Event listener deregistration
 * - rAF handle cancellation
 * - Timeout/interval clearing
 *
 * WHY this matters on mobile:
 * iOS Safari aggressively kills tabs that hold large canvas textures in
 * memory. A 1280×720 canvas at DPR=3 = ~26MB of GPU texture memory.
 * If we navigate away without clearing it, the browser may terminate
 * the tab and users lose progress on return.
 */

import { useEffect, useRef, useCallback } from "react";
import { particlePool } from "../utils/ObjectPool";

type Cleanup = () => void;

interface SceneCleanupReturn {
  /** Register a cleanup function to run on unmount */
  registerCleanup: (fn: Cleanup) => void;
  /** Register a timeout that will be auto-cleared on unmount */
  registerTimeout: (id: ReturnType<typeof setTimeout>) => void;
  /** Register an interval that will be auto-cleared on unmount */
  registerInterval: (id: ReturnType<typeof setInterval>) => void;
  /** Manually trigger all cleanups (e.g. on game-over before navigation) */
  cleanup: () => void;
}

export function useSceneCleanup(
  canvasRef: React.RefObject<HTMLCanvasElement>
): SceneCleanupReturn {
  const cleanupFns  = useRef<Cleanup[]>([]);
  const timeouts    = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const intervals   = useRef<Set<ReturnType<typeof setInterval>>>(new Set());
  const cleanedRef  = useRef(false);

  const cleanup = useCallback(() => {
    if (cleanedRef.current) return;
    cleanedRef.current = true;

    // Run registered cleanup functions
    for (const fn of cleanupFns.current) {
      try { fn(); } catch { /* never let a cleanup crash the others */ }
    }
    cleanupFns.current = [];

    // Clear all timeouts
    for (const id of timeouts.current) clearTimeout(id);
    timeouts.current.clear();

    // Clear all intervals
    for (const id of intervals.current) clearInterval(id);
    intervals.current.clear();

    // Return all particles to pool
    particlePool.releaseAll();

    // Clear canvas to free GPU texture memory
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      // Setting dimensions to 0 releases the GPU allocation
      canvas.width  = 1;
      canvas.height = 1;
    }
  }, [canvasRef]);

  const registerCleanup = useCallback((fn: Cleanup) => {
    cleanupFns.current.push(fn);
  }, []);

  const registerTimeout = useCallback((id: ReturnType<typeof setTimeout>) => {
    timeouts.current.add(id);
  }, []);

  const registerInterval = useCallback((id: ReturnType<typeof setInterval>) => {
    intervals.current.add(id);
  }, []);

  useEffect(() => {
    cleanedRef.current = false;
    return cleanup;
  }, [cleanup]);

  return { registerCleanup, registerTimeout, registerInterval, cleanup };
}

// ─── Audio cleanup helper ─────────────────────────────────────────────────────

/**
 * Suspend the AudioContext when the game scene unmounts.
 * An unsuspended AudioContext keeps the audio thread alive even after
 * the canvas is gone — wasting CPU and battery on mobile.
 */
export async function suspendAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === "running") {
    try {
      await ctx.suspend();
    } catch {
      // Safari may throw if the context was already closed
    }
  }
}

/**
 * Resume (or create-and-resume) an AudioContext.
 * iOS requires a user gesture before any AudioContext runs.
 * Call this in a touch/click handler, not at mount time.
 */
export async function resumeAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      // Ignore; audio will stay silent rather than crashing
    }
  }
}