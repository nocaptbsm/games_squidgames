"use client";

import React, { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";

export interface RLGLCameraProps {
  targetX: number;
  groundY: number;
  cameraShake: number;
}

export function RLGLCamera({ targetX, groundY, cameraShake }: RLGLCameraProps) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const { viewport } = useThree();

  // Responsive FOV based on screen width
  const isMobile = viewport.width < 5;
  const targetFov = isMobile ? 65 : 52;

  useFrame((state, delta) => {
    if (!cameraRef.current) return;

    // Smooth FOV transition for resizing
    cameraRef.current.fov = THREE.MathUtils.lerp(cameraRef.current.fov, targetFov, delta * 2);
    cameraRef.current.updateProjectionMatrix();

    // Track target X (Player) while maintaining fixed Y and Z offsets
    const idealX = targetX;
    const idealY = 7;
    const idealZ = 20;

    // Apply Camera Shake during eliminations
    let shakeX = 0;
    let shakeY = 0;
    if (cameraShake > 0) {
      const intensity = cameraShake * 0.05;
      shakeX = (Math.random() - 0.5) * intensity;
      shakeY = (Math.random() - 0.5) * intensity;
    }

    // Lerp camera position smoothly
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, idealX + shakeX, delta * 8);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, idealY + shakeY, delta * 8);
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, idealZ, delta * 8);

    // Always look at the target (slightly ahead towards the finish line)
    state.camera.lookAt(idealX, groundY + 2, 0);
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={[12.8, 7, 20]}
      fov={52}
      near={0.1}
      far={2000}
    />
  );
}