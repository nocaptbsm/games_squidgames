// src/managers/RLGLAudioController.ts
/**
 * RLGLAudioController — Deterministic Audio State Machine for Red Light / Green Light.
 *
 * ROOT CAUSES ADDRESSED
 * ─────────────────────
 * 1. TRIPLE AUDIO SYSTEM: RedLightGreenLight.tsx simultaneously managed sound
 *    via (a) raw HTMLAudioElement refs (customGreenLightAudio / customRedLightAudio),
 *    (b) SoundManager Howl instances, and (c) the useGameAudio hook.  All three
 *    could be active at the same time, producing echoes and duplicated HTTP requests
 *    for the same file.
 *
 * 2. WRONG FILE PATHS IN SOUNDMANAGER FALLBACK:
 *    "doll_song"        → "/audio/sfx/doll_song.mp3"         (FILE DOES NOT EXIST)
 *    "red_light_stinger"→ "/audio/stingers/exhale-texture.mp3" (FILE DOES NOT EXIST)
 *    The correct paths are "/audio/sfx/squid_game_doll_song.mp3" and
 *    "/audio/sfx/exhale-texture.mp3".  The raw HTMLAudioElement refs happened to
 *    work only because duplicate files were copied to the public root as
 *    "/doll_song.mp3" and "/exhale-texture.mp3".
 *
 * 3. NO MUTUAL EXCLUSIVITY GUARANTEE: green and red audio were controlled by
 *    separate if-branches with no shared state — a race condition between game
 *    ticks could fire both in the same frame.
 *
 * 4. NO SCENE CLEANUP PATHWAY: customGreenLightAudio's pause() / currentTime
 *    reset were spread across resetGame(), onExit JSX handler, ESC key handler,
 *    and onVisibilityChange — with no central teardown for unmount.
 *
 * STATE MACHINE
 * ─────────────
 *   IDLE          No game audio playing.
 *   GREEN_LIGHT   squid_game_doll_song.mp3 looping; red stinger stopped.
 *   RED_LIGHT     Doll song hard-cut; exhale-texture.mp3 one-shot.
 *   ELIMINATED    All musical content stopped. (SFX via SoundManager.)
 *   VICTORY       All musical content stopped. (SFX via SoundManager.)
 *
 * TRANSITION RULES
 * ────────────────
 *   GREEN → RED      : green loop hard-cut (FADE_CUT_MS), red stinger fires.
 *   RED   → GREEN    : red stinger stopped (idempotent), green loop resumes.
 *   ANY   → IDLE     : all audio fades out.
 *   ANY   → ELIM/VIC : all audio hard-cut; caller plays SFX separately.
 *   SAME  → SAME     : no-op (idempotent).
 *
 * LIFECYCLE
 * ─────────
 *   getInstance()       — acquire (creates on first call, reuses thereafter).
 *   transition(state)   — drive the state machine (the ONLY audio entry point).
 *   reset()             — return to IDLE without destroying Howl instances
 *                         (use for game replay within the same component mount).
 *   releaseInstance()   — full teardown, unloads Howl buffers from memory
 *                         (use ONLY in component unmount cleanup).
 */

// src/managers/RLGLAudioController.ts

import { Howl, Howler } from "howler";

export type RLGLAudioState =
  | "IDLE"
  | "GREEN_LIGHT"
  | "RED_LIGHT"
  | "ELIMINATED"
  | "VICTORY";

const FADE_CUT_MS  =  80;
const FADE_SOFT_MS = 400;

export class RLGLAudioController {
  private static _instance: RLGLAudioController | null = null;

  static getInstance(): RLGLAudioController {
    if (!RLGLAudioController._instance) {
      RLGLAudioController._instance = new RLGLAudioController();
    }
    return RLGLAudioController._instance;
  }

  static releaseInstance(): void {
    if (RLGLAudioController._instance) {
      RLGLAudioController._instance._destroy();
      RLGLAudioController._instance = null;
    }
  }

  private _state:   RLGLAudioState = "IDLE";
  private _greenId: number | null  = null;
  private _redId:   number | null  = null;
  private _unlocked                = false;
  private _pendingState: RLGLAudioState | null = null;

  private _greenHowl: Howl | null = null;
  private _redHowl:   Howl | null = null;

  private constructor() {
    this._initHowls();
    this._attachUnlockListeners();
  }

