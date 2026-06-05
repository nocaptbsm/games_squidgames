// src/components/games/RedLightGreenLight.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  Suspense,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Float,
  Html,
  Sky,
  Stars,
  ContactShadows,
  Line,
} from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/store/gameStore";
import { inputManager } from "@/managers/InputManager";
import { SoundManager } from "@/managers/SoundManager";
import { MusicManager } from "@/managers/MusicManager";
import {
  RLGLDoll,
  RLGLGuard,
  RLGLContestant,
} from "@/components/r3f/models";

/* ─────────────────────────────────────────────────────────────────────────────
 * CONSTANTS — world layout, gameplay tunables
 * ────────────────────────────────────────────────────────────────────────────*/

const FIELD_LEN          = 90;          
const FIELD_WIDTH        = 30;
const FINISH_Z           = -10;         
const START_Z            = FIELD_LEN - 10;
const PLAYER_SPEED       = 8.0;
const PLAYER_SPRINT_MULT = 1.55;
const TURN_DURATION      = 0.55;        
const GRACE_PERIOD       = 0.25;        
const VELOCITY_DEADZONE  = 0.02;        
const RED_DURATION_BASE  = 3.2;         
const RED_DURATION_MIN   = 2.0;
const MOVE_THRESHOLD     = 0.05;        
const NPC_COUNT          = 18;

// Difficulty-based timer constants
const TIMER_EASY   = 60;  // Easy = 60 seconds
const TIMER_MEDIUM = 45;  // Medium = 45 seconds
const TIMER_HARD   = 30;  // Hard = 30 seconds

/* ─────────────────────────────────────────────────────────────────────────────
 * STATE MACHINE ENUMS
 * ────────────────────────────────────────────────────────────────────────────*/

export enum LightPhase {
  GREEN = "green",
  WARNING = "warning",
  RED = "red"
}

export enum GamePhase {
  COUNTDOWN = "countdown",
  PLAYING = "playing",
  ELIMINATED = "eliminated",
  VICTORY = "victory",
  TIMEOUT = "timeout"
}

interface PlayerEntity {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  alive: boolean;
  finished: boolean;
  isHuman: boolean;
  number: number;
  npcStopOffsetMs: number; 
  npcResumeOffsetMs: number;
  npcStopTimer: number;
  npcResumeTimer: number;
  npcMoving: boolean;
  fallProgress: number;
  fallAxis: [number, number, number];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DOLL / PLAYER / GUARD MODELS
 * Moved to src/components/r3f/models/{RLGLDoll,RLGLContestant,RLGLGuard}.tsx
 * Imported above as RLGLDoll, RLGLContestant, RLGLGuard.
 * ────────────────────────────────────────────────────────────────────────────*/

/* ─────────────────────────────────────────────────────────────────────────────
 * ENVIRONMENT DYNAMIC FEATURES
 * ────────────────────────────────────────────────────────────────────────────*/

function GuardLasers() {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.001;
  });

  return (
    <group ref={group}>
      <Line
        points={[
          new THREE.Vector3(-FIELD_WIDTH / 2 + 2, 2.2, FINISH_Z + 1.5),
          new THREE.Vector3(0, 1.5, START_Z / 2),
        ]}
        color="#ff0000"
        lineWidth={0.8}
        transparent
        opacity={0.7}
      />
      <Line
        points={[
          new THREE.Vector3(FIELD_WIDTH / 2 - 2, 2.2, FINISH_Z + 1.5),
          new THREE.Vector3(0, 1.5, START_Z / 2),
        ]}
        color="#ff0000"
        lineWidth={0.8}
        transparent
        opacity={0.7}
      />
    </group>
  );
}

