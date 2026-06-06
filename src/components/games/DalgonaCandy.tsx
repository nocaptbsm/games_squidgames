// src/components/games/DalgonaCandy.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useGameStore } from "@/store/gameStore";
import { SoundManager } from "@/managers/SoundManager";
import { GameResultBoard } from "@/components/ui/GameResultBoard";

interface DalgonaCandyProps {
  onExit?: () => void;
  onComplete?: (score: number, outcome: "victory" | "eliminated") => void;
}

export default function DalgonaCandy({ onExit, onComplete }: DalgonaCandyProps) {
  const triggerElimination = useGameStore((s) => s.triggerElimination);
  const setRuntimePhase    = useGameStore((s) => s.setRuntimePhase);

  const [endState, setEndState] = useState<{
    outcome: "victory" | "eliminated";
    score: number;
    detail: string;
  } | null>(null);

  const handleRestart = useCallback(() => {
    setEndState(null);
    // Reload the iframe game by toggling visibility
    // The iFrame src is static so the simplest restart is remounting via key
    setIframeKey((k) => k + 1);
  }, []);

  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    return () => {
      SoundManager.getInstance().stopAll(0);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data.type !== 'string') return;

      switch (e.data.type) {
        case 'DALGONA_SUCCESS':
          SoundManager.getInstance().play("victory");
          setRuntimePhase("victory");
          setEndState({ outcome: "victory", score: 15000, detail: "Shape traced perfectly" });
          if (onComplete) onComplete(15000, "victory");
          break;
        case 'DALGONA_ELIMINATED':
          SoundManager.getInstance().play("eliminated");
          triggerElimination({ sourceGame: "dalgona", reason: e.data.reason || "candy-snapped" });
          setEndState({ outcome: "eliminated", score: 0, detail: e.data.reason === "timeout" ? "Ran out of time" : "Candy snapped" });
          if (onComplete) onComplete(0, "eliminated");
          break;
        case 'DALGONA_MENU':
          SoundManager.getInstance().play("back");
          if (onExit) onExit();
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onExit, onComplete, triggerElimination, setRuntimePhase]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#080401", position: "relative" }}>
      <iframe
        key={iframeKey}
        src="/dalgona.html"
        style={{ width: "100%", height: "100%", border: "none" }}
        title="Dalgona Candy"
        sandbox="allow-scripts allow-same-origin"
      />

      {endState && (
        <GameResultBoard
          gameTitle="Dalgona Candy"
          gameSubtitle="ROUND 3 — DALGONA CANDY"
          score={endState.score}
          rows={[
            {
              participantNumber: 456,
              name: "PLAYER",
              outcome: endState.outcome === "victory" ? "survived" : "eliminated",
              detail: endState.detail,
              isPlayer: true,
            },
            { participantNumber: 67, name: "PARTICIPANT 067", outcome: endState.outcome === "victory" ? "survived" : "eliminated" },
            { participantNumber: 101, name: "PARTICIPANT 101", outcome: "eliminated" },
            { participantNumber: 199, name: "PARTICIPANT 199", outcome: "eliminated" },
            { participantNumber: 212, name: "PARTICIPANT 212", outcome: endState.outcome === "victory" ? "survived" : "eliminated" },
            { participantNumber: 324, name: "PARTICIPANT 324", outcome: "eliminated" },
          ]}
          onRestart={handleRestart}
          onMenu={onExit}
        />
      )}
    </div>
  );
}