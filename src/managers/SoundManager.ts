// src/managers/SoundManager.ts

import { Howl, Howler } from "howler";
import { useGameStore } from "@/store/gameStore";

// ADDED: Exported SoundCategory to satisfy index.ts without losing features
export type SoundCategory = "ui" | "sfx" | "music" | "ambient" | "voice";

export type SoundId =
  | "hover"
  | "click"
  | "confirm"
  | "back"
  | "shatter"
  | "crowd_gasp"
  | "step"
  | "jump"
  | "land"
  | "eliminated"
  | "victory"
  | "player_step"
  | "player_jump"
  | "player_land"
  | "player_eliminated"
  | "player_victory"
  | "countdown_beep"
  | "countdown_go"
  | "doll_turn"
  | "crowd_cheer"
  | "drone_root"
  | "room_tone"
  | "scan_tone"
  | "heartbeat";

interface SoundDefinition {
  src: string[];
  volume?: number;
  loop?: boolean;
  maxOverlap?: number;
}

const SOUND_DEFS: Record<SoundId, SoundDefinition> = {
  hover:   { src: ["/audio/ui/hover.mp3"], volume: 0.4, maxOverlap: 5 },
  click:   { src: ["/audio/ui/click.mp3"], volume: 0.5, maxOverlap: 5 },
  confirm: { src: ["/audio/ui/confirm.mp3"], volume: 0.6, maxOverlap: 2 },
  back:    { src: ["/audio/ui/back.mp3"], volume: 0.5, maxOverlap: 2 },
  shatter: { src: ["/audio/sfx/shatter.mp3"], volume: 0.85, maxOverlap: 2 },
  player_step:       { src: ["/audio/sfx/step.mp3"], volume: 0.3, maxOverlap: 6 },
  player_jump:       { src: ["/audio/sfx/jump.mp3"], volume: 0.4, maxOverlap: 2 },
  player_land:       { src: ["/audio/sfx/land.mp3"], volume: 0.5, maxOverlap: 2 },
  player_eliminated: { src: ["/audio/sfx/elimination.mp3"], volume: 0.9, maxOverlap: 3 },
  player_victory:    { src: ["/audio/sfx/victory.mp3"], volume: 0.8, maxOverlap: 1 },
  countdown_beep:    { src: ["/audio/percussion/countdown-clicks-loop.mp3"], volume: 0.6, maxOverlap: 1 },
  countdown_go:      { src: ["/audio/sfx/alarm.mp3"], volume: 0.45, maxOverlap: 1 },
  doll_turn:         { src: ["/audio/stingers/doll_song.mp3"], volume: 0.95, maxOverlap: 1 },
  crowd_cheer:       { src: ["/audio/sfx/victory.mp3"], volume: 0.6, maxOverlap: 1 },
  drone_root:        { src: ["/audio/drone/drone-root-loop.mp3"], volume: 0.3, loop: true, maxOverlap: 1 },
  room_tone:         { src: ["/audio/ambient/room-tone-loop.mp3"], volume: 0.3, loop: true, maxOverlap: 1 },
  scan_tone:         { src: ["/audio/tension/scan-tone-loop.mp3"], volume: 0.22, loop: true, maxOverlap: 1 },
  crowd_gasp:  { src: ["/audio/sfx/gasp.mp3"], volume: 0.8, maxOverlap: 2 },
  step:        { src: ["/audio/sfx/step.mp3"], volume: 0.3, maxOverlap: 6 },
  jump:        { src: ["/audio/sfx/jump.mp3"], volume: 0.4, maxOverlap: 2 },
  land:        { src: ["/audio/sfx/land.mp3"], volume: 0.5, maxOverlap: 2 },
  eliminated:  { src: ["/audio/sfx/elimination.mp3"], volume: 0.9, maxOverlap: 3 },
  victory:     { src: ["/audio/sfx/victory.mp3"], volume: 0.8, maxOverlap: 1 },
  heartbeat:   { src: ["/audio/sfx/heartbeat.mp3"], volume: 1.0, loop: true, maxOverlap: 1 },
};

export class SoundManager {
  private static _instance: SoundManager;