function Arena({ 
  isRed, 
  eliminationGuardRef, 
  guardFlashRef 
}: { 
  isRed: boolean; 
  eliminationGuardRef: React.MutableRefObject<{ guardIdx: number; targetPos: [number, number, number] } | null>;
  guardFlashRef: React.MutableRefObject<number>;
}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, FIELD_LEN / 2 - 5]} receiveShadow>
        <planeGeometry args={[FIELD_WIDTH + 6, FIELD_LEN + 20]} />
        <meshStandardMaterial color="#cda878" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, FIELD_LEN / 2 - 5]}>
        <ringGeometry args={[FIELD_WIDTH / 2 - 3, FIELD_WIDTH / 2 + 10, 64]} />
        <meshStandardMaterial color="#a8865d" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, START_Z]}>
        <planeGeometry args={[FIELD_WIDTH, 0.6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} emissive="#ffffff" emissiveIntensity={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, FINISH_Z]}>
        <planeGeometry args={[FIELD_WIDTH, 0.6]} />
        <meshStandardMaterial color="#f5c542" roughness={0.85} emissive="#f5c542" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-FIELD_WIDTH / 2 - 0.5, 5, FIELD_LEN / 2 - 5]} castShadow receiveShadow>
        <boxGeometry args={[1, 10, FIELD_LEN + 14]} />
        <meshStandardMaterial color="#e34a8a" roughness={0.65} />
      </mesh>
      <mesh position={[FIELD_WIDTH / 2 + 0.5, 5, FIELD_LEN / 2 - 5]} castShadow receiveShadow>
        <boxGeometry args={[1, 10, FIELD_LEN + 14]} />
        <meshStandardMaterial color="#e34a8a" roughness={0.65} />
      </mesh>
      <mesh position={[0, 6, -14]} castShadow receiveShadow>
        <boxGeometry args={[FIELD_WIDTH + 2, 12, 1]} />
        <meshStandardMaterial color="#75a1d1" roughness={0.8} />
      </mesh>
      <mesh position={[0, 11, -14.6]}>
        <planeGeometry args={[FIELD_WIDTH + 2, 4]} />
        <meshStandardMaterial color="#a7c3df" roughness={0.95} />
      </mesh>
      <mesh position={[0, 6, FIELD_LEN]} >
        <boxGeometry args={[FIELD_WIDTH + 2, 12, 1]} />
        <meshStandardMaterial color="#3d2c1f" roughness={0.85} />
      </mesh>
      {[20, 45, 70].map((z) => (
        <React.Fragment key={z}>
          <mesh position={[-FIELD_WIDTH / 2 + 0.1, 3.5, z]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[6, 6]} />
            <meshStandardMaterial color="#7a8a3a" transparent opacity={0.55} roughness={0.85} />
          </mesh>
          <mesh position={[FIELD_WIDTH / 2 - 0.1, 3.5, z]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[6, 6]} />
            <meshStandardMaterial color="#7a8a3a" transparent opacity={0.55} roughness={0.85} />
          </mesh>
        </React.Fragment>
      ))}
      <mesh position={[0, 6, -13.5]}>
        <planeGeometry args={[12, 9]} />
        <meshStandardMaterial color="#3c5a2a" transparent opacity={0.75} roughness={0.9} />
      </mesh>
      <ContactShadows
        position={[0, 0.02, -10]}
        opacity={0.5}
        scale={20}
        blur={2.2}
        far={4}
        resolution={512}
        color="#000"
      />
      
      <RLGLGuard 
        position={[-FIELD_WIDTH / 2 + 2, 0, FINISH_Z + 1.5]} 
        rotationY={Math.PI / 2} 
        isAiming={isRed} 
        isFiring={eliminationGuardRef.current?.guardIdx === 0 && performance.now() - guardFlashRef.current < 150}
        targetPosition={eliminationGuardRef.current?.targetPos}
      />
      <RLGLGuard 
        position={[FIELD_WIDTH / 2 - 2, 0, FINISH_Z + 1.5]} 
        rotationY={-Math.PI / 2} 
        isAiming={isRed}
        isFiring={eliminationGuardRef.current?.guardIdx === 1 && performance.now() - guardFlashRef.current < 150}
      />
      <RLGLGuard position={[-FIELD_WIDTH / 2 + 4, 0, FINISH_Z - 2]} rotationY={Math.PI / 3} />
      <RLGLGuard position={[FIELD_WIDTH / 2 - 4, 0, FINISH_Z - 2]} rotationY={-Math.PI / 3} />
      
      <RLGLGuard position={[-FIELD_WIDTH / 2 + 1, 0, START_Z - 20]} rotationY={Math.PI / 2} />
      <RLGLGuard position={[FIELD_WIDTH / 2 - 1, 0, START_Z - 20]} rotationY={-Math.PI / 2} />
      <RLGLGuard position={[-FIELD_WIDTH / 2 + 1, 0, 40]} rotationY={Math.PI / 2} />
      <RLGLGuard position={[FIELD_WIDTH / 2 - 1, 0, 40]} rotationY={-Math.PI / 2} />

      {isRed && <GuardLasers />}
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CAMERA
 * ────────────────────────────────────────────────────────────────────────────*/

function FollowCamera({
  targetX,
  targetZ,
  phase,
  shake,
}: {
  targetX: number;
  targetZ: number;
  phase: GamePhase;
  shake: number;
}) {
  const { camera } = useThree();
  const lookAt = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const ds = Math.min(dt, 0.05);

    let desiredX: number, desiredY: number, desiredZ: number;
    let lookX: number, lookY: number, lookZ: number;

    if (phase === GamePhase.COUNTDOWN) {
      const t = performance.now() * 0.0002;
      desiredX = Math.sin(t) * 12;
      desiredY = 5.5;
      desiredZ = -2 + Math.cos(t) * 8;
      lookX = 0;
      lookY = 2.5;
      lookZ = -8;
    } else if (phase === GamePhase.VICTORY) {
      desiredX = targetX + 2.5;
      desiredY = 3.0;
      desiredZ = targetZ - 3;
      lookX = targetX;
      lookY = 1.5;
      lookZ = targetZ - 5;
    } else {
      desiredX = targetX;
      desiredY = 4.2;
      desiredZ = targetZ + 7.5;
      lookX = targetX * 0.4;
      lookY = 1.6;
      lookZ = targetZ - 18;
    }

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, ds * 4.5);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, ds * 4.5);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, ds * 4.5);

    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }

    lookAt.current.set(lookX, lookY, lookZ);
    camera.lookAt(lookAt.current);
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SCENE LOGIC
 * ────────────────────────────────────────────────────────────────────────────*/

interface SceneProps {
  onGameOver: (phase: GamePhase, score: number) => void;
  onHudUpdate: (data: {
    timeLeft: number;
    aliveCount: number;
    lightPhase: LightPhase;
    score: number;
    playerProgressPct: number;
  }) => void;
  pausedRef: React.MutableRefObject<boolean>;
  inputRef: React.MutableRefObject<{ forward: boolean; sprint: boolean }>;
  resetSignal: number;
  roundTimer: number;
}

