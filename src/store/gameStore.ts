import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — UNION TYPES (all exported for use across the codebase)
// ─────────────────────────────────────────────────────────────────────────────

// Update your GameId type to look something like this:
export type GameId = "menu" | "red-light-green-light" | "glass-bridge" | "dalgona" ;

export type RuntimePhase =
  | "idle"
  | "intro"
  | "countdown"
  | "playing"
  | "paused"
  | "eliminated"
  | "victory"
  | "transitioning";

export type GamePhase =
  | "idle"
  | "menu"
  | "loading"
  | "playing"
  | "paused"
  | "gameover"
  | "victory"
  | "transition";

export type Difficulty = "easy" | "normal" | "hard";
export type Platform = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

export type Breakpoint =
  | "desktop-landscape"
  | "tablet-landscape"
  | "tablet-portrait"
  | "mobile-landscape"
  | "mobile-portrait";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — PAYLOAD & SUB-STATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportState {
  containerW: number;
  containerH: number;
  scale: number;
  dpr: number;
  breakpoint: Breakpoint;
  orientation: Orientation;
  safeArea: SafeAreaInsets;
  gameRect: GameRect;
  isTouch: boolean;
  isResizing: boolean;
}

export interface EliminationPayload {
  sourceGame: GameId;
  reason?: string;
  progressMarker?: number;
  progressTotal?: number;
  triggeredAt: number;
}

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  difficulty: Difficulty;
  showFPS: boolean;
  screenShake: boolean;
  particlesEnabled: boolean;
  fullscreen: boolean;
}

export interface HUDState {
  score: number;
  highScore: number;
  lives: number;
  health: number;
  maxHealth: number;
  level: number;
  combo: number;
  maxCombo: number;
  coins: number;
  time: number;
}

export interface SessionEntry {
  gameId: GameId;
  score: number;
  outcome: "victory" | "eliminated";
}

export interface SessionStats {
  played: number;
  survived: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — FULL STORE STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface GameStoreState {
  platform: Platform;
  orientation: Orientation;
  setPlatform: (platform: Platform) => void;
  setOrientation: (orientation: Orientation) => void;
  
  activeGame: GameId;
  setActiveGame: (id: GameId) => void;
  clearActiveGame: () => void;

  bestScores: Record<string, number>;
  updateBestScore: (gameId: GameId, score: number) => void;

  runtimePhase: RuntimePhase;
  setRuntimePhase: (phase: RuntimePhase) => void;

  eliminationPayload: EliminationPayload | null;
  triggerElimination: (payload: Omit<EliminationPayload, "triggeredAt">) => void;
  clearElimination: () => void;

  viewportState: ViewportState;
  setViewportState: (v: ViewportState) => void;

  phase: GamePhase;
  previousPhase: GamePhase;
  settings: GameSettings;
  hud: HUDState;
  
  sessionStartTime: number | null;
  totalPlayTime: number;
  isPaused: boolean;
  isTransitioning: boolean;
  transitionTarget: GamePhase | null;

  setPhase: (phase: GamePhase) => void;
  transitionTo: (phase: GamePhase) => void;
  finishTransition: () => void;

  updateSettings: (patch: Partial<GameSettings>) => void;
  resetSettings: () => void;

  setHUD: (patch: Partial<HUDState>) => void;
  resetHUD: () => void;
  addScore: (points: number) => void;
  incrementCombo: () => void;
  resetCombo: () => void;
  loseLife: () => void;
  addCoins: (amount: number) => void;
  setHealth: (hp: number) => void;
  tickTime: (delta: number) => void;

  startSession: () => void;
  endSession: () => void;
  pauseGame: () => void;
  resumeGame: () => void;

  loadFromStorage: () => void;
  saveToStorage: () => void;

  sessionId: string | null;
  sessionHistory: SessionEntry[];
  currentView: "menu" | "briefing" | "game" | "result" | "session-end" | "leaderboard";
  hasPlayedBefore: Record<string, boolean>;

  startNewSession: () => void;
  recordGameCompletion: (payload: { gameId: GameId; score: number; outcome: "victory" | "eliminated"; timestamp: number }) => void;
  setView: (view: "menu" | "briefing" | "game" | "result" | "session-end" | "leaderboard") => void;
  markGamePlayed: (gameId: GameId) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.6,
  difficulty: "normal",
  showFPS: false,
  screenShake: true,
  particlesEnabled: true,
  fullscreen: false,
};

const DEFAULT_HUD: HUDState = {
  score: 0,
  highScore: 0,
  lives: 3,
  health: 100,
  maxHealth: 100,
  level: 1,
  combo: 0,
  maxCombo: 0,
  coins: 0,
  time: 0,
};

const DEFAULT_VIEWPORT: ViewportState = {
  containerW: 1280,
  containerH: 720,
  scale: 1,
  dpr: 1,
  breakpoint: "desktop-landscape",
  orientation: "landscape",
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  gameRect: { x: 0, y: 0, width: 1280, height: 720 },
  isTouch: false,
  isResizing: false,
};

const STORAGE_KEY = "nexgame_settings_v2";
const HIGHSCORE_KEY = "nexgame_highscore_v2";
const BEST_SCORES_KEY = "squid_best_scores_v1";

const VALID_GAME_IDS = new Set<string>([
  "red-light-green-light",
  "dalgona",
  "glass-bridge",
  "menu",
]);

function loadBestScores(): Record<string, number> {
  const raw = safeLocalGet(BEST_SCORES_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, number>; }
  catch { return {}; }
}

function safeLocalGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeLocalSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch {}
}

