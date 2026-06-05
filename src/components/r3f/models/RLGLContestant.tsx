// src/components/r3f/models/RLGLContestant.tsx
"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/**
 * RLGL Contestant — Squid Game player 456 style (procedural)
 *
 * Tracksuit appearance (teal/green jacket + trousers + white sneakers).
 *
 * Animation states (transition smoothly between each other):
 *   - idle       : standing, subtle breathing
 *   - run        : moderate stride
 *   - sprint     : longer stride + forward lean
 *   - stop       : decel pose blending back to idle (drives via velocity falloff)
 *   - freeze     : statue (used when red light + player stopped)
 *   - eliminated : ragdoll-ish fall driven by fallProgress
 *   - victory    : arms raised, gentle bob
 *
 * Inter-state transitions are lerped — no robotic snapping.
 */

export interface RLGLContestantEntity {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  alive: boolean;
  finished: boolean;
  isHuman: boolean;
  number: number;
  fallProgress: number;
  fallAxis: [number, number, number];
}

interface RLGLContestantProps {
  player: RLGLContestantEntity;
  isMoving: boolean;
  /** Optional: pass the current light phase so contestant can FREEZE when red. */
  isRedLight?: boolean;
}

type AnimState =
  | "idle"
  | "run"
  | "sprint"
  | "stop"
  | "freeze"
  | "eliminated"
  | "victory";

