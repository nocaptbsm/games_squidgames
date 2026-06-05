"use client";

import { useEffect, useRef, useCallback } from "react";
import { SoundManager, type SoundId } from "../managers/SoundManager";
import { useGameStore } from "../store/gameStore";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface SoundManagerHandle {
  /** Play a one-shot sound. exactRate is accepted by the interface but silently
   *  ignored at the SoundManager layer (which only exposes rateJitter). */
  play:         (id: SoundId, cooldownMs?: number, rateJitter?: number, exactRate?: number | null) => void;
  loop:         (id: SoundId) => void;
  stop:         (id: SoundId, fadeMs?: number) => void;
  stopAll:      () => void;
  /** Fade a sound to a target volume. Delegates to SoundManager.fade(). */
  fadeTo:       (id: SoundId, vol: number, ms: number) => void;
  setHeartbeat: (level: number) => void;
  preload:      (ids: SoundId[]) => void;
  /** No-op — SoundManager manages AudioContext unlock internally. */
  unlock:       () => void;
  manager:      () => SoundManager;
}

export function useSoundManager(): SoundManagerHandle {
  const master = useGameStore((s) => s.settings.masterVolume);
  const sfx    = useGameStore((s) => s.settings.sfxVolume);
  const music  = useGameStore((s) => s.settings.musicVolume);
  const muted  = master === 0;

  const smRef = useRef<SoundManager>(SoundManager.getInstance());

  useEffect(() => {
    const sm = smRef.current;
    sm.setMasterVolume(master);
    sm.setSFXVolume(sfx);
    sm.setMusicVolume(music);
  }, [master, sfx, music]);

  useEffect(() => {
    smRef.current.setMuted(muted);
  }, [muted]);

  // SoundManager handles AudioContext unlock via its own internal listeners,
  // so we don't need to call a (non-existent) sm.unlock() here.

  const handleRef = useRef<SoundManagerHandle>({
    // play() on SoundManager accepts up to 3 args; exactRate is intentionally dropped.
    play:         (id, cdMs = 0, jitter = 0) => smRef.current.play(id, cdMs, jitter),
    loop:         (id)           => smRef.current.loop(id),
    stop:         (id, ms = 600) => smRef.current.stopLoop(id, ms),
    stopAll:      ()             => smRef.current.stopAll(),
    // SoundManager exposes .fade(), not .fadeTo()
    fadeTo:       (id, vol, ms)  => smRef.current.fade(id, vol, ms),
    setHeartbeat: (level)        => smRef.current.setHeartbeatIntensity(level),
    preload:      (ids)          => smRef.current.preload(ids),
    unlock:       ()             => { /* SoundManager manages unlock internally */ },
    manager:      ()             => smRef.current,
  });

  return handleRef.current;
}

// ─── Convenience: useUISound ──────────────────────────────────────────────────

export function useUISound() {
  const sm = useSoundManager();

  // Cast required because the SoundId union in SoundManager.ts predates these
  // UI sound entries — the sounds exist at runtime but aren't yet in the type.
  const onClick   = useCallback(() => sm.play("ui_click"   as SoundId,  80),  [sm]);
  const onHover   = useCallback(() => sm.play("ui_hover"   as SoundId,  60),  [sm]);
  const onConfirm = useCallback(() => sm.play("ui_confirm" as SoundId, 200),  [sm]);
  const onBack    = useCallback(() => sm.play("ui_back"    as SoundId, 200),  [sm]);

  return { onClick, onHover, onConfirm, onBack };
}