function safeLocalRemove(key: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(key); } catch {}
}

function loadSettings(): Partial<GameSettings> {
  const raw = safeLocalGet(STORAGE_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<GameSettings>; } catch { return {}; }
}

function loadHighScore(): number {
  const raw = safeLocalGet(HIGHSCORE_KEY);
  if (!raw) return 0;
  return parseInt(raw, 10) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — STORE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStoreState>()(
  subscribeWithSelector((set, get) => ({
    platform: "desktop",
    orientation: "landscape",
    setPlatform: (platform) => set({ platform }),
    setOrientation: (orientation) => set({ orientation }),

    activeGame: "menu",
    setActiveGame: (id) =>
      set((state) => {
        const safeId: GameId = VALID_GAME_IDS.has(id) ? id : "menu";
        const leavingGame = state.activeGame !== "menu" && safeId === "menu";
        return {
          activeGame: safeId,
          runtimePhase: leavingGame ? "idle" : safeId === "menu" ? "idle" : "intro",
          eliminationPayload: null,
          currentView: "briefing",
        };
      }),

    clearActiveGame: () => {
      if (typeof window !== 'undefined') {
        const { SoundManager } = require('@/managers/SoundManager');
        const { musicManager } = require('@/managers/MusicManager');
        SoundManager.getInstance().stopAll(0);
        SoundManager.getInstance().stopAllLoops(0);
        musicManager.stopAll();
      }
      set({
        activeGame: "menu",
        runtimePhase: "idle",
        eliminationPayload: null,
        currentView: "menu",
      });
    },

    bestScores: {},
    updateBestScore: (gameId, score) =>
      set((state) => {
        const current = state.bestScores[gameId] ?? 0;
        if (score <= current) return {};
        const next = { ...state.bestScores, [gameId]: score };
        safeLocalSet(BEST_SCORES_KEY, JSON.stringify(next));
        return { bestScores: next };
      }),

    runtimePhase: "idle",
    setRuntimePhase: (phase) => set({ runtimePhase: phase }),

    eliminationPayload: null,
    triggerElimination: (payload) =>
      set({
        runtimePhase: "eliminated",
        eliminationPayload: {
          ...payload,
          triggeredAt: performance.now(),
        },
      }),

    clearElimination: () =>
      set({
        runtimePhase: "idle",
        eliminationPayload: null,
      }),

    viewportState: { ...DEFAULT_VIEWPORT },
    setViewportState: (v) => set({ viewportState: v }),

    phase: "menu",
    previousPhase: "menu",
    setPhase: (phase) =>
      set((state) => ({
        previousPhase: state.phase,
        phase,
        isPaused: phase === "paused",
      })),

    transitionTo: (phase) =>
      set({
        isTransitioning: true,
        transitionTarget: phase,
        phase: "transition",
        runtimePhase: "transitioning",
      }),

    finishTransition: () =>
      set((state) => ({
        isTransitioning: false,
        phase: state.transitionTarget ?? "menu",
        previousPhase: "transition",
        transitionTarget: null,
        runtimePhase: "idle",
      })),

    settings: { ...DEFAULT_SETTINGS },
    updateSettings: (patch) =>
      set((state) => {
        const next = { ...state.settings, ...patch };
        safeLocalSet(STORAGE_KEY, JSON.stringify(next));
        return { settings: next };
      }),

    resetSettings: () =>
      set(() => {
        safeLocalRemove(STORAGE_KEY);
        return { settings: { ...DEFAULT_SETTINGS } };
      }),

    hud: { ...DEFAULT_HUD, highScore: 0 },
    setHUD: (patch) => set((state) => ({ hud: { ...state.hud, ...patch } })),
    resetHUD: () => set((state) => ({ hud: { ...DEFAULT_HUD, highScore: state.hud.highScore } })),
    addScore: (points) =>
      set((state) => {
        const { difficulty } = state.settings;
        const multiplier = difficulty === "easy" ? 0.75 : difficulty === "hard" ? 1.5 : 1;
        const gained = Math.floor(points * multiplier * Math.max(1, state.hud.combo));
        const score = state.hud.score + gained;
        const highScore = Math.max(score, state.hud.highScore);
        if (highScore > state.hud.highScore) safeLocalSet(HIGHSCORE_KEY, String(highScore));
        return { hud: { ...state.hud, score, highScore } };
      }),
    incrementCombo: () =>
      set((state) => {
        const combo = state.hud.combo + 1;
        const maxCombo = Math.max(combo, state.hud.maxCombo);
        return { hud: { ...state.hud, combo, maxCombo } };
      }),
    resetCombo: () => set((state) => ({ hud: { ...state.hud, combo: 0 } })),
    loseLife: () => set((state) => ({ hud: { ...state.hud, lives: Math.max(0, state.hud.lives - 1) } })),
    addCoins: (amount) => set((state) => ({ hud: { ...state.hud, coins: state.hud.coins + amount } })),
    setHealth: (hp) => set((state) => ({ hud: { ...state.hud, health: Math.max(0, Math.min(hp, state.hud.maxHealth)) } })),
    tickTime: (delta) => set((state) => ({ hud: { ...state.hud, time: state.hud.time + delta } })),

    sessionStartTime: null,
    totalPlayTime: 0,
    isPaused: false,
    isTransitioning: false,
    transitionTarget: null,

    startSession: () =>
      set((state) => {
        const highScore = loadHighScore();
        return {
          sessionStartTime: performance.now(),
          isPaused: false,
          phase: "playing",
          previousPhase: state.phase,
          runtimePhase: "playing",
          hud: { ...DEFAULT_HUD, highScore },
        };
      }),

    endSession: () =>
      set((state) => {
        const elapsed = state.sessionStartTime !== null ? (performance.now() - state.sessionStartTime) / 1000 : 0;
        return { sessionStartTime: null, totalPlayTime: state.totalPlayTime + elapsed, isPaused: false };
      }),

    pauseGame: () =>
      set((state) => {
        if (state.phase !== "playing") return {};
        return { isPaused: true, phase: "paused", previousPhase: "playing", runtimePhase: "paused" };
      }),

    resumeGame: () =>
      set((state) => {
        if (state.phase !== "paused") return {};
        return { isPaused: false, phase: "playing", previousPhase: "paused", runtimePhase: "playing" };
      }),

    loadFromStorage: () =>
      set(() => {
        const saved = loadSettings();
        const highScore = loadHighScore();
        const bestScores = loadBestScores();
        return { settings: { ...DEFAULT_SETTINGS, ...saved }, hud: { ...DEFAULT_HUD, highScore }, bestScores };
      }),

    saveToStorage: () => {
      const { settings, hud } = get();
      safeLocalSet(STORAGE_KEY, JSON.stringify(settings));
      safeLocalSet(HIGHSCORE_KEY, String(hud.highScore));
    },

    sessionId: null,
    sessionHistory: [],
    currentView: "menu",
    hasPlayedBefore: {},

    startNewSession: () => set({ sessionId: crypto.randomUUID(), sessionHistory: [], currentView: "menu" }),
    recordGameCompletion: (payload) => set((state) => ({
      sessionHistory: [...state.sessionHistory, { gameId: payload.gameId, score: payload.score, outcome: payload.outcome }],
      currentView: "result"
    })),
    setView: (view) => set({ currentView: view }),
    markGamePlayed: (gameId) => set((state) => ({ hasPlayedBefore: { ...state.hasPlayedBefore, [gameId]: true } })),
  }))
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — TYPED SELECTORS
// ─────────────────────────────────────────────────────────────────────────────

export const selectPhase = (s: GameStoreState) => s.phase;
export const selectHUD = (s: GameStoreState) => s.hud;
export const selectSettings = (s: GameStoreState) => s.settings;
export const selectIsPaused = (s: GameStoreState) => s.isPaused;
export const selectIsTransitioning = (s: GameStoreState) => s.isTransitioning;
export const selectDifficulty = (s: GameStoreState) => s.settings.difficulty;
export const selectVolumes = (s: GameStoreState) => ({
  master: s.settings.masterVolume,
  sfx: s.settings.sfxVolume,
  music: s.settings.musicVolume,
});

export const selectActiveGame = (s: GameStoreState) => s.activeGame;
export const selectRuntimePhase = (s: GameStoreState) => s.runtimePhase;
export const selectEliminationPayload = (s: GameStoreState) => s.eliminationPayload;
export const selectIsEliminated = (s: GameStoreState) => s.runtimePhase === "eliminated";
export const selectIsVictory = (s: GameStoreState) => s.runtimePhase === "victory";
export const selectViewport = (s: GameStoreState) => s.viewportState;

export const selectSessionStats = (s: GameStoreState): SessionStats => {
  const played = s.sessionHistory.length;
  const survived = s.sessionHistory.filter(h => h.outcome === 'victory').length;
  const total = s.sessionHistory.reduce((acc, curr) => acc + curr.score, 0);
  return { played, survived, total };
};