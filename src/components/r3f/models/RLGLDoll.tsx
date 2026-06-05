"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * RLGL Doll — Squid Game inspired "Young-Hee" (procedural)
 *
 * Quality:
 *  - Realistic-ish proportions (head/torso/limb ratios scaled to a young girl)
 *  - Independent BODY turn and HEAD turn (head leads with overshoot)
 *  - Smooth, exponential rotation easing (no robotic snapping)
 *  - Idle breathing (subtle scale on torso)
 *  - Subtle sway during GREEN LIGHT idle
 *  - Eye glow + scan light during RED LIGHT
 *
 * Behaviour:
 *  - GREEN LIGHT  -> targetRotation = 0          (facing tree)
 *  - RED LIGHT    -> targetRotation = Math.PI    (facing contestants)
 */

interface RLGLDollProps {
  position: [number, number, number];
  targetRotation: number;
  isRed: boolean;
  scanIntensity: number;
}

export function RLGLDoll({
  position,
  targetRotation,
  isRed,
  scanIntensity,
}: RLGLDollProps) {
  const group     = useRef<THREE.Group>(null);
  const bodyRef   = useRef<THREE.Group>(null);
  const torsoRef  = useRef<THREE.Group>(null);
  const headRef   = useRef<THREE.Group>(null);
  const leftEyeRef  = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);

  // Smoothed rotation state (manual easing — never snaps)
  const bodyYRef = useRef(0);
  const headYRef = useRef(0);

  useFrame((state, dt) => {
    if (!group.current || !bodyRef.current || !headRef.current) return;
    const t = state.clock.elapsedTime;
    const clampedDt = Math.min(dt, 0.05);

    // ---- Independent BODY turn ---------------------------------------------
    // Body lags slightly behind the target — feels mechanical-but-organic.
    const bodyEase = 1 - Math.exp(-5.0 * clampedDt);
    bodyYRef.current = THREE.MathUtils.lerp(
      bodyYRef.current,
      targetRotation,
      bodyEase
    );
    bodyRef.current.rotation.y = bodyYRef.current;

    // ---- Independent HEAD turn ---------------------------------------------
    // Head leads the body with a slight overshoot, then settles.
    const headEase = 1 - Math.exp(-7.5 * clampedDt);
    const headTarget = targetRotation * 1.12;
    headYRef.current = THREE.MathUtils.lerp(
      headYRef.current,
      headTarget,
      headEase
    );
    // Subtract body rotation so head rotates RELATIVE to body — independent.
    headRef.current.rotation.y = headYRef.current - bodyYRef.current;

    // ---- Idle breathing (torso) --------------------------------------------
    if (torsoRef.current) {
      const breath = Math.sin(t * 1.6) * 0.015;
      torsoRef.current.scale.y = 1 + breath;
      torsoRef.current.scale.x = 1 - breath * 0.4;
    }

    // ---- Subtle sway / posture ---------------------------------------------
    if (isRed) {
      // Predatory lean forward + tiny hover/buzz while scanning
      group.current.position.y =
        position[1] + 0.05 + Math.sin(t * 3.2) * 0.02;
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        -0.10,
        bodyEase
      );
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        0,
        bodyEase
      );
    } else {
      // Calm sway during green light
      group.current.position.y = position[1] + Math.sin(t * 1.1) * 0.035;
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        Math.sin(t * 0.7) * 0.012,
        bodyEase
      );
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        Math.sin(t * 1.6) * 0.030,
        bodyEase
      );
    }

    // ---- Eye glow flicker (red light only) ---------------------------------
    if (leftEyeRef.current && rightEyeRef.current) {
      const flicker = isRed
        ? 6 + scanIntensity * 8 + Math.sin(t * 22) * 1.2
        : 0;
      const mL = leftEyeRef.current.material as THREE.MeshStandardMaterial;
      const mR = rightEyeRef.current.material as THREE.MeshStandardMaterial;
      mL.emissiveIntensity = flicker;
      mR.emissiveIntensity = flicker;
    }
  });

  const eyeColor = isRed ? "#ff1414" : "#1a1a1a";

  // Realistic-ish proportions for a young girl figure:
  //   total height ~ 4.6
  //   head    : 0.55 radius (~1.1 tall)
  //   torso   : 1.2 tall (cone+cylinder dress)
  //   legs    : implied under dress
  return (
    <group ref={group} position={position}>
      <group ref={bodyRef}>
        {/* ---------------- Dress (orange skirt) ---------------- */}
        <group ref={torsoRef}>
          <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.25, 3.1, 32]} />
            <meshStandardMaterial color="#f4a02a" roughness={0.78} />
          </mesh>
          {/* Yellow top */}
          <mesh position={[0, 2.95, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.95, 0.85, 32]} />
            <meshStandardMaterial color="#fbd435" roughness={0.78} />
          </mesh>
          {/* Collar */}
          <mesh position={[0, 3.42, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.55, 0.12, 24]} />
            <meshStandardMaterial color="#e8be24" roughness={0.7} />
          </mesh>
          {/* Arms tucked at sides */}
          <mesh position={[-0.55, 2.55, 0]} rotation={[0, 0, 0.18]} castShadow>
            <cylinderGeometry args={[0.10, 0.085, 1.05, 14]} />
            <meshStandardMaterial color="#ffd8b3" roughness={0.65} />
          </mesh>
          <mesh position={[0.55, 2.55, 0]} rotation={[0, 0, -0.18]} castShadow>
            <cylinderGeometry args={[0.10, 0.085, 1.05, 14]} />
            <meshStandardMaterial color="#ffd8b3" roughness={0.65} />
          </mesh>
          {/* Hands */}
          <mesh position={[-0.66, 1.99, 0]} castShadow>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color="#ffd8b3" roughness={0.6} />
          </mesh>
          <mesh position={[0.66, 1.99, 0]} castShadow>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color="#ffd8b3" roughness={0.6} />
          </mesh>
        </group>

        {/* Neck */}
        <mesh position={[0, 3.62, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.18, 16]} />
          <meshStandardMaterial color="#ffd8b3" roughness={0.6} />
        </mesh>
      </group>

      {/* ---------------- HEAD (independent pivot) ---------------- */}
      <group ref={headRef} position={[0, 3.95, 0]}>
        {/* Skin */}
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.55, 32, 32]} />
          <meshStandardMaterial color="#ffe0c2" roughness={0.55} />
        </mesh>
        {/* Black bob hair (back) */}
        <mesh position={[0, 0.08, -0.08]} castShadow>
          <sphereGeometry args={[0.58, 32, 32]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
        </mesh>
        {/* Bangs (front strip) */}
        <mesh
          position={[0, 0.32, 0.30]}
          rotation={[0.3, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.85, 0.18, 0.15]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
        </mesh>
        {/* Cheeks (blush) */}
        <mesh position={[-0.34, -0.08, 0.42]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial
            color="#ff8a8a"
            roughness={0.8}
            transparent
            opacity={0.55}
          />
        </mesh>
        <mesh position={[0.34, -0.08, 0.42]}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial
            color="#ff8a8a"
            roughness={0.8}
            transparent
            opacity={0.55}
          />
        </mesh>
        {/* Eyes (glow in red light) */}
        <mesh
          ref={leftEyeRef}
          position={[-0.18, 0.04, 0.48]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.04, 16]} />
          <meshStandardMaterial
            color={eyeColor}
            emissive={eyeColor}
            emissiveIntensity={0}
          />
        </mesh>
        <mesh
          ref={rightEyeRef}
          position={[0.18, 0.04, 0.48]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.04, 16]} />
          <meshStandardMaterial
            color={eyeColor}
            emissive={eyeColor}
            emissiveIntensity={0}
          />
        </mesh>
        {/* Mouth */}
        <mesh position={[0, -0.18, 0.48]}>
          <boxGeometry args={[0.10, 0.025, 0.01]} />
          <meshStandardMaterial color="#7a1a1a" roughness={0.6} />
        </mesh>
      </group>

      {/* ---------------- Scan beams (red light) ---------------- */}
      {isRed && (
        <>
          <spotLight
            position={[0, 4.0, 0.55]}
            target-position={[0, 0, 40]}
            intensity={8 + scanIntensity * 12}
            angle={0.85}
            penumbra={0.25}
            color="#ff1a1a"
            distance={140}
            decay={1.8}
            castShadow
          />
          <spotLight
            position={[0, 4.0, 0]}
            target-position={[0, 0, 50]}
            intensity={4}
            angle={1.2}
            penumbra={0.5}
            color="#ff4444"
            distance={100}
            decay={2}
          />
        </>
      )}
    </group>
  );
}

export default RLGLDoll;
