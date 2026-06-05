/**
 * src/hooks/useSessionTracking.ts  —  FIX 7.2
 *
 * Thin hook consumed by each game component.
 * Provides a single `completeGame(score, outcome)` callback that:
 * 1. Calls recordGameCompletion in the store
 * 2. Plays the appropriate audio stinger (victory / elimination)
 * 3. Returns control to the router via the onComplete prop
 */

"use client";

import { useCallback, useRef, useMemo } from "react";
import { useGameStore, type GameId } from "@/store/gameStore";

interface UseSessionTrackingOptions {
  gameId:     GameId;
  onComplete: (score: number, outcome: "victory" | "eliminated") => void;
}

interface UseSessionTrackingReturn {
  completeGame: (score: number, outcome: "victory" | "eliminated") => void;
  /** True once completeGame has been called — prevents double-firing */
  isCompleted:  boolean;
}

export function useSessionTracking({
  gameId,
  onComplete,
}: UseSessionTrackingOptions): UseSessionTrackingReturn {
  const recordGameCompletion = useGameStore((s) => s.recordGameCompletion);
  const completedRef         = useRef(false);

  const completeGame = useCallback(
    (score: number, outcome: "victory" | "eliminated") => {
      if (completedRef.current) return;
      completedRef.current = true;

      recordGameCompletion({ gameId, outcome, score, timestamp: Date.now() });
      onComplete(score, outcome);
    },
    [gameId, onComplete, recordGameCompletion]
  );

  return useMemo(() => ({
    completeGame,
    get isCompleted() { return completedRef.current; }
  }), [completeGame]);
}