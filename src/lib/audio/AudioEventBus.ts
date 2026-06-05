// lib/audio/AudioEventBus.ts
//
// FIX 3.3 — Unified AudioEventBus covering all three game modes.
//
// Previously only RedLightGreenLight events were typed here. GlassBridge
// emitted audio events via an ad-hoc Set<string> drain loop in gameTick(),
// and DalgonaCandy had no bus integration at all.
//
// Now every game's audio events are declared here so the audio layer has
// a single typed contract. Games emit; audio hooks subscribe. No game
// needs to know which SoundId to play — that mapping lives in useAmbientAudio
// (for ambient layers) and the game's own audio drain (for one-shot SFX).

export type AudioEvents = {
  // ── Red Light Green Light ──────────────────────────────────────────────────
  'greenLightActivated':   void;
  'redLightActivated':     void;
  'motionDetected':        void;
  'scanCleared':           void;
  'playerEliminated':      string;   // player ID
  'playerCountUpdate':     number;   // alive count
  'countdownStart':        number;   // seconds remaining
  'roundComplete':         void;
  'playerVelocityUpdate':  number;   // speed 0–1
  'gameOver':              boolean;  // true = win, false = loss

  // ── Glass Bridge ──────────────────────────────────────────────────────────
  /** Player successfully stepped onto a safe panel */
  'glassPanelStepped':     void;
  /** Panel cracked under the player's weight (still safe, but stress sound) */
  'glassPanelCracked':     void;
  /** Unsafe panel shattered — player is falling */
  'glassPanelShattered':   void;
  /** Player crossed all rows — victory */
  'glassBridgeComplete':   void;
  /** Timer expired before all rows crossed */
  'glassBridgeTimeout':    void;

  // ── Dalgona Candy ─────────────────────────────────────────────────────────
  /** Stylus touched the candy surface */
  'dalgonaStylusDown':     void;
  /** Stylus lifted cleanly */
  'dalgonaStylusUp':       void;
  /** Shape cut successfully */
  'dalgonaCutComplete':    void;
  /** Candy broke — player eliminated */
  'dalgonaCandyBroke':     void;
  /** Player completed the shape without breaking */
  'dalgonaCandyComplete':  void;
};

class EventBus {
  // Bypasses contravariance errors internally while preserving strict public generic wrappers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: { [K in keyof AudioEvents]?: ((payload: any) => void)[] } = {};

  on<K extends keyof AudioEvents>(event: K, callback: (payload: AudioEvents[K]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(callback);
  }

  /** Remove a specific listener. Always call this in useEffect cleanup to
   * prevent duplicate subscriptions across hook remounts. */
  off<K extends keyof AudioEvents>(event: K, callback: (payload: AudioEvents[K]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(cb => cb !== callback);
  }

  emit<K extends keyof AudioEvents>(event: K, payload?: AudioEvents[K]) {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(cb => cb(payload));
    }
  }
}

export const audioEventBus = new EventBus();