function Scene({ onGameOver, onHudUpdate, pausedRef, inputRef, resetSignal, roundTimer }: SceneProps) {
  const playersRef    = useRef<PlayerEntity[]>([]);
  const lightPhaseRef = useRef<LightPhase>(LightPhase.GREEN);
  const turnTRef      = useRef(0);     
  const redTimerRef   = useRef(0);
  const graceTimerRef = useRef(0);     
  const gamePhaseRef  = useRef<GamePhase>(GamePhase.COUNTDOWN); 
  const countdownRef  = useRef(3);
  const timeLeftRef   = useRef(roundTimer);
  const scoreRef      = useRef(0);
  const shakeRef      = useRef(0);
  const lastStepRef   = useRef(0);
  const fakeOutChanceRef = useRef(0);
  const aliveCountRef    = useRef(NPC_COUNT + 1);
  const hudThrottleRef   = useRef(0);
  const guardFlashRef = useRef(0);
  const dollRotationRef = useRef(0);
  const elimStateRef  = useRef<"idle" | "locking" | "audio" | "shake" | "fall" | "summary">("idle");
  const elimTimerRef  = useRef(0);
  const eliminationGuardRef = useRef<{ guardIdx: number; targetPos: [number, number, number] } | null>(null);

  const shotLineRef = useRef<THREE.Line>(null);
  const shotTimerRef = useRef<number>(0);

  const handleDollSongEnd = useCallback(() => {
    if (lightPhaseRef.current === LightPhase.GREEN && gamePhaseRef.current === GamePhase.PLAYING) {
      lightPhaseRef.current = LightPhase.WARNING;
      turnTRef.current = 0;
      SoundManager.getInstance().play("countdown_beep" as any);
    }
  }, []);

  const startDollSong = useCallback(() => {
    MusicManager.getInstance().play("rlgl_green", 0, handleDollSongEnd);
  }, [handleDollSongEnd]);

  const stopDollSong = useCallback(() => {
    MusicManager.getInstance().stop(220);
  }, []);

  useEffect(() => {
    const arr: PlayerEntity[] = [];
    arr.push({
      id: 0,
      x: 0,
      z: START_Z - 1.0,
      vx: 0,
      vz: 0,
      alive: true,
      finished: false,
      isHuman: true,
      number: 456,
      npcStopOffsetMs: 0,
      npcResumeOffsetMs: 0,
      npcStopTimer: 0,
      npcResumeTimer: 0,
      npcMoving: false,
      fallProgress: 0,
      fallAxis: [1, 0, 0],
    });
    for (let i = 1; i <= NPC_COUNT; i++) {
      const lane = ((i - 1) % 7) - 3; 
      const row  = Math.floor((i - 1) / 7);
      arr.push({
        id: i,
        x: lane * 2.6 + (Math.random() - 0.5) * 0.4,
        z: START_Z - 1.0 - row * 1.4,
        vx: 0,
        vz: 0,
        alive: true,
        finished: false,
        isHuman: false,
        number: 100 + i * 7,
        npcStopOffsetMs: 80 + Math.random() * 320,
        npcResumeOffsetMs: 120 + Math.random() * 280,
        npcStopTimer: 0,
        npcResumeTimer: 0,
        npcMoving: false,
        fallProgress: 0,
        fallAxis: [
          Math.random() > 0.5 ? 1 : -1,
          0,
          Math.random() > 0.5 ? 1 : -1,
        ],
      });
    }
    playersRef.current    = arr;
    lightPhaseRef.current = LightPhase.GREEN;
    turnTRef.current      = 0;
    redTimerRef.current   = 0;
    graceTimerRef.current = 0;
    dollRotationRef.current = 0;
    elimStateRef.current  = "idle";
    elimTimerRef.current  = 0;
    
    gamePhaseRef.current  = GamePhase.COUNTDOWN;
    countdownRef.current  = 3;
    timeLeftRef.current   = roundTimer;
    scoreRef.current      = 0;
    shakeRef.current      = 0;
    fakeOutChanceRef.current = 0;
    aliveCountRef.current = NPC_COUNT + 1;
    shotTimerRef.current  = 0;
    guardFlashRef.current = 0;
    eliminationGuardRef.current = null;

    if (shotLineRef.current) {
      shotLineRef.current.visible = false;
    }

    stopDollSong();
    SoundManager.getInstance().stopLoop("heartbeat" as any, 0);

  }, [resetSignal, stopDollSong, roundTimer]);

  const countdownLastIntRef = useRef(3);

  useFrame((_, rawDt) => {
    if (pausedRef.current) return;
    const dt = Math.min(rawDt, 0.05);
    const snap = inputManager.snapshot();
    const sm = SoundManager.getInstance();

    const players = playersRef.current;
    const human   = players[0];
    if (!human) {
      inputManager.endFrame();
      return;
    }

    if (shotTimerRef.current > 0 && shotLineRef.current) {
      shotTimerRef.current -= dt;
      const mat = shotLineRef.current.material as THREE.LineBasicMaterial;
      if (mat) mat.opacity = Math.max(0, shotTimerRef.current / 0.25);
      if (shotTimerRef.current <= 0) {
        shotLineRef.current.visible = false;
      }
    }

    if (gamePhaseRef.current === GamePhase.COUNTDOWN) {
      countdownRef.current -= dt;
      const intNow = Math.ceil(countdownRef.current);
      if (intNow !== countdownLastIntRef.current) {
        countdownLastIntRef.current = intNow;
        if (intNow > 0) sm.play("countdown_beep" as any);
      }
      if (countdownRef.current <= 0) {
        gamePhaseRef.current = GamePhase.PLAYING;
        useGameStore.getState().setRuntimePhase("playing");
        sm.play("countdown_go" as any);
        startDollSong();
        lightPhaseRef.current = LightPhase.GREEN;
      }
      inputManager.endFrame();
      return;
    }

    if (gamePhaseRef.current !== GamePhase.PLAYING) {
      for (const p of players) {
        if (!p.alive && p.fallProgress < 1) p.fallProgress = Math.min(1, p.fallProgress + dt * 2);
      }
      inputManager.endFrame();
      return;
    }

    timeLeftRef.current -= dt;
    if (timeLeftRef.current <= 0) {
      gamePhaseRef.current = GamePhase.TIMEOUT;
      stopDollSong();
      sm.stopLoop("heartbeat" as any, 300);
      sm.stopLoop("scan_tone" as any, 300);
      onGameOver(GamePhase.TIMEOUT, Math.floor(scoreRef.current));
      inputManager.endFrame();
      return;
    }

    const lp = lightPhaseRef.current;

    if (lp === LightPhase.WARNING) {
      turnTRef.current += dt / TURN_DURATION;
      dollRotationRef.current = THREE.MathUtils.lerp(0, Math.PI, turnTRef.current);
      if (turnTRef.current >= 1) {
        turnTRef.current = 1;
        lightPhaseRef.current = LightPhase.RED;
        redTimerRef.current = 0;
        graceTimerRef.current = 0;
        dollRotationRef.current = Math.PI;
        sm.loop("scan_tone" as any);
        sm.loop("heartbeat" as any);
      }
    } else if (lp === LightPhase.RED) {
      redTimerRef.current += dt;
      graceTimerRef.current += dt;
      const redDur = Math.max(RED_DURATION_MIN, RED_DURATION_BASE - timeLeftRef.current / roundTimer * 0.5);
      if (redTimerRef.current >= redDur) {
        lightPhaseRef.current = LightPhase.GREEN;
        redTimerRef.current   = 0;
        graceTimerRef.current = 0;
        dollRotationRef.current = 0;
        sm.stopLoop("heartbeat" as any, 400);
        sm.stopLoop("scan_tone" as any, 300);
        startDollSong();
      }
    } else if (lp === LightPhase.GREEN) {
      dollRotationRef.current = 0;
    }

    if (human.alive && !human.finished && gamePhaseRef.current === GamePhase.PLAYING) {
      const input = inputRef.current;
      const keyHeld = snap.heldKeys.has("ArrowUp") || snap.heldKeys.has("KeyW");
      
      // ADD the elimination check back so you can't run while being shot!
      const wantMove = (keyHeld || input.forward) && elimStateRef.current === "idle";
      
      const speed = PLAYER_SPEED * (input.sprint ? PLAYER_SPRINT_MULT : 1);

      // RLGL Movement: Instant stop/start
      human.vz = wantMove ? -speed : 0;
      human.vx = 0;
      human.z += human.vz * dt;

      if (wantMove) {
        lastStepRef.current += dt;
        if (lastStepRef.current > 0.32) {
          lastStepRef.current = 0;
          sm.play("player_step" as any, 50, 0.1);
        }
      }

      if (human.z <= FINISH_Z) {
        human.finished = true;
        human.z = FINISH_Z;
        human.vz = 0;
        
        gamePhaseRef.current = GamePhase.VICTORY; 
        
        stopDollSong();
        sm.stopLoop("heartbeat" as any, 300);
        sm.stopLoop("scan_tone" as any, 300);
        sm.play("player_victory" as any);
        sm.play("crowd_cheer" as any);
        
        const timeBonus = Math.floor(timeLeftRef.current * 50);
        const speedBonus = timeLeftRef.current > 60 ? 2000 : timeLeftRef.current > 45 ? 1000 : 0;
        scoreRef.current += 5000 + timeBonus + speedBonus;
        
        shakeRef.current = 0.15;
        onGameOver(GamePhase.VICTORY, Math.floor(scoreRef.current));
      }
    }

    const isGreenForNPC = lp === LightPhase.GREEN || lp === LightPhase.WARNING;
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      if (!p.alive || p.finished) {
        if (!p.alive && p.fallProgress < 1) p.fallProgress = Math.min(1, p.fallProgress + dt * 2);
        continue;
      }

      if (isGreenForNPC) {
        p.npcResumeTimer += dt * 1000;
        if (!p.npcMoving && p.npcResumeTimer >= p.npcResumeOffsetMs) {
          p.npcMoving = true;
          p.npcStopTimer = 0;
        }
      } else {
        p.npcStopTimer += dt * 1000;
        if (p.npcMoving && p.npcStopTimer >= p.npcStopOffsetMs) {
          p.npcMoving = false;
          p.npcResumeTimer = 0;
        }
      }

      const baseSpeed = 5 + (p.id % 5) * 0.5;
      const speedVariation = Math.sin(performance.now() * 0.001 + p.id) * 0.3;
      const npcSpeed = baseSpeed + speedVariation;

      // RLGL NPC Movement: Instant stop/start
      p.vz = p.npcMoving ? -npcSpeed : 0;

      if (p.npcMoving) {
        const drift = Math.sin(performance.now() * 0.003 + p.id * 0.7) * 0.015;
        p.x += drift;
        p.x = Math.max(-FIELD_WIDTH / 2 + 1, Math.min(FIELD_WIDTH / 2 - 1, p.x));
      }

      p.z += p.vz * dt;

      if (p.z <= FINISH_Z) {
        p.finished = true;
        p.z = FINISH_Z;
        p.vz = 0;
      }
    }

    if (lp === LightPhase.RED) {
      if (human.alive && !human.finished && Math.abs(human.vz) > 0.01) {
        const dangerLevel = Math.min(1, Math.abs(human.vz) / MOVE_THRESHOLD);
        sm.setHeartbeatIntensity?.(0.55 + dangerLevel * 0.35);
      } else {
        sm.setHeartbeatIntensity?.(0.55);
      }

      if (human.alive && !human.finished && gamePhaseRef.current === GamePhase.PLAYING) {
        const inGracePeriod = graceTimerRef.current < GRACE_PERIOD;
        const hasMovement = Math.abs(human.vz) > VELOCITY_DEADZONE;
        
        if (hasMovement && !inGracePeriod) {
          elimStateRef.current = "locking";
          elimTimerRef.current = 0;
        }
      }
      
      if (elimStateRef.current !== "idle") {
        elimTimerRef.current += dt;
        
        switch (elimStateRef.current) {
          case "locking":
            inputRef.current.forward = false;
            inputRef.current.sprint = false;
            human.vz = 0;
            if (elimTimerRef.current >= 0.1) {
              elimStateRef.current = "audio";
              elimTimerRef.current = 0;
              sm.play("player_eliminated" as any);
            }
            break;
            
          case "audio":
            if (elimTimerRef.current >= 0.3) {
              elimStateRef.current = "shake";
              elimTimerRef.current = 0;
              shakeRef.current = 0.45;
              guardFlashRef.current = performance.now();
              if (shotLineRef.current) {
                const guardX = -FIELD_WIDTH / 2 + 2;
                const guardY = 1.92;
                const guardZ = FINISH_Z + 1.5;
                const points = [
                  new THREE.Vector3(guardX, guardY, guardZ),
                  new THREE.Vector3(human.x, 0.95, human.z)
                ];
                shotLineRef.current.geometry.setFromPoints(points);
                shotLineRef.current.visible = true;
                shotTimerRef.current = 0.25;
              }
            }
            break;
            
          case "shake":
            if (elimTimerRef.current >= 0.2) {
              elimStateRef.current = "fall";
              elimTimerRef.current = 0;
              human.alive = false;
              human.fallProgress = 0;
              sm.play("shatter" as any);
              sm.play("crowd_gasp" as any);
              stopDollSong();
              sm.stopLoop("heartbeat" as any, 300);
            }
            break;
            
          case "fall":
            if (elimTimerRef.current >= 1.5) {
              elimStateRef.current = "summary";
              elimTimerRef.current = 0;
              gamePhaseRef.current = GamePhase.ELIMINATED;
              onGameOver(GamePhase.ELIMINATED, Math.floor(scoreRef.current));
            }
            break;
        }
      }
      
      const inGracePeriod = graceTimerRef.current < GRACE_PERIOD;
      if (!inGracePeriod) {
        for (let i = 1; i < players.length; i++) {
          const p = players[i];
          if (!p.alive || p.finished) continue;
          if (Math.abs(p.vz) > VELOCITY_DEADZONE) {
            p.alive = false;
            p.fallProgress = 0;
            sm.play("shatter" as any);
          }
        }
      }
    }

    shakeRef.current = Math.max(0, shakeRef.current - dt * 1.5);
    if (human.alive) scoreRef.current += dt * 25;

    let alive = 0;
    for (const p of players) if (p.alive) alive++;
    aliveCountRef.current = alive;

    hudThrottleRef.current += dt;
    if (hudThrottleRef.current > 0.08) {
      hudThrottleRef.current = 0;
      const dist = START_Z - human.z;
      const progress = Math.max(0, Math.min(1, dist / (START_Z - FINISH_Z)));
      onHudUpdate({
        timeLeft: Math.max(0, timeLeftRef.current),
        aliveCount: alive,
        lightPhase: lightPhaseRef.current,
        score: Math.floor(scoreRef.current),
        playerProgressPct: progress,
      });
    }

    inputManager.endFrame();
  });

  const isRed = lightPhaseRef.current === LightPhase.RED;

  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const R3FLine = 'line' as any;
  return (
    <>
      <FollowCamera
        targetX={playersRef.current[0]?.x ?? 0}
        targetZ={playersRef.current[0]?.z ?? START_Z}
        phase={gamePhaseRef.current}
        shake={shakeRef.current}
      />
      
      <ambientLight 
        intensity={isRed ? 0.25 : 0.65} 
        color={isRed ? "#4a0808" : "#ffe8c4"} 
      />
      <directionalLight
        position={[15, 20, 20]}
        intensity={isRed ? 0.5 : 1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0001}
        color={isRed ? "#ff4444" : "#fff4d6"}
      />
      <hemisphereLight 
        args={[
          isRed ? "#330000" : "#b8d4ff", 
          isRed ? "#0a0000" : "#4a3a2d", 
          isRed ? 0.15 : 0.5
        ]} 
      />

      {isRed && (
        <>
          <directionalLight
            position={[0, 25, -15]}
            intensity={1.5}
            color="#ff2020"
            target-position={[0, 0, 40]}
          />
          <pointLight
            position={[0, 8, -12]}
            intensity={3}
            distance={80}
            decay={1.5}
            color="#ff3333"
          />
        </>
      )}

      {performance.now() - guardFlashRef.current < 100 && (
        <>
          <pointLight
            position={[-FIELD_WIDTH / 2 + 2, 2.2, FINISH_Z + 1.5]}
            intensity={15}
            distance={35}
            color="#ffaa44"
            decay={2}
            castShadow
          />
          <pointLight
            position={[FIELD_WIDTH / 2 - 2, 2.2, FINISH_Z + 1.5]}
            intensity={15}
            distance={35}
            color="#ffaa44"
            decay={2}
            castShadow
          />
        </>
      )}

      <color attach="background" args={[isRed ? "#1a0505" : "#a7c3df"]} />

      <fog 
        attach="fog" 
        args={[
          isRed ? "#2a0808" : "#98b8d8", 
          isRed ? 18 : 40, 
          isRed ? 95 : 150
        ]} 
      />

      <Arena 
        isRed={isRed} 
        eliminationGuardRef={eliminationGuardRef} 
        guardFlashRef={guardFlashRef} 
      />
      <RLGLDoll
        position={[0, 0, -12.5]}
        targetRotation={dollRotationRef.current}
        isRed={isRed}
        scanIntensity={Math.min(1, redTimerRef.current * 1.2)}
      />
      {playersRef.current.map((p) => (
        <RLGLContestant 
          key={p.id} 
          player={p} 
          isMoving={Math.abs(p.vz) > 0.2} 
          isRedLight={isRed} 
        />
      ))}

      <R3FLine ref={shotLineRef} geometry={lineGeometry}>
        <lineBasicMaterial color="#ff1133" linewidth={3} transparent opacity={1} depthWrite={false} />
      </R3FLine>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * MAIN COMPONENT
 * ────────────────────────────────────────────────────────────────────────────*/

interface RLGLProps {
  onExit?: () => void;
  onComplete?: (score: number, outcome: "victory" | "eliminated") => void;
}

export default function RedLightGreenLight3D({ onExit, onComplete }: RLGLProps) {
  const settings = useGameStore((s) => s.settings);
  const setRuntimePhase = useGameStore((s) => s.setRuntimePhase);

  // Compute round timer based on current difficulty
  const difficultyTimer = useMemo(() => {
    switch (settings.difficulty) {
      case "easy": return TIMER_EASY;
      case "hard": return TIMER_HARD;
      default: return TIMER_MEDIUM;
    }
  }, [settings.difficulty]);

  useEffect(() => {
    setRuntimePhase("countdown");
  }, [setRuntimePhase]);

  useEffect(() => {
    const sm = SoundManager.getInstance();
    const mm = MusicManager.getInstance();
    sm.preload([
      "player_step", "player_jump", "player_land",
      "player_eliminated", "player_victory",
      "heartbeat", "shatter", "crowd_gasp", "crowd_cheer", "countdown_beep", "countdown_go", "scan_tone"
    ] as any[]);
    
    return () => {
      sm.stopAll(0);
      sm.stopAllLoops(0);
      mm.stopAll();
    };
  }, []);

  useEffect(() => {
    const sm = SoundManager.getInstance();
    const mm = MusicManager.getInstance();
    // Use the SoundManager to store the volume state universally 
    sm.setMasterVolume(settings.masterVolume);
    sm.setSFXVolume(settings.sfxVolume);
    sm.setMusicVolume(settings.musicVolume); 
    
    // Command the MusicManager to pull the updated multipliers from the SoundManager
    mm.updateVolume();
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  const inputRef = useRef({ forward: false, sprint: false });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        SoundManager.getInstance().stopAll(0);
        SoundManager.getInstance().stopAllLoops(0);
        MusicManager.getInstance().stopAll();
        onExit?.();
        return;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        inputRef.current.sprint = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        inputRef.current.sprint = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onBlur = () => { inputRef.current.forward = false; inputRef.current.sprint = false; };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [onExit]);

  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  
  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      const sm = SoundManager.getInstance();
      const mm = MusicManager.getInstance();
      if (!p) {
        sm.stopLoop("heartbeat" as any, 0);
        mm.pause();
      } else {
        sm.loop("heartbeat" as any);
        mm.resume();
      }
      return !p;
    });
  }, []);

  const [hud, setHud] = useState({
    timeLeft: difficultyTimer,
    aliveCount: NPC_COUNT + 1,
    lightPhase: LightPhase.GREEN,
    score: 0,
    playerProgressPct: 0,
  });
  const handleHudUpdate = useCallback((d: typeof hud) => setHud(d), []);

  const [endState, setEndState] = useState<{ phase: GamePhase; score: number } | null>(null);
  
  const handleGameOver = useCallback((phase: GamePhase, score: number) => {
    setEndState({ phase, score });
    
    const state = useGameStore.getState();
    state.addScore(score);
    state.updateBestScore("red-light-green-light", score);
    
    if (phase === GamePhase.VICTORY) {
      state.setRuntimePhase("victory");
      onComplete?.(score, "victory");
    } else if (phase === GamePhase.ELIMINATED || phase === GamePhase.TIMEOUT) {
      state.setRuntimePhase("eliminated");
      onComplete?.(score, "eliminated");
    }
  }, [onComplete]);

  const [resetSignal, setResetSignal] = useState(0);
  const handleRestart = useCallback(() => {
    // Clean stop all audio before restart
    SoundManager.getInstance().stopAll(0);
    SoundManager.getInstance().stopAllLoops(0);
    MusicManager.getInstance().stopAll();
    
    // Reset UI state
    setEndState(null);
    setRuntimePhase("countdown");
    setHud({ 
      timeLeft: difficultyTimer, 
      aliveCount: NPC_COUNT + 1, 
      lightPhase: LightPhase.GREEN, 
      score: 0, 
      playerProgressPct: 0 
    });
    
    // Trigger scene reset via signal
    setResetSignal((n) => n + 1);
  }, [setRuntimePhase, difficultyTimer]);

  const moveHoldHandlers = useMemo(() => ({
    onPointerDown: (e: React.PointerEvent) => { 
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId); 
      inputRef.current.forward = true; 
    },
    onPointerUp:   () => { inputRef.current.forward = false; },
    onPointerLeave:() => { inputRef.current.forward = false; },
    onPointerCancel:() => { inputRef.current.forward = false; },
  }), []);

  return (
    <div
      data-testid="rlgl3d-root"
      style={{
        position: "fixed", inset: 0, width: "100vw", height: "100dvh",
        background: "#000", overflow: "hidden",
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        userSelect: "none",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 250, position: [0, 6, 95] }}
        onPointerMissed={() => { /* noop */ }}
      >
        <Suspense fallback={null}>
          <Scene
            onGameOver={handleGameOver}
            onHudUpdate={handleHudUpdate}
            pausedRef={pausedRef}
            inputRef={inputRef}
            resetSignal={resetSignal}
            roundTimer={difficultyTimer}
          />
        </Suspense>
      </Canvas>

      <HUDOverlay
        hud={hud}
        onExit={onExit}
        onPause={togglePause}
        paused={paused}
      />

      {hud.lightPhase === LightPhase.RED && (
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
            boxShadow: "inset 0 0 220px 60px rgba(220,20,20,0.55)",
            animation: "rlgl3d-pulse 1.4s ease-in-out infinite alternate",
          }}
        />
      )}

      {paused && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 30,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24,
          }}
        >
          <div style={{ fontFamily: "var(--font-bebas)", fontSize: 64, letterSpacing: "0.2em", color: "#ff0066" }}>
            PAUSED
          </div>
          <button onClick={togglePause} data-testid="rlgl3d-resume" style={btnStyle("#00ffb2")}>
            RESUME
          </button>
          {onExit && (
            <button onClick={() => {
              SoundManager.getInstance().stopAll(0);
              SoundManager.getInstance().stopAllLoops(0);
              MusicManager.getInstance().stopAll();
              onExit();
            }} data-testid="rlgl3d-pause-exit" style={btnStyle("#ff0066")}>
              EXIT TO MENU
            </button>
          )}
        </div>
      )}

      {endState && (
        <EndScreen
          phase={endState.phase}
          score={endState.score}
          aliveCount={hud.aliveCount}
          onRestart={handleRestart}
          onExit={onExit}
        />
      )}

      <div
        data-testid="rlgl3d-mobile-controls"
        style={{
          position: "absolute", bottom: 28, left: 0, right: 0, zIndex: 25,
          display: "flex", justifyContent: "center", gap: 24, pointerEvents: "none",
        }}
        className="rlgl3d-touch-only"
      >
        <button
          {...moveHoldHandlers}
          data-testid="rlgl3d-move-btn"
          style={{
            pointerEvents: "auto",
            width: 110, height: 110, borderRadius: 60,
            background: "rgba(15,160,125,0.75)",
            border: "3px solid rgba(255,255,255,0.6)",
            color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.18em",
            backdropFilter: "blur(6px)",
            boxShadow: "0 0 32px rgba(15,160,125,0.5)",
            touchAction: "none",
          }}
        >
          HOLD<br/>TO RUN
        </button>
      </div>

      <style>{`
        @keyframes rlgl3d-pulse {
          from { box-shadow: inset 0 0 180px 50px rgba(220,20,20,0.45); }
          to   { box-shadow: inset 0 0 260px 80px rgba(255,40,40,0.7);  }
        }
        @media (pointer: fine) {
          .rlgl3d-touch-only { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * HUD OVERLAY
 * ────────────────────────────────────────────────────────────────────────────*/

function HUDOverlay({
  hud, onExit, onPause, paused,
}: {
  hud: { timeLeft: number; aliveCount: number; lightPhase: LightPhase; score: number; playerProgressPct: number };
  onExit?: () => void;
  onPause: () => void;
  paused: boolean;
}) {
  const isRed = hud.lightPhase === LightPhase.RED;
  const isWarning = hud.lightPhase === LightPhase.WARNING;
  const lightCol = isRed ? "#ff2640" : isWarning ? "#ffae2a" : "#00ffb2";
  
  const lightLabel = hud.lightPhase === LightPhase.GREEN ? "GREEN LIGHT"
    : hud.lightPhase === LightPhase.RED ? "RED LIGHT"
    : "WARNING";

  const tMin = Math.floor(hud.timeLeft / 60);
  const tSec = Math.floor(hud.timeLeft % 60);
  const lowTime = hud.timeLeft < 15;

  return (
    <>
      <div
        data-testid="rlgl3d-hud-top"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          padding: "16px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", gap: 12, pointerEvents: "auto" }}>
          {onExit && (
            <button
              onClick={() => {
                SoundManager.getInstance().stopAll(0);
                SoundManager.getInstance().stopAllLoops(0);
                MusicManager.getInstance().stopAll();
                onExit();
              }}
              data-testid="rlgl3d-exit-btn"
              style={{
                padding: "8px 14px",
                background: "rgba(8,8,14,0.78)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 4,
                color: "rgba(245,245,245,0.85)",
                fontSize: 11, letterSpacing: "0.18em", fontWeight: 700,
                textTransform: "uppercase", cursor: "pointer",
                backdropFilter: "blur(8px)",
              }}
            >
              ← MENU
            </button>
          )}
          <div style={panelStyle()}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: "0.2em" }}>ALIVE</span>
            <span style={{ color: "#fff", fontWeight: 800, marginLeft: 8, fontSize: 16 }}>
              {hud.aliveCount.toString().padStart(2, "0")}<span style={{ color: "rgba(255,255,255,0.3)" }}>/{NPC_COUNT + 1}</span>
            </span>
          </div>
        </div>

        <div
          data-testid="rlgl3d-hud-light"
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            pointerEvents: "none",
          }}
        >
          <div style={{
            padding: "10px 26px",
            border: `1.5px solid ${lightCol}`,
            background: `${lightCol}18`,
            borderRadius: 4,
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "var(--font-bebas)",
            fontSize: 24, letterSpacing: "0.32em", color: lightCol,
            backdropFilter: "blur(10px)",
            boxShadow: `0 0 38px ${lightCol}50`,
            textShadow: `0 0 16px ${lightCol}`,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: 10, background: lightCol,
              boxShadow: `0 0 12px ${lightCol}`,
              animation: isRed ? "rlgl3d-blink 0.7s linear infinite" : "none",
            }} />
            {lightLabel}
          </div>
          <div style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: 28, fontWeight: 700, color: lowTime ? "#ff2640" : "#fff",
            textShadow: lowTime ? "0 0 18px rgba(255,38,64,0.7)" : "none",
            letterSpacing: "0.06em",
          }}>
            {tMin.toString().padStart(2, "0")}:{tSec.toString().padStart(2, "0")}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, pointerEvents: "auto" }}>
          <div style={panelStyle()}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: "0.2em" }}>SCORE</span>
            <span style={{ color: "#00ffb2", fontWeight: 800, marginLeft: 8, fontSize: 16, textShadow: "0 0 10px rgba(0,255,178,0.55)" }}>
              {hud.score.toLocaleString("en-US").padStart(6, "0")}
            </span>
          </div>
          <button
            onClick={onPause}
            data-testid="rlgl3d-pause-btn"
            aria-label={paused ? "Resume" : "Pause"}
            style={{
              padding: "8px 14px",
              background: "rgba(8,8,14,0.78)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 4,
              color: "rgba(245,245,245,0.85)",
              fontSize: 11, letterSpacing: "0.18em", fontWeight: 700,
              textTransform: "uppercase", cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
          >
            {paused ? "▶ PLAY" : "❚❚ PAUSE"}
          </button>
        </div>
      </div>

      <div
        data-testid="rlgl3d-progress"
        style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          bottom: 18, width: "min(640px, 80%)", zIndex: 10,
          padding: "8px 14px",
          background: "rgba(8,8,14,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.45)" }}>
          <span>START</span>
          <span>{Math.round(hud.playerProgressPct * 100)}%</span>
          <span>FINISH</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${hud.playerProgressPct * 100}%`,
              background: "linear-gradient(90deg, #00ffb2 0%, #ffd83d 60%, #ff0066 100%)",
              transition: "width 0.18s linear",
              boxShadow: "0 0 12px rgba(0,255,178,0.6)",
            }}
          />
        </div>
      </div>

      <div style={{
        position: "absolute", left: 22, bottom: 76, zIndex: 10,
        padding: "8px 12px",
        background: "rgba(8,8,14,0.6)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 4,
        fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.6)",
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
      }}
        className="rlgl3d-desktop-only"
      >
        HOLD <b style={{ color: "#00ffb2" }}>W</b> / <b style={{ color: "#00ffb2" }}>↑</b> / <b style={{ color: "#00ffb2" }}>SPACE</b> TO RUN · <b>SHIFT</b> SPRINT · <b>ESC</b> EXIT
      </div>
      <style>{`
        @keyframes rlgl3d-blink {
          50% { opacity: 0.25; }
        }
        @media (pointer: coarse) {
          .rlgl3d-desktop-only { display: none !important; }
        }
      `}</style>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * END SCREEN
 * ────────────────────────────────────────────────────────────────────────────*/