  private _sounds: Map<SoundId, Howl> = new Map();
  private _liveOneShots: Map<SoundId, number[]> = new Map();
  private _activeLoops: Map<SoundId, { howl: Howl; instanceId: number; baseVolume: number }> = new Map();

  private _masterVolume: number = 1.0;
  private _sfxVolume: number = 1.0;
  private _musicVolume: number = 1.0;
  private _muted: boolean = false;
  private _unlocked: boolean = false;
  private _destroyed: boolean = false;

  private constructor() {
    // 1. Initialize volumes from persistent store settings immediately
    // This ensures early sounds (like UI clicks in the main menu) adhere to user preferences
    try {
      const state = useGameStore.getState();
      if (state && state.settings) {
        this._masterVolume = state.settings.masterVolume ?? 1.0;
        this._sfxVolume = state.settings.sfxVolume ?? 1.0;
        this._musicVolume = state.settings.musicVolume ?? 1.0;
      }
      
      // 2. Subscribe to store changes so settings automatically apply anywhere without extra boilerplate
      useGameStore.subscribe((newState, oldState) => {
        if (!newState || !oldState) return;
        
        if (newState.settings.masterVolume !== oldState.settings.masterVolume) {
          this.setMasterVolume(newState.settings.masterVolume);
        }
        if (newState.settings.sfxVolume !== oldState.settings.sfxVolume) {
          this.setSFXVolume(newState.settings.sfxVolume);
        }
        if (newState.settings.musicVolume !== oldState.settings.musicVolume) {
          this.setMusicVolume(newState.settings.musicVolume);
        }
      });
    } catch (e) {
      console.warn("SoundManager: Could not initialize volumes from store", e);
    }

    // 3. Audio context unlock for browsers
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const unlock = () => {
        if (!this._unlocked) {
          this._unlocked = true;
          if (Howler.ctx && Howler.ctx.state === "suspended") {
            Howler.ctx.resume();
          }
        }
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
      };
      document.addEventListener("pointerdown", unlock);
      document.addEventListener("keydown", unlock);
    }
  }

  public static getInstance(): SoundManager {
    if (!SoundManager._instance) {
      SoundManager._instance = new SoundManager();
    }
    return SoundManager._instance;
  }

  private _load(id: SoundId): void {
    if (this._sounds.has(id)) return;
    const def = SOUND_DEFS[id];
    if (!def) return;

    const howlerPool = Math.max(1, def.maxOverlap ?? 1) + 1;
    const howl = new Howl({
      src: def.src,
      volume: (def.volume ?? 1) * this._masterVolume,
      loop: def.loop ?? false,
      pool: howlerPool,
      preload: true,
    });

    this._sounds.set(id, howl);
    this._liveOneShots.set(id, []);
  }

  public play(id: SoundId, volumeMult = 1, pan = 0): number | undefined {
    if (this._muted || this._destroyed) return;
    if (!this._sounds.has(id)) this._load(id);

    const howl = this._sounds.get(id);
    if (!howl) return;

    const def = SOUND_DEFS[id];
    const maxOverlap = def?.maxOverlap ?? 1;
    const activeInstances = this._liveOneShots.get(id) || [];

    if (activeInstances.length >= maxOverlap) {
      const oldest = activeInstances.shift();
      if (oldest !== undefined) howl.stop(oldest);
    }

    const instanceId = howl.play();
    activeInstances.push(instanceId);
    this._liveOneShots.set(id, activeInstances);

    howl.volume((def?.volume ?? 1) * this._sfxVolume * this._masterVolume * volumeMult, instanceId);
    if (pan !== 0) howl.stereo(pan, instanceId);

    howl.once("end", () => {
      const arr = this._liveOneShots.get(id);
      if (arr) {
        const idx = arr.indexOf(instanceId);
        if (idx !== -1) arr.splice(idx, 1);
      }
    }, instanceId);

    return instanceId;
  }

  public loop(id: SoundId, volumeMult = 1): void {
    if (this._muted || this._destroyed) return;
    if (this._activeLoops.has(id)) return;

    if (!this._sounds.has(id)) this._load(id);
    const howl = this._sounds.get(id);
    if (!howl) return;

    const def = SOUND_DEFS[id];
    const baseVol = (def?.volume ?? 1) * volumeMult;

    const instanceId = howl.play();
    howl.loop(true, instanceId);
    howl.volume(baseVol * this._sfxVolume * this._masterVolume, instanceId);

    this._activeLoops.set(id, { howl, instanceId, baseVolume: baseVol });
  }

  public setLoopRate(id: SoundId, rate: number): void {
    const active = this._activeLoops.get(id);
    if (active) {
      active.howl.rate(rate, active.instanceId);
    }
  }

  public stop(id: SoundId): void {
    const live = this._liveOneShots.get(id);
    if (live) {
      const howl = this._sounds.get(id);
      if (howl) {
        for (const iid of live) howl.stop(iid);
      }
      live.length = 0;
    }
  }

  public stopLoop(id: SoundId, fadeMs: number = 300): void {
    const active = this._activeLoops.get(id);
    if (!active) return;

    const { howl, instanceId } = active;
    this._activeLoops.delete(id);

    if (fadeMs > 0) {
      const currentVol = (howl.volume(instanceId) as number) || 0;
      howl.fade(currentVol, 0, fadeMs, instanceId);
      setTimeout(() => { howl.stop(instanceId); }, fadeMs + 50);
    } else {
      howl.stop(instanceId);
    }
  }

  public stopAll(fadeMs: number = 0): void {
    for (const id of Array.from(this._sounds.keys())) {
      this.stop(id);
      this.stopLoop(id, fadeMs);
    }
  }

  public stopAllLoops(fadeMs: number = 300): void {
    for (const id of Array.from(this._activeLoops.keys())) {
      this.stopLoop(id, fadeMs);
    }
  }

  public fade(id: SoundId, toVolumeMult: number, durationMs: number): void {
    const active = this._activeLoops.get(id);
    if (active) {
      const { howl, instanceId, baseVolume } = active;
      const targetVol = baseVolume * this._sfxVolume * this._masterVolume * toVolumeMult;
      const currentVol = (howl.volume(instanceId) as number) || 0;
      howl.fade(currentVol, targetVol, durationMs, instanceId);
    }
  }

  public setHeartbeatIntensity(intensity: number): void {
    if (intensity > 0) {
      if (!this._activeLoops.has("heartbeat")) this.loop("heartbeat", intensity);
      else this.fade("heartbeat", intensity, 200);
    } else {
      this.stopLoop("heartbeat", 500);
    }
  }

  public setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    this._updateActiveVolumes();
  }

  public setSFXVolume(volume: number): void {
    this._sfxVolume = Math.max(0, Math.min(1, volume));
    this._updateActiveVolumes();
  }

  public setMusicVolume(volume: number): void {
    this._musicVolume = Math.max(0, Math.min(1, volume));
    this._updateActiveVolumes();
  }

  public setMuted(muted: boolean): void {
    this._muted = muted;
    Howler.mute(muted);
    if (!muted) this._updateActiveVolumes();
  }

  private _updateActiveVolumes(): void {
    for (const active of Array.from(this._activeLoops.values())) {
      const targetVol = active.baseVolume * this._sfxVolume * this._masterVolume;
      active.howl.volume(targetVol, active.instanceId);
    }
  }
  
  get isMuted(): boolean { return this._muted; }
  get masterVolume(): number { return this._masterVolume; }
  get sfxVolume(): number { return this._sfxVolume; }
  get musicVolume(): number { return this._musicVolume; }
  get isUnlocked(): boolean { return this._unlocked; }

  public preload(ids: SoundId[]): void {
    for (const id of ids) this._load(id);
  }

  public unload(id: SoundId): void {
    this.stopLoop(id, 0);
    const live = this._liveOneShots.get(id);
    if (live) {
      const howl = this._sounds.get(id);
      if (howl) {
        for (const iid of live) { try { howl.stop(iid); } catch { /* ignore */ } }
      }
      this._liveOneShots.delete(id);
    }
    const howl = this._sounds.get(id);
    if (howl) { 
      howl.unload(); 
      this._sounds.delete(id); 
    }
  }

  public destroy(): void {
    this._destroyed = true;
    this.stopAll(0);
    for (const howl of Array.from(this._sounds.values())) howl.unload();
    this._sounds.clear();
    this._liveOneShots.clear();
    this._activeLoops.clear();
  }
}