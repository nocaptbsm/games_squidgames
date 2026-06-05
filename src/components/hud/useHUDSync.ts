"use client";

import { useRef, useCallback, useMemo } from "react";
import { useGameStore } from "../../store/gameStore";
import type { HUDState } from "../../store/gameStore";

/**
 * useHUDSync
 *
 * Bridge between the 60 FPS game loop (refs) and the React HUD (Zustand).
 * The game loop writes into a mutable ref every frame at zero cost.
 * A throttled flush pushes snapshots into Zustand at ~15 FPS so React
 * only re-renders when values actually change — not 60× per second.
 */

interface HUDSyncOptions {
  /** How often to push ref state into Zustand (ms). Default: 66ms ≈ 15 fps */
  flushInterval?: number;
}

export interface HUDSyncHandle {
  /** Write raw game values every frame — zero React cost */
  write: (patch: Partial<HUDState>) => void;
  /** Call from game loop tick — flushes to Zustand if interval elapsed */
  tick: (timestamp: number) => void;
  /** Force an immediate flush (e.g. on game-over, level-up) */
  forceFlush: () => void;
  /** Read the current buffered state (ref, not Zustand) */
  read: () => Readonly<HUDState>;
}

const DEFAULT_FLUSH_INTERVAL = 66; // ~15 fps for HUD React updates

export function useHUDSync(options: HUDSyncOptions = {}): HUDSyncHandle {
  const { flushInterval = DEFAULT_FLUSH_INTERVAL } = options;

  const setHUD        = useGameStore((s) => s.setHUD);
  const initialHUD    = useGameStore((s) => s.hud);

  // Mutable buffer — written every frame by game loop at zero React cost
  const bufferRef     = useRef<HUDState>({ ...initialHUD });
  const lastFlushRef  = useRef<number>(0);
  const dirtyRef      = useRef<boolean>(false);

  const write = useCallback((patch: Partial<HUDState>) => {
    Object.assign(bufferRef.current, patch);
    dirtyRef.current = true;
  }, []);

  const flush = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    // Snapshot the buffer before handing to React
    setHUD({ ...bufferRef.current });
  }, [setHUD]);

  const tick = useCallback(
    (timestamp: number) => {
      if (timestamp - lastFlushRef.current >= flushInterval) {
        lastFlushRef.current = timestamp;
        flush();
      }
    },
    [flush, flushInterval]
  );

  const forceFlush = useCallback(() => {
    dirtyRef.current = true;
    flush();
  }, [flush]);

  const read = useCallback((): Readonly<HUDState> => {
    return bufferRef.current;
  }, []);

  return useMemo(() => ({
    write,
    tick,
    forceFlush,
    read
  }), [write, tick, forceFlush, read]);
}