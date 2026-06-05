// src/hooks/useMenuAudio.ts
"use client";

import { useCallback } from "react";
import { SoundId, SoundManager } from "@/managers/SoundManager";
import { musicManager } from "@/managers/MusicManager";

type SoundName = "hover" | "click" | "open" | "transition" | "exit";

interface MenuAudioController {
  play:    (name: SoundName) => void;
  startBg: () => void;
  stopBg:  () => void;
}

const SOUND_MAP: Record<SoundName, SoundId> = {
  hover: "hover",
  click: "click",
  exit: "eliminated",
  open: "hover",
  transition: "click" 
};

export function useMenuAudio(): MenuAudioController {
  const sm = SoundManager.getInstance();

  const play = useCallback((name: SoundName) => {
    const id = SOUND_MAP[name];
    sm.play(id);
  }, [sm]);

  const startBg = useCallback(() => {
    musicManager.play("menu", 600);
  }, []);

  const stopBg = useCallback(() => {
    musicManager.stop(600);
  }, []);

  return { play, startBg, stopBg };
}