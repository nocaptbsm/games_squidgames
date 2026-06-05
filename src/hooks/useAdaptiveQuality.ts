/**
 * useAdaptiveQuality.ts
 * Dynamically scales rendering quality to maintain target FPS.
 * Measures frame budget and degrades/upgrades quality tiers automatically.
 *
 * Quality Tiers:
 *   ULTRA  — desktop/high-end, all effects
 *   HIGH   — mid-range mobile, most effects
 *   MEDIUM — low-end Android, reduced particles
 *   LOW    — thermal throttle / very old devices, bare minimum
 */

import { useRef, useCallback, useEffect } from "react";

export type QualityTier = "ULTRA" | "HIGH" | "MEDIUM" | "LOW";

export interface QualitySettings {
  tier: QualityTier;
  particleCount: number;       // multiplier 0-1
  shadowsEnabled: boolean;
  glowEnabled: boolean;
  screenShakeEnabled: boolean;
  slowMoEnabled: boolean;
  backgroundDetailLevel: number; // 0-2 (0=none, 1=basic, 2=full)
  pixelRatio: number;            // actual DPR to apply to canvas
  fxEnabled: boolean;            // catch-all for expensive post-fx
}

// Safe DPR read — returns 1 during SSR, real value in the browser.
function getDPR(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1;
}

// Presets are built lazily at hook-call-time so window is always available.
// Never call this at module scope.
function buildPresets(): Record<QualityTier, QualitySettings> {
  const dpr = getDPR();
  return {
    ULTRA: {
      tier: "ULTRA",
      particleCount: 1.0,
      shadowsEnabled: true,
      glowEnabled: true,
      screenShakeEnabled: true,
      slowMoEnabled: true,
      backgroundDetailLevel: 2,
      pixelRatio: Math.min(dpr, 3),
      fxEnabled: true,
    },
    HIGH: {
      tier: "HIGH",
      particleCount: 0.7,
      shadowsEnabled: true,
      glowEnabled: true,
      screenShakeEnabled: true,
      slowMoEnabled: true,
      backgroundDetailLevel: 1,
      pixelRatio: Math.min(dpr, 2),
      fxEnabled: true,
    },
    MEDIUM: {
      tier: "MEDIUM",
      particleCount: 0.35,
      shadowsEnabled: false,
      glowEnabled: false,
      screenShakeEnabled: true,
      slowMoEnabled: true,
      backgroundDetailLevel: 1,
      pixelRatio: Math.min(dpr, 1.5),
      fxEnabled: false,
    },
    LOW: {
      tier: "LOW",
      particleCount: 0.1,
      shadowsEnabled: false,
      glowEnabled: false,
      screenShakeEnabled: false,
      slowMoEnabled: false,
      backgroundDetailLevel: 0,
      pixelRatio: 1,
      fxEnabled: false,
    },
  };
}

// How many frames to sample before making a quality decision
const SAMPLE_WINDOW = 60;
// FPS thresholds for tier transitions
const DOWNGRADE_THRESHOLD = 48; // below this → downgrade
const UPGRADE_THRESHOLD   = 58; // sustained above this → try upgrade
// Hysteresis: wait N decision cycles before upgrading (prevent flapping)
const UPGRADE_COOLDOWN_MS = 5000;
const DOWNGRADE_COOLDOWN_MS = 1500;

const tierOrder = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as ('LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA')[];

interface AdaptiveQualityReturn {
  qualityRef: React.MutableRefObject<QualitySettings>;
  recordFrame: (deltaMs: number) => void;
  forceQuality: (tier: QualityTier) => void;
}

export function useAdaptiveQuality(
  initialTier: QualityTier = "HIGH"
): AdaptiveQualityReturn {
  // buildPresets() is called here (inside the hook, client-side only) so
  // window.devicePixelRatio is always available.
  const presets = useRef<Record<QualityTier, QualitySettings>>(buildPresets());

  const qualityRef = useRef<QualitySettings>(buildPresets()[initialTier]);
  const frameSamples = useRef<number[]>([]);
  const lastDecisionTime = useRef<number>(0);
  const lastUpgradeTime = useRef<number>(0);

  const applyTier = useCallback((tier: QualityTier) => {
    qualityRef.current = { ...presets.current[tier] };
  }, []);

  const forceQuality = useCallback(
    (tier: QualityTier) => {
      applyTier(tier);
      lastDecisionTime.current = performance.now();
    },
    [applyTier]
  );

  const recordFrame = useCallback(
    (deltaMs: number) => {
      const clamped = Math.min(deltaMs, 100);
      frameSamples.current.push(clamped);

      if (frameSamples.current.length < SAMPLE_WINDOW) return;

      const now = performance.now();
      const sinceDecision = now - lastDecisionTime.current;

      const avgDelta =
        frameSamples.current.reduce((a, b) => a + b, 0) /
        frameSamples.current.length;
      const avgFPS = 1000 / avgDelta;
      frameSamples.current = [];

      const currentIndex = tierOrder.indexOf(qualityRef.current.tier);

      if (avgFPS < DOWNGRADE_THRESHOLD && sinceDecision > DOWNGRADE_COOLDOWN_MS) {
        if (currentIndex > 0) {
          applyTier(tierOrder[currentIndex - 1]);
          lastDecisionTime.current = now;
        }
      } else if (
        avgFPS > UPGRADE_THRESHOLD &&
        sinceDecision > UPGRADE_COOLDOWN_MS &&
        now - lastUpgradeTime.current > UPGRADE_COOLDOWN_MS
      ) {
        if (currentIndex < tierOrder.length - 1) {
          applyTier(tierOrder[currentIndex + 1]);
          lastDecisionTime.current = now;
          lastUpgradeTime.current = now;
        }
      }
    },
    [applyTier, ]
  );

  // Detect low-end devices at mount and start at lower tier.
  // useEffect only runs client-side, so window/navigator are safe here.
  useEffect(() => {
    // Rebuild presets now that we have a confirmed DPR value
    presets.current = buildPresets();

    const nav = navigator as Navigator & {
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };
    const lowRAM = (nav.deviceMemory ?? 4) < 2;
    const lowCPU = (nav.hardwareConcurrency ?? 4) < 4;
    const highDPR = getDPR() > 2.5;

    if (lowRAM || lowCPU) {
      applyTier("LOW");
    } else if (highDPR && lowCPU) {
      applyTier("MEDIUM");
    } else {
      // Re-apply the initial tier so pixelRatio uses the real DPR
      applyTier(initialTier);
    }
  }, [applyTier, initialTier]);

  return { qualityRef, recordFrame, forceQuality };
}