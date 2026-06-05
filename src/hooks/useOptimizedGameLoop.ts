/**
 * useOptimizedGameLoop.ts
 *
 * Production-grade rAF loop with:
 * - Fixed timestep (deterministic physics regardless of frame rate)
 * - Delta clamping (prevents "spiral of death" on slow devices)
 * - Frame-budget enforcement (skip render if update took too long)
 * - Visibility-based pause (saves battery when tab is hidden)
 * - Slow-motion support via a timeScale factor
 * - Performance.now() for monotonic, high-res timing
 */

import { useRef, useEffect, useCallback } from "react";

const FIXED_DT    = 1 / 60;      // 16.67ms physics step
const MAX_DELTA   = 0.1;         // clamp to 100ms max (6 dropped frames)
const MAX_STEPS   = 5;           // max physics steps per render frame (spiral guard)
const RENDER_BUDGET_MS = 14;     // if we're over this, skip non-critical render

export interface GameLoopCallbacks {
  update: (dt: number, timeScale: number) => void;
  render: (alpha: number) => void;
  onVisibilityChange?: (visible: boolean) => void;
}

interface GameLoopOptions {
  initialTimeScale?: number;
  pauseOnHidden?: boolean;
}

interface GameLoopControls {
  setTimeScale: (scale: number) => void;
  setPaused: (paused: boolean) => void;
  getFPS: () => number;
}

export function useOptimizedGameLoop(
  callbacks: GameLoopCallbacks,
  options: GameLoopOptions = {}
): GameLoopControls {
  const { initialTimeScale = 1, pauseOnHidden = true } = options;

  const rafHandle    = useRef<number>(0);
  const lastTime     = useRef<number>(-1);
  const accumulator  = useRef<number>(0);
  const timeScaleRef = useRef<number>(initialTimeScale);
  const pausedRef    = useRef<boolean>(false);
  const fpsRef       = useRef<number>(60);
  const fpsSamples   = useRef<number[]>([]);

  const updateRef = useRef(callbacks.update);
  const renderRef = useRef(callbacks.render);
  const visibilityRef = useRef(callbacks.onVisibilityChange);
  useEffect(() => { updateRef.current = callbacks.update; });
  useEffect(() => { renderRef.current = callbacks.render; });
  useEffect(() => { visibilityRef.current = callbacks.onVisibilityChange; });

  const loop = useCallback(function loopFn(timestamp: number) {
    rafHandle.current = requestAnimationFrame(loopFn);

    if (pausedRef.current) {
      lastTime.current = -1; 
      return;
    }

    if (lastTime.current < 0) {
      lastTime.current = timestamp;
      return;
    }

    const rawDelta = (timestamp - lastTime.current) / 1000;
    lastTime.current = timestamp;
    const clampedDelta = Math.min(rawDelta, MAX_DELTA);

    const rawFPS = 1 / rawDelta;
    fpsSamples.current.push(rawFPS);
    if (fpsSamples.current.length > 30) fpsSamples.current.shift();
    fpsRef.current =
      fpsSamples.current.reduce((a, b) => a + b, 0) / fpsSamples.current.length;

    const scaledDelta = clampedDelta * timeScaleRef.current;
    accumulator.current += scaledDelta;

    const frameStart = performance.now();
    let steps = 0;

    while (accumulator.current >= FIXED_DT && steps < MAX_STEPS) {
      updateRef.current(FIXED_DT, timeScaleRef.current);
      accumulator.current -= FIXED_DT;
      steps++;
    }

    const updateTime = performance.now() - frameStart;
    const alpha = accumulator.current / FIXED_DT;

    if (updateTime < RENDER_BUDGET_MS) {
      renderRef.current(alpha);
    }
  }, []);

  useEffect(() => {
    rafHandle.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafHandle.current);
  }, [loop]);

  useEffect(() => {
    if (!pauseOnHidden) return;

    const handleVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      pausedRef.current = hidden;
      visibilityRef.current?.(!hidden);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pauseOnHidden]);

  const setTimeScale = useCallback((scale: number) => {
    timeScaleRef.current = Math.max(0, scale);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    pausedRef.current = paused;
    if (!paused) lastTime.current = -1;
  }, []);

  const getFPS = useCallback(() => fpsRef.current, []);

  return { setTimeScale, setPaused, getFPS };
}