function EndScreen({
  phase, score, aliveCount, onRestart, onExit,
}: {
  phase: GamePhase; score: number; aliveCount: number;
  onRestart: () => void; onExit?: () => void;
}) {
  const isWin = phase === GamePhase.VICTORY;
  const title = isWin ? "YOU SURVIVED" : phase === GamePhase.TIMEOUT ? "TIME'S UP" : "ELIMINATED";
  const sub   = isWin ? "ROUND CLEARED" : phase === GamePhase.TIMEOUT ? "FAILED TO REACH FINISH" : "MOVED DURING RED LIGHT";
  const color = isWin ? "#00ffb2" : "#ff2640";

  return (
    <div
      data-testid="rlgl3d-endscreen"
      style={{
        position: "absolute", inset: 0, zIndex: 40,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(14px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22,
        animation: "rlgl3d-fadein 0.5s ease",
      }}
    >
      <div style={{
        fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
        fontSize: "clamp(48px, 11vw, 110px)", letterSpacing: "0.15em",
        color, textShadow: `0 0 50px ${color}`,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 12, letterSpacing: "0.32em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>
        {sub}
      </div>
      <div style={{ display: "flex", gap: 32, marginTop: 10 }}>
        <Stat label="SCORE" value={score.toLocaleString("en-US")} accent="#ffd83d" />
        <Stat label="SURVIVORS" value={`${aliveCount}/${NPC_COUNT + 1}`} accent="#00ffb2" />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
        <button data-testid="rlgl3d-restart" onClick={onRestart} style={btnStyle("#00ffb2")}>
          PLAY AGAIN
        </button>
        {onExit && (
          <button data-testid="rlgl3d-end-exit" onClick={() => {
            SoundManager.getInstance().stopAll(0);
            SoundManager.getInstance().stopAllLoops(0);
            MusicManager.getInstance().stopAll();
            onExit();
          }} style={btnStyle("#ff0066")}>
            ← MENU
          </button>
        )}
      </div>
      <style>{`
        @keyframes rlgl3d-fadein {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);   }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.3em", color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color: accent, textShadow: `0 0 16px ${accent}88`, fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * STYLE HELPERS
 * ────────────────────────────────────────────────────────────────────────────*/

function panelStyle(): React.CSSProperties {
  return {
    padding: "8px 14px",
    background: "rgba(8,8,14,0.78)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 4,
    backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  };
}

function btnStyle(accent: string): React.CSSProperties {
  return {
    padding: "12px 30px",
    background: "transparent",
    border: `1.5px solid ${accent}`,
    borderRadius: 4,
    color: accent,
    fontSize: 13, letterSpacing: "0.22em", fontWeight: 800,
    fontFamily: "var(--font-bebas, 'Bebas Neue', sans-serif)",
    cursor: "pointer",
    textTransform: "uppercase",
    transition: "all 140ms",
  };
}