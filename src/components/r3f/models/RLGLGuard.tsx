"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * RLGL Guard — Squid Game pink-suit soldier (procedural)
 *
 * Quality:
 *  - Pink uniform (jacket + trousers)
 *  - Black mask with circle insignia
 *  - Visible rifle (slung at rest, raised when aiming)
 *  - Aiming animation  (arms + rifle lerp up to shoulder)
 *  - Firing animation  (muzzle flash mesh + point-light pulse)
 *  - Recoil            (rifle pushes back, torso pitches)
 *  - Idle breathing    (subtle torso scale)
 */

interface RLGLGuardProps {
  position: [number, number, number];
  rotationY?: number;
  isAiming?: boolean;
  isFiring?: boolean;
  targetPosition?: [number, number, number];
}

export function RLGLGuard({
  position,
  rotationY = 0,
  isAiming = false,
  isFiring = false,
}: RLGLGuardProps) {
  const group           = useRef<THREE.Group>(null);
  const torsoRef        = useRef<THREE.Group>(null);
  const leftArmRef      = useRef<THREE.Group>(null);
  const rightArmRef     = useRef<THREE.Group>(null);
  const rifleRef        = useRef<THREE.Group>(null);
  const muzzleFlashRef  = useRef<THREE.PointLight>(null);
  const muzzleMeshRef   = useRef<THREE.Mesh>(null);
  const recoilRef       = useRef(0);

  useFrame((_, dt) => {
    if (!group.current) return;
    const clampedDt = Math.min(dt, 0.05);
    const t = performance.now() * 0.001;

    // ---------- Idle breathing -------------------------------------------
    if (torsoRef.current && !isAiming && !isFiring) {
      const breath = Math.sin(t * 1.5) * 0.012;
      torsoRef.current.scale.y = 1 + breath;
      torsoRef.current.position.y = 1.3 + breath * 0.5;
    }

    // ---------- Aiming / Rest transitions --------------------------------
    const ease = 1 - Math.exp(-9 * clampedDt);

    if (isAiming || isFiring) {
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x, -1.45, ease
        );
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.z, -0.30, ease
        );
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x, -1.45, ease
        );
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.z, 0.30, ease
        );
      }
      if (rifleRef.current) {
        rifleRef.current.rotation.x = THREE.MathUtils.lerp(
          rifleRef.current.rotation.x, -Math.PI / 2, ease
        );
        rifleRef.current.position.y = THREE.MathUtils.lerp(
          rifleRef.current.position.y, 1.5, ease
        );
        rifleRef.current.position.z = THREE.MathUtils.lerp(
          rifleRef.current.position.z, 0.40, ease
        );
      }
      if (torsoRef.current) {
        torsoRef.current.rotation.x = THREE.MathUtils.lerp(
          torsoRef.current.rotation.x,
          Math.sin(t * 2) * 0.012,
          ease
        );
      }
    } else {
      if (leftArmRef.current) {
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.x, 0.12, ease
        );
        leftArmRef.current.rotation.z = THREE.MathUtils.lerp(
          leftArmRef.current.rotation.z, -0.12, ease
        );
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x, 0.12, ease
        );
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.z, 0.12, ease
        );
      }
      if (rifleRef.current) {
        rifleRef.current.rotation.x = THREE.MathUtils.lerp(
          rifleRef.current.rotation.x, Math.PI / 2.5, ease
        );
        rifleRef.current.position.y = THREE.MathUtils.lerp(
          rifleRef.current.position.y, 1.15, ease
        );
        rifleRef.current.position.z = THREE.MathUtils.lerp(
          rifleRef.current.position.z, 0.20, ease
        );
      }
      if (torsoRef.current) {
        torsoRef.current.rotation.x = THREE.MathUtils.lerp(
          torsoRef.current.rotation.x, 0, ease
        );
      }
    }

    // ---------- Recoil impulse -------------------------------------------
    if (isFiring) {
      // Spike on the first frame of fire, then decay
      recoilRef.current = Math.min(1, recoilRef.current + clampedDt * 12);
    }
    recoilRef.current = THREE.MathUtils.lerp(recoilRef.current, 0, ease * 0.75);

    if (rifleRef.current) {
      rifleRef.current.position.z -= recoilRef.current * 0.10;
    }
    if (torsoRef.current) {
      torsoRef.current.rotation.x -= recoilRef.current * 0.18;
    }

    // ---------- Muzzle flash ---------------------------------------------
    if (muzzleFlashRef.current) {
      muzzleFlashRef.current.intensity = isFiring
        ? 22 * recoilRef.current
        : 0;
    }
    if (muzzleMeshRef.current) {
      const s = isFiring ? 0.5 + recoilRef.current * 1.2 : 0.0001;
      muzzleMeshRef.current.scale.set(s, s, s);
      muzzleMeshRef.current.rotation.z = Math.random() * Math.PI * 2;
    }
  });

  const PINK       = "#e34a8a";
  const PINK_DARK  = "#c43278";
  const BLACK      = "#0a0a0a";
  const METAL      = "#2a2a2a";

  return (
    <group ref={group} position={position} rotation={[0, rotationY, 0]}>
      {/* Boots */}
      <mesh position={[-0.13, 0.05, 0.02]} castShadow>
        <boxGeometry args={[0.14, 0.10, 0.22]} />
        <meshStandardMaterial color={BLACK} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0.13, 0.05, 0.02]} castShadow>
        <boxGeometry args={[0.14, 0.10, 0.22]} />
        <meshStandardMaterial color={BLACK} roughness={0.7} metalness={0.1} />
      </mesh>

      {/* Pink trousers */}
      <mesh position={[-0.13, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.095, 0.90, 12]} />
        <meshStandardMaterial color={PINK} roughness={0.75} />
      </mesh>
      <mesh position={[0.13, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.095, 0.90, 12]} />
        <meshStandardMaterial color={PINK} roughness={0.75} />
      </mesh>

      {/* Belt */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.25, 0.12, 16]} />
        <meshStandardMaterial color={PINK_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.35]} />
        <meshStandardMaterial color={BLACK} roughness={0.5} />
      </mesh>

      {/* Pink jacket torso */}
      <group ref={torsoRef}>
        <mesh position={[0, 1.30, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.50, 0.75, 0.28]} />
          <meshStandardMaterial color={PINK} roughness={0.75} />
        </mesh>
        <mesh position={[0, 1.45, 0.145]} castShadow>
          <boxGeometry args={[0.30, 0.40, 0.02]} />
          <meshStandardMaterial color={PINK_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.45, 0.160]} castShadow>
          <boxGeometry args={[0.015, 0.45, 0.01]} />
          <meshStandardMaterial color="#888" roughness={0.3} metalness={0.6} />
        </mesh>
      </group>

      {/* Neck */}
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.10, 0.11, 0.15, 12]} />
        <meshStandardMaterial color={BLACK} roughness={0.4} />
      </mesh>

      {/* Black mask / helmet */}
      <mesh position={[0, 1.95, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.24, 20, 20]} />
        <meshStandardMaterial color={BLACK} roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Circle insignia on mask */}
      <mesh position={[0, 1.95, 0.245]}>
        <circleGeometry args={[0.10, 24]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 1.95, 0.246]}>
        <circleGeometry args={[0.065, 24]} />
        <meshBasicMaterial color={BLACK} />
      </mesh>

      {/* Left arm */}
      <group ref={leftArmRef} position={[-0.35, 1.50, 0]}>
        <mesh position={[0, -0.30, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.60, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.65, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.07, 0.30, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.85, 0]} castShadow>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color={BLACK} roughness={0.5} />
        </mesh>
      </group>

      {/* Right arm */}
      <group ref={rightArmRef} position={[0.35, 1.50, 0]}>
        <mesh position={[0, -0.30, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.60, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.65, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.07, 0.30, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.85, 0]} castShadow>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshStandardMaterial color={BLACK} roughness={0.5} />
        </mesh>
      </group>

      {/* Rifle */}
      <group
        ref={rifleRef}
        position={[0, 1.15, 0.20]}
        rotation={[Math.PI / 2.5, 0, 0]}
      >
        {/* Stock */}
        <mesh position={[0, 0, -0.25]} castShadow>
          <boxGeometry args={[0.08, 0.15, 0.30]} />
          <meshStandardMaterial color={BLACK} roughness={0.6} />
        </mesh>
        {/* Receiver */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.06, 0.10, 0.35]} />
          <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.3} />
        </mesh>
        {/* Barrel */}
        <mesh position={[0, 0, 0.35]} castShadow>
          <cylinderGeometry args={[0.022, 0.025, 0.50, 12]} />
          <meshStandardMaterial color={BLACK} roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Sight */}
        <mesh position={[0, 0.04, 0.55]} castShadow>
          <boxGeometry args={[0.01, 0.03, 0.01]} />
          <meshStandardMaterial color="#333" roughness={0.4} />
        </mesh>
        {/* Magazine */}
        <mesh position={[0, -0.12, 0.05]} castShadow>
          <boxGeometry args={[0.04, 0.18, 0.10]} />
          <meshStandardMaterial color={BLACK} roughness={0.5} />
        </mesh>
        {/* Scope */}
        <mesh position={[0, 0.08, 0.10]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.15, 16]} />
          <meshStandardMaterial color={BLACK} roughness={0.2} metalness={0.4} />
        </mesh>

        {/* Muzzle flash light */}
        <pointLight
          ref={muzzleFlashRef}
          position={[0, 0, 0.62]}
          intensity={0}
          distance={20}
          color="#ffaa33"
          decay={2}
        />
        {/* Muzzle flash geometry — always mounted, scaled to ~0 when idle */}
        <mesh ref={muzzleMeshRef} position={[0, 0, 0.65]}>
          <coneGeometry args={[0.12, 0.25, 6]} />
          <meshBasicMaterial color="#ffdd44" transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  );
}

export default RLGLGuard;
