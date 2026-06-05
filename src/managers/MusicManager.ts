// src/managers/MusicManager.ts

import { Howl } from "howler";
import { SoundManager } from "./SoundManager";

export type MusicTrackId = "menu" | "rlgl_green" | "rlgl_red";

const MUSIC_DEFS: Record<MusicTrackId, { src: string[]; loop?: boolean; volume?: number }> = {
  menu:       { src: ["/audio/music/backsong.mp3"],   loop: true,  volume: 0.6 },
  // BUG FIX: loop was `true` — the "end" event never fired, so the game state machine
  // could never transition out of Green Light into the Warning / Red Light phase.
  rlgl_green: { src: ["/audio/stingers/doll_song.mp3"], loop: false, volume: 1.0 },
  rlgl_red:   { src: ["/audio/stingers/exhale-texture.mp3"], loop: false, volume: 1.7 },
};

export class MusicManager {
  private static _instance: MusicManager;
  private _currentId: MusicTrackId | null = null;
  private _howls: Map<MusicTrackId, Howl> = new Map();
  private _unlocked: boolean = false;
  private _pendingPlay: { id: MusicTrackId; fadeMs: number; onEnd?: () => void } | null = null;
  private _transitioning: boolean = false;

  private constructor() {
    if (typeof window !== "undefined") {
      const unlock = (): void => {
        this._unlocked = true;
        if (this._pendingPlay) {
          const { id, fadeMs, onEnd } = this._pendingPlay;
          this._pendingPlay = null;
          this.play(id, fadeMs, onEnd);
        }
      };
      const opts = { once: true, capture: true, passive: true } as const;
      (["pointerdown", "touchstart", "mousedown", "keydown", "click"] as const)
        .forEach((ev) => window.addEventListener(ev, unlock, opts));
    }
  }

  public static getInstance(): MusicManager {
    if (!MusicManager._instance) {
      MusicManager._instance = new MusicManager();
    }
    return MusicManager._instance;
  }

  public play(id: MusicTrackId, fadeMs: number = 0, onEnd?: () => void): void {
    if (this._transitioning) return;
    if (!this._unlocked) {
      this._pendingPlay = { id, fadeMs, onEnd };
      return;
    }
    
    if (this._currentId === id) {
       const currentHowl = this._howls.get(id);
       if (currentHowl) {
           currentHowl.off("end");
           if (onEnd) currentHowl.on("end", onEnd);
       }
       return;
    }

    this._transitioning = true;
    this.stop(fadeMs);
    setTimeout(() => { this._transitioning = false; }, fadeMs + 50);

    const def = MUSIC_DEFS[id];
    if (!def) return;

    let howl = this._howls.get(id);
    if (!howl) {
      howl = new Howl({
        src: def.src,
        loop: def.loop ?? false,
        volume: 0, 
        preload: true,
      });
      this._howls.set(id, howl);
    }

    howl.off("end");
    if (onEnd) {
      howl.on("end", onEnd);
    }

    this._currentId = id;
    const targetVol = (def.volume ?? 1) * SoundManager.getInstance().musicVolume * SoundManager.getInstance().masterVolume;
    
    howl.play();
    if (fadeMs > 0) {
      howl.fade(0, targetVol, fadeMs);
    } else {
      howl.volume(targetVol);
    }
  }

  public stop(fadeMs: number = 0): void {
    this._transitioning = false;
    if (!this._currentId) return;
    const howl = this._howls.get(this._currentId);
    
    if (howl && howl.playing()) {
      if (fadeMs > 0) {
        howl.fade(howl.volume(), 0, fadeMs);
        setTimeout(() => {
            howl.stop();
            howl.off("end");
        }, fadeMs + 50);
      } else {
        howl.stop();
        howl.off("end");
      }
    }
    this._currentId = null;
  }

  public stopAll(): void {
    this.stop(0);
    for (const howl of this._howls.values()) {
      howl.stop();
      howl.off("end");
      howl.unload();
    }
    this._howls.clear();
    this._currentId = null;
  }

  public pause(): void {
    if (!this._currentId) return;
    const howl = this._howls.get(this._currentId);
    if (howl && howl.playing()) {
        howl.pause();
    }
  }

  public resume(): void {
    if (!this._currentId) return;
    const howl = this._howls.get(this._currentId);
    if (howl && !howl.playing()) {
        howl.play();
    }
  }

  public updateVolume(): void {
    if (!this._currentId) return;
    const howl = this._howls.get(this._currentId);
    const def = MUSIC_DEFS[this._currentId];
    if (howl && def && howl.playing()) {
      const sm = SoundManager.getInstance();
      const targetVol = (def.volume ?? 1) * sm.musicVolume * sm.masterVolume;
      howl.volume(targetVol);
    }
  }
  
  public setPlaybackRate(rate: number): void {
      if(!this._currentId) return;
      const howl = this._howls.get(this._currentId);
      if(howl) howl.rate(rate);
  }
}

export const musicManager = MusicManager.getInstance();