  private _initHowls(): void {
    if (typeof window === "undefined") return;

    // canonical path at root /doll_song.mp3
    this._greenHowl = new Howl({
      src:     ["/doll_song.mp3"],
      loop:    true,
      volume:  1.0, // Increased Volume
      html5:   true,
      preload: true,
      onloaderror: (_id, err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[RLGLAudio] Failed to load doll song:", err);
        }
      },
      onplayerror: () => {
        this._greenHowl?.once("unlock", () => {
          if (this._state === "GREEN_LIGHT" && this._greenId === null) {
            this._playGreen();
          }
        });
      },
    });

    // canonical path at root /exhale-texture.mp3
    this._redHowl = new Howl({
      src:     ["/exhale-texture.mp3"],
      loop:    false,
      volume:  1.0, // Increased Volume
      html5:   false,
      preload: true,
      onloaderror: (_id, err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[RLGLAudio] Failed to load exhale-texture:", err);
        }
      },
    });
  }

  private _attachUnlockListeners(): void {
    if (typeof window === "undefined") return;

    const onGesture = (): void => {
      const ctx = Howler.ctx;
      if (ctx?.state === "suspended") ctx.resume().catch(() => {});

      this._unlocked = true;

      if (this._pendingState !== null) {
        const s = this._pendingState;
        this._pendingState = null;
        queueMicrotask(() => this.transition(s));
      }
    };

    const opts: AddEventListenerOptions = { once: true, capture: true, passive: true };
    (["pointerdown", "touchstart", "mousedown", "keydown", "click"] as const).forEach((ev) =>
      window.addEventListener(ev, onGesture, opts),
    );
  }

  private _playGreen(): void {
    if (!this._greenHowl) return;
    if (this._greenId !== null && this._greenHowl.playing(this._greenId)) return;

    const id = this._greenHowl.play();
    if (typeof id !== "number") return;
    this._greenId = id;
  }

  private _stopGreen(fadeMs = FADE_SOFT_MS): void {
    if (!this._greenHowl || this._greenId === null) return;

    const h  = this._greenHowl;
    const id = this._greenId;
    this._greenId = null;

    if (fadeMs > 0 && h.playing(id)) {
      const vol = (h.volume(id) as number) || 0;
      h.fade(vol, 0, fadeMs, id);
      window.setTimeout(() => { try { h.stop(id); } catch { /* ignore */ } }, fadeMs + 40);
    } else {
      try { h.stop(id); } catch { /* ignore */ }
    }
  }

  private _playRed(): void {
    if (!this._redHowl) return;
    const id = this._redHowl.play();
    if (typeof id === "number") this._redId = id;
  }

  private _stopRed(): void {
    if (!this._redHowl || this._redId === null) return;
    try { this._redHowl.stop(this._redId); } catch { /* ignore */ }
    this._redId = null;
  }

  transition(next: RLGLAudioState): void {
    if (next === this._state) return;

    if (!this._unlocked) {
      this._pendingState = next;
      return;
    }

    this._state = next;

    switch (next) {
      case "GREEN_LIGHT":
        this._stopRed();
        this._playGreen();
        break;

      case "RED_LIGHT":
        this._stopGreen(FADE_CUT_MS);
        this._playRed();
        break;

      case "ELIMINATED":
      case "VICTORY":
        this._stopGreen(FADE_CUT_MS);
        this._stopRed();
        break;

      case "IDLE":
        this._stopGreen(FADE_SOFT_MS);
        this._stopRed();
        break;
    }
  }

  reset(): void {
    this._stopGreen(0);
    this._stopRed();
    this._state        = "IDLE";
    this._pendingState = null;
  }

  /** Adjust green-loop playback rate for difficulty scaling (1.0 = normal). */
  setRate(rate: number): void {
    if (
      this._state === "GREEN_LIGHT" &&
      this._greenHowl &&
      this._greenId !== null &&
      this._greenHowl.playing(this._greenId)
    ) {
      this._greenHowl.rate(Math.max(0.5, Math.min(4.0, rate)), this._greenId);
    }
  }

  get currentState(): RLGLAudioState { return this._state; }

  private _destroy(): void {
    this.reset();
    try { this._greenHowl?.unload(); } catch { /* ignore */ }
    try { this._redHowl?.unload();   } catch { /* ignore */ }
    this._greenHowl = null;
    this._redHowl   = null;
  }
}