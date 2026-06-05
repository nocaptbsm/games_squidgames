// src/components/games/DalgonaCandy.tsx
"use client";

import React, { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { SoundManager } from "@/managers/SoundManager";

interface DalgonaCandyProps {
  onExit?: () => void;
  onComplete?: (score: number, outcome: "victory" | "eliminated") => void;
}

export default function DalgonaCandy({ onExit, onComplete }: DalgonaCandyProps) {
  const triggerElimination = useGameStore((s) => s.triggerElimination);
  const setRuntimePhase    = useGameStore((s) => s.setRuntimePhase);

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
          if (onComplete) onComplete(15000, "victory");
          break;
        case 'DALGONA_ELIMINATED':
          SoundManager.getInstance().play("eliminated");
          triggerElimination({ sourceGame: "dalgona", reason: e.data.reason || "candy-snapped" });
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
    <div style={{ width: "100%", height: "100%", background: "#080401" }}>
      <iframe 
        src="/dalgona.html" 
        style={{ width: "100%", height: "100%", border: "none" }}
        title="Dalgona Candy"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}