export const RLGLContestant = React.memo(function RLGLContestant({
  player,
  isMoving,
  isRedLight = false,
}: RLGLContestantProps) {
  const group    = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef  = useRef<THREE.Group>(null);
  const legLRef  = useRef<THREE.Group>(null);
  const legRRef  = useRef<THREE.Group>(null);
  const armLRef  = useRef<THREE.Group>(null);
  const armRRef  = useRef<THREE.Group>(null);

  const animStateRef = useRef<AnimState>("idle");
  const animPhaseRef = useRef(0);
  // Smoothed blend weight per state (0..1)
  const blendRef = useRef<Record<AnimState, number>>({
    idle: 1, run: 0, sprint: 0, stop: 0, freeze: 0, eliminated: 0, victory: 0,
  });

  useFrame((state, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 0.05);

    group.current.position.x = player.x;
    group.current.position.z = player.z;

    const speed = Math.hypot(player.vx, player.vz);
    const isSprinting = speed > 10;
    const isRunning   = speed > 0.4 && !isSprinting;

    // ---- Resolve target animation state ----------------------------------
    let target: AnimState;
    if (!player.alive)            target = "eliminated";
    else if (player.finished)     target = "victory";
    else if (isRedLight && speed < 0.05) target = "freeze";
    else if (isSprinting)         target = "sprint";
    else if (isRunning)           target = "run";
    else if (speed > 0.05)        target = "stop";  // decelerating
    else                          target = "idle";

    animStateRef.current = target;

    // ---- Lerp blend weights so transitions are smooth --------------------
    const blendSpeed = 1 - Math.exp(-12 * dt);
    (Object.keys(blendRef.current) as AnimState[]).forEach((k) => {
      const goal = k === target ? 1 : 0;
      blendRef.current[k] = THREE.MathUtils.lerp(
        blendRef.current[k], goal, blendSpeed
      );
    });
    const w = blendRef.current;

    // ---- Eliminated (ragdoll-ish fall) — authoritative, overrides others -
    if (!player.alive) {
      const t = Math.min(1, player.fallProgress);
      group.current.rotation.x = -player.fallAxis[0] * t * Math.PI / 2;
      group.current.rotation.z = -player.fallAxis[2] * t * Math.PI / 2;
      group.current.position.y = THREE.MathUtils.lerp(0, -0.35, t);
      if (legLRef.current) legLRef.current.rotation.x = THREE.MathUtils.lerp(0,  1.2, t);
      if (legRRef.current) legRRef.current.rotation.x = THREE.MathUtils.lerp(0, -1.2, t);
      if (armLRef.current) armLRef.current.rotation.x = THREE.MathUtils.lerp(0,  1.8, t);
      if (armRRef.current) armRRef.current.rotation.x = THREE.MathUtils.lerp(0, -1.8, t);
      return;
    }

    group.current.rotation.x = 0;
    group.current.rotation.z = 0;

    const tNow = state.clock.elapsedTime;

    // ---- Stride / phase advance -----------------------------------------
    // Run @ 11 Hz, sprint @ 14 Hz. Blend frequency by weight.
    const freq = 11 * w.run + 14 * w.sprint;
    animPhaseRef.current += dt * freq;

    const runSwing    = Math.sin(animPhaseRef.current) * 0.50 * w.run;
    const sprintSwing = Math.sin(animPhaseRef.current) * 0.70 * w.sprint;
    const swing = runSwing + sprintSwing;

    // ---- Compose pose: weighted sum of per-state contributions ----------
    // Default rests
    let legL = 0, legR = 0, armL = 0.10, armR = 0.10;
    let armLZ = 0, armRZ = 0;
    let torsoPitch = 0;
    let bodyY = 0;
    let headPitch = 0;
    let torsoSY = 1, torsoSX = 1;

    // idle: subtle breathing
    {
      const breathe = Math.sin(tNow * 2.5) * 0.015;
      bodyY     += w.idle * breathe;
      torsoSY   += w.idle * breathe;
      torsoSX   -= w.idle * breathe * 0.3;
    }

    // freeze: hold rigid — no breathing, no bob
    {
      bodyY     += w.freeze * 0;
      torsoSY   *= 1 - w.freeze * 0;  // (keeps neutral)
    }

    // stop: arms/legs drift toward neutral with tiny lean back
    {
      torsoPitch += w.stop * 0.04;
      bodyY      += w.stop * Math.sin(tNow * 4) * 0.008;
    }

    // run / sprint: limb swings + forward lean + vertical bob
    {
      legL += swing;
      legR += -swing;
      armL += -swing * 0.75;
      armR += swing * 0.75;
      const bob = Math.abs(Math.sin(animPhaseRef.current))
                * (0.06 * w.run + 0.08 * w.sprint);
      bodyY += bob;
      torsoPitch += -0.08 * w.run - 0.15 * w.sprint;
      headPitch  += Math.sin(animPhaseRef.current * 2) * 0.04 * (w.run + w.sprint);
    }

    // victory: arms raised, gentle bob
    {
      armL  += w.victory * (-2.8 - 0.10);
      armR  += w.victory * (-2.8 - 0.10);
      armLZ += w.victory * -0.30;
      armRZ += w.victory *  0.30;
      legL  += w.victory * 0;
      legR  += w.victory * 0;
      headPitch += w.victory * -0.20;
      bodyY     += w.victory * (0.05 + Math.sin(tNow * 4) * 0.03);
    }

    // ---- Apply pose ------------------------------------------------------
    group.current.position.y = bodyY;
    if (torsoRef.current) {
      torsoRef.current.rotation.x = THREE.MathUtils.lerp(
        torsoRef.current.rotation.x, torsoPitch, blendSpeed
      );
      torsoRef.current.scale.y = torsoSY;
      torsoRef.current.scale.x = torsoSX;
    }
    if (legLRef.current) legLRef.current.rotation.x = legL;
    if (legRRef.current) legRRef.current.rotation.x = legR;
    if (armLRef.current) {
      armLRef.current.rotation.x = armL;
      armLRef.current.rotation.z = armLZ;
    }
    if (armRRef.current) {
      armRRef.current.rotation.x = armR;
      armRRef.current.rotation.z = armRZ;
    }
    if (headRef.current) {
      headRef.current.rotation.x = headPitch;
    }
  });

  // Suppress unused-param lint for prop kept for API parity
  void isMoving;

  // Tracksuit palette (teal green)
  const SUIT       = "#1a8a7a";
  const SUIT_DARK  = "#158070";
  const ZIPPER     = "#0d5a4d";
  const SKIN       = "#ffe1d4";
  const SHOE       = "#f5f5f5";
  const SHOE_TRIM  = "#e0e0e0";
  const HAIR       = "#2a2a2a";

  return (
    <group ref={group}>
      {/* ---- Left leg ---- */}
      <group ref={legLRef} position={[-0.14, 0.92, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.085, 0.84, 12]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.20, 0]} castShadow>
          <sphereGeometry args={[0.10, 10, 10]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.87, 0.05]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color={SHOE} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.88, 0.10]} castShadow>
          <boxGeometry args={[0.12, 0.06, 0.08]} />
          <meshStandardMaterial color={SHOE_TRIM} roughness={0.7} />
        </mesh>
      </group>

      {/* ---- Right leg ---- */}
      <group ref={legRRef} position={[0.14, 0.92, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.085, 0.84, 12]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.20, 0]} castShadow>
          <sphereGeometry args={[0.10, 10, 10]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.87, 0.05]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color={SHOE} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.88, 0.10]} castShadow>
          <boxGeometry args={[0.12, 0.06, 0.08]} />
          <meshStandardMaterial color={SHOE_TRIM} roughness={0.7} />
        </mesh>
      </group>

      {/* ---- Torso (tracksuit jacket) ---- */}
      <group ref={torsoRef}>
        <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.65, 0.26]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        {/* Zipper */}
        <mesh position={[0, 1.25, 0.135]} castShadow>
          <boxGeometry args={[0.012, 0.60, 0.01]} />
          <meshStandardMaterial color={ZIPPER} roughness={0.4} />
        </mesh>
        {/* Chest panels */}
        <mesh position={[-0.12, 1.35, 0.135]} castShadow>
          <boxGeometry args={[0.08, 0.10, 0.01]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0.12, 1.35, 0.135]} castShadow>
          <boxGeometry args={[0.08, 0.10, 0.01]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        {/* Waistband */}
        <mesh position={[0, 0.93, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.08, 16]} />
          <meshStandardMaterial color={ZIPPER} roughness={0.7} />
        </mesh>
      </group>

      {/* Neck */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.09, 0.12, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.5} />
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0, 1.78, 0]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.19, 20, 20]} />
          <meshStandardMaterial color={SKIN} roughness={0.5} />
        </mesh>
        {/* Hair cap */}
        <mesh position={[0, 0.08, 0]} castShadow>
          <sphereGeometry
            args={[0.195, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6]}
          />
          <meshStandardMaterial color={HAIR} roughness={0.9} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.08, 0.04, 0.17]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.08, 0.04, 0.17]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      {/* Left arm */}
      <group ref={armLRef} position={[-0.30, 1.48, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.065, 0.44, 10]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <sphereGeometry args={[0.072, 10, 10]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.66, 0]} castShadow>
          <cylinderGeometry args={[0.065, 0.06, 0.40, 10]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.88, 0]} castShadow>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
      </group>

      {/* Right arm */}
      <group ref={armRRef} position={[0.30, 1.48, 0]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.065, 0.44, 10]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <sphereGeometry args={[0.072, 10, 10]} />
          <meshStandardMaterial color={SUIT_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.66, 0]} castShadow>
          <cylinderGeometry args={[0.065, 0.06, 0.40, 10]} />
          <meshStandardMaterial color={SUIT} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.88, 0]} castShadow>
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
      </group>

      {/* Number tag */}
      <Html
        position={[0, 1.20, -0.15]}
        center
        distanceFactor={6}
        occlude={false}
      >
        <div
          style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "0.04em",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {player.number.toString().padStart(3, "0")}
        </div>
      </Html>

      {!player.alive && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.6 + player.fallProgress * 0.45, 20]} />
          <meshBasicMaterial color="#9b1414" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
});

export default RLGLContestant;
