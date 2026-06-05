"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { musicManager } from "@/managers/MusicManager";

const MUSIC_VIEWS = new Set<string>([
  "menu",
  "briefing",
  "result",
  "session-end",
  "leaderboard",
]);

export function useBackgroundMusic(): void {
  const currentView = useGameStore((s) => s.currentView);
  const settings = useGameStore((s) => s.settings);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (MUSIC_VIEWS.has(currentView)) {
      musicManager.play("menu", 300);
    } else {
      musicManager.stopAll();
    }
    
    return () => {
      musicManager.stopAll();
    };
  }, [currentView]);

  useEffect(() => {
    musicManager.updateVolume();
  }, [settings.masterVolume, settings.musicVolume]);
}