/**
 * src/design/animationTokens.ts
 *
 * SINGLE SOURCE OF TRUTH for every animation constant in the project.
 *
 * Before: 2800, 3200, 180, 600 scattered across GameShell, GameRouter,
 *         individual game components with no shared contract.
 *
 * After:  Import a named constant. Rename it once; it propagates everywhere.
 *
 * Usage:
 *   import { DURATION, EASE, Z } from "@/design/animationTokens";
 *   <motion.div transition={{ duration: DURATION.sceneEnter / 1000, ease: EASE.cinematic }}>
 */

// ─── Duration (ms) ────────────────────────────────────────────────────────────

export const DURATION = {
  // UI micro-interactions
  uiHover:        80,
  uiClick:        120,
  uiPanelFade:    200,
  uiTooltip:      150,

  // Scene transitions (GameRouter AnimatePresence)
  sceneExit:      300,
  sceneEnter:     400,
  sceneCrossfade: 500,

  // Elimination overlay sequence
  elimFlash:      180,   // red overlay flash
  elimLetterbox:  500,   // bars slide in
  elimCardDelay:  600,   // ELIMINATED card fade-in starts
  elimCardFade:   400,   // card opacity in
  elimHold:       1000,  // hold on card
  elimFadeOut:    400,   // final fade to black
  elimTotal:      2800,  // full sequence length

  // Victory overlay sequence
  victoryCardDelay: 400,
  victoryCardFade:  600,
  victoryHold:      1200,
  victoryFadeOut:   600,
  victoryTotal:     3200,

  // Generic overlays
  overlayFadeIn:  250,
  overlayFadeOut: 300,

  // Audio crossfades (used by AudioManager)
  audioFadeShort: 150,
  audioFadeMed:   600,
  audioFadeLong:  1200,
  audioLoopFadeIn: 800,

  // Gameplay
  countdownTick:  1000,
  heartbeatFade:  200,
} as const;

// ─── Easing (Framer Motion / CSS) ─────────────────────────────────────────────

/** Framer Motion-compatible easing arrays: [x1, y1, x2, y2] */
export const EASE = {
  /** Standard UI easing — fast in, gentle out */
  standard:    [0.4, 0, 0.2, 1] as const,
  /** Cinematic reveals — slow build, snap to rest */
  cinematic:   [0.16, 1, 0.3, 1] as const,
  /** Impact / snap — immediate response */
  impact:      [0.0, 0.0, 0.2, 1] as const,
  /** Bounce-back for UI elements */
  spring:      { type: "spring", stiffness: 300, damping: 30 } as const,
  /** Dramatic deceleration for letterbox bars */
  letterbox:   [0.4, 0, 0.2, 1] as const,
  /** Linear — use for opacity-only fades */
  linear:      "linear" as const,
} as const;

// ─── Z-index layers ───────────────────────────────────────────────────────────

export const Z = {
  // Game world
  game:       0,
  gameUI:     10,

  // HUD system
  hud:        100,
  hudTooltip: 110,

  // Navigation chrome
  gameNav:    300,
  modal:      400,

  // Overlays (rendered above everything except debug)
  overlay:    500,
  transition: 600,
  elimination:900,
  victory:    901,

  // Always on top
  debug:      999,
  portal:     1000,
} as const;

// ─── Glow / shadow intensity ──────────────────────────────────────────────────

/**
 * Use these tokens instead of hardcoding box-shadow pixel values.
 * The GPU optimisation system (Phase 4) will swap these at runtime
 * based on device capability.
 */
export const GLOW = {
  none:     "none",
  subtle:   "0 0 8px rgba(255,255,255,0.15)",
  ui:       "0 0 12px rgba(255,255,255,0.25)",
  accent:   "0 0 20px rgba(255,60,60,0.45)",
  danger:   "0 0 32px rgba(220,30,30,0.65)",
  victory:  "0 0 40px rgba(255,200,50,0.55)",
  /** Reduced set — activated on low-end devices */
  reduced: {
    none:   "none",
    subtle: "none",
    ui:     "0 0 4px rgba(255,255,255,0.12)",
    accent: "0 0 8px rgba(255,60,60,0.30)",
    danger: "0 0 12px rgba(220,30,30,0.40)",
    victory:"0 0 16px rgba(255,200,50,0.35)",
  },
} as const;

// ─── Spacing scale ────────────────────────────────────────────────────────────

export const SPACE = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64,
} as const;

// ─── Typography scale ─────────────────────────────────────────────────────────

export const TYPE = {
  /** Game title / ELIMINATED headline */
  display: "clamp(36px, 6vw, 72px)",
  /** Section header */
  heading: "clamp(20px, 3vw, 36px)",
  /** Body / HUD */
  body:    "clamp(14px, 1.8vw, 18px)",
  /** Caption / debug */
  small:   "clamp(11px, 1.4vw, 14px)",
} as const;

// ─── Border radius ────────────────────────────────────────────────────────────

export const RADIUS = {
  sm: 4, md: 8, lg: 16, xl: 24, pill: 999,
} as const;

// ─── Framer Motion variant presets ───────────────────────────────────────────

/** Drop-in variants for scene-level AnimatePresence wrappers */
export const SCENE_VARIANTS = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.sceneEnter / 1000, ease: EASE.cinematic } },
  exit:    { opacity: 0, transition: { duration: DURATION.sceneExit  / 1000, ease: EASE.standard  } },
} as const;

/** Slide-up variant for overlay cards */
export const CARD_VARIANTS = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE.cinematic } },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.3, ease: EASE.standard  } },
} as const;