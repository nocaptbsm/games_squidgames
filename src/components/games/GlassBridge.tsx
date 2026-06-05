// src/components/games/GlassBridge.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameShellBridge } from "@/components/GameShell";
import { useHUDSync } from "@/components/hud/useHUDSync";
import { SoundManager } from "@/managers/SoundManager";
import { ResultScreen } from "../ui/ResultScreen";
import { lerp, clamp } from "@/utils/math";
import { RLGLDoll, RLGLGuard, RLGLContestant } from "@/components/r3f/models";
import { useGameStore } from "@/store/gameStore";

interface GameProps {
  onExit?: () => void;
  onComplete?: (score: number, outcome: "victory" | "eliminated") => void;
}

const WORLD_W = 1280;
const WORLD_H = 720;
const TOTAL_ROWS = 18;

const PLAYER_W = 68; 
const PLAYER_H = 100;
const PANEL_W = 140; 
const PANEL_H = 80;
const PANEL_GAP_X = 30;
const PANEL_GAP_Y = 36;
const ROW_0_Y = WORLD_H * 0.85; 

const JUMP_DURATION = 0.38; 
const JUMP_HEIGHT = 60; 
const FALL_GRAVITY = 1800; 
const SLOW_MO_SCALE = 0.08;
const SLOW_MO_RESTORE_DELAY = 0.9; 

const SHAKE_SHATTER = 14;
const SHAKE_DECAY_RATE = 0.88;

const SAFE_BLUE: [number, number, number] = [3, 135, 121]; 
const FRAGILE_BLUE: [number, number, number] = [180, 210, 220]; 

const CAMERA_LERP = 5;
const COUNTDOWN_TOTAL = 120; 

interface Panel {
  row: number;
  col: 0 | 1 | 2; 
  safe: boolean;
  state: "intact" | "cracking" | "shattered" | "gone";
  crackTimer: number; 
  glintTimer: number;
  glintPhase: number; 
  glintPhase2: number; 
  wobbleAmp: number;
  wobblePhase: number;
  reflectionAlpha: number;
  flashAlpha: number;
}

interface PlayerState {
  row: number; 
  col: 0 | 1 | 2 | null; 
  worldY: number; 
  jumpT: number; 
  jumping: boolean;
  targetRow: number;
  targetCol: 0 | 1 | 2; 
  startY: number;
  facing: -1 | 1;
  status: "alive" | "falling" | "finished";
  fallY: number;
  fallVy: number;
  screenShakeX: number;
  screenShakeY: number;
  walkBob: number;
  walkBobDir: number;
}

interface CameraState {
  y: number;
  targetY: number;
  shake: number;
  shakeTimer: number;
  shakeDecay: number;
  zoom: number;
  targetZoom: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; 
  decay: number;
  r: number;
  g: number;
  b: number;
  size: number;
  active: boolean;
}

type Phase = "intro" | "playing" | "falling" | "gameover" | "victory" | "transitioning";
type ElimPhase = "none" | "shatter" | "slow_fall" | "showing";

interface GameState {
  phase: Phase;
  elimPhase: ElimPhase;
  elimTimer: number;
  panels: Panel[][];
  currentRow: number;
  totalRows: number;
  player: PlayerState;
  camera: CameraState;
  timeLeft: number;
  elapsed: number;
  slowMoMult: number;
  particles: Particle[];
  audioEvents: Set<string>;
  atmosphericT: number;
  vignetteIntensity: number;
  vignetteTarget: number;
  flashAlpha: number;
  fadeAlpha: number;
  inputConsumed: boolean;
  seed: number;
  ambientDripTimer: number;
  lateGameZoomActive: boolean;
}

class ObjectPool<T extends { active: boolean }> {
  private pool: T[];
  private factory: () => T;
  private _available: number;

  constructor(size: number, factory: () => T) {
    this.factory = factory;
    this.pool = Array.from({ length: size }, factory);
    this._available = size;
  }

  acquire(): T | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.pool[i].active = true;
        this._available--;
        return this.pool[i];
      }
    }
    return null;
  }

  release(obj: T): void {
    obj.active = false;
    this._available++;
  }

  get availableCount(): number {
    return this._available;
  }
}

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return {
    next(): number {
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      return ((s >>> 0) / 4294967296);
    },
  };
}

function jumpArc(startY: number, targetY: number, t: number): number {
  return lerp(startY, targetY, t) - Math.sin(t * Math.PI) * JUMP_HEIGHT;
}

function rowWorldY(row: number): number {
  return ROW_0_Y - row * (PANEL_H + PANEL_GAP_Y);
}

function colWorldX(col: 0 | 1 | 2): number {
  if (col === 0) return WORLD_W / 2 - PANEL_W * 1.5 - PANEL_GAP_X; 
  if (col === 1) return WORLD_W / 2 - PANEL_W * 0.5;                
  return WORLD_W / 2 + PANEL_W * 0.5 + PANEL_GAP_X;                 
}

function rgb(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r|0},${g|0},${b|0},${a})`;
}

function generateBridge(rows: number, seed: number): Panel[][] {
  const rng = makeRng(seed);
  const panels: Panel[][] = [];

  for (let row = 1; row <= rows; row++) {
    const safeCol = Math.floor(rng.next() * 3) as 0 | 1 | 2;
    const rowPanels: Panel[] = [];

    for (let col = 0 as 0 | 1 | 2; col <= 2; col++) {
      const isSafe = col === safeCol;
      const glintBase = rng.next() * Math.PI * 2;

      rowPanels.push({
        row,
        col,
        safe: isSafe,
        state: "intact",
        crackTimer: 0,
        glintTimer: glintBase,
        glintPhase: isSafe ? 0.6 + rng.next() * 0.3 : 0.9 + rng.next() * 0.4,
        glintPhase2: 0.7 + rng.next() * 0.5,
        wobbleAmp: isSafe ? 0.8 + rng.next() * 0.4 : 1.4 + rng.next() * 0.8,
        wobblePhase: rng.next() * Math.PI * 2,
        reflectionAlpha: isSafe ? 0.18 + rng.next() * 0.08 : 0.06 + rng.next() * 0.06,
        flashAlpha: 0,
      });
    }

    panels.push(rowPanels);
  }

  return panels;
}

interface BakedAssets {
  background: HTMLCanvasElement | OffscreenCanvas;
  crackStages: Array<HTMLCanvasElement | OffscreenCanvas>;
  safeReflection: HTMLCanvasElement | OffscreenCanvas;
  fragileReflection: HTMLCanvasElement | OffscreenCanvas;
  vignetteCanvas: HTMLCanvasElement | OffscreenCanvas;
}

function createOffscreen(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function getCtx2d(c: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D {
  return c.getContext("2d") as CanvasRenderingContext2D;
}

function bakeBackground(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  const c = createOffscreen(w, h);
  const ctx = getCtx2d(c);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1a0810");
  grad.addColorStop(0.3, "#0d0406");
  grad.addColorStop(0.7, "#080204");
  grad.addColorStop(1, "#000000");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#0f0a0d";
  ctx.strokeStyle = "#1a0e14";
  ctx.lineWidth = 2;
  
  for (let i = 0; i < 6; i++) {
    const x = (w / 6) * i + 50;
    ctx.fillRect(x, 0, 40, h);
    ctx.strokeRect(x, 0, 40, h);
    
    ctx.beginPath();
    for (let y = 0; y < h; y += 150) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y + 150);
      ctx.moveTo(x + 40, y);
      ctx.lineTo(x, y + 150);
    }
    ctx.stroke();
  }

  const spotlight = ctx.createRadialGradient(w / 2, h * 0.2, 0, w / 2, h * 0.4, w * 0.9);
  spotlight.addColorStop(0, "rgba(200, 60, 120, 0.10)");
  spotlight.addColorStop(0.5, "rgba(140, 40, 80, 0.06)");
  spotlight.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, w, h);
  
  const fogGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
  fogGrad.addColorStop(0, "rgba(0,0,0,0)");
  fogGrad.addColorStop(0.6, "rgba(10,4,8,0.5)");
  fogGrad.addColorStop(1, "rgba(5,2,4,0.8)");
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, w, h);

  return c;
}

function bakeCrackStages(w: number, h: number): Array<HTMLCanvasElement | OffscreenCanvas> {
  return [0.25, 0.5, 0.75, 1.0].map((progress) => {
    const c = createOffscreen(w, h);
    const ctx = getCtx2d(c);
    const cx = w / 2;
    const cy = h / 2;
    const count = Math.ceil(6 * progress);

    ctx.strokeStyle = `rgba(255,255,255,${0.3 + progress * 0.5})`;
    ctx.lineWidth = 1 + progress * 1.5;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const len = (30 + i * 15) * progress;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();

      if (progress > 0.5) {
        const branchAngle = angle + (Math.random() - 0.5) * 0.6;
        const branchStart = len * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * branchStart, cy + Math.sin(angle) * branchStart);
        ctx.lineTo(cx + Math.cos(branchAngle) * (branchStart + len * 0.4), cy + Math.sin(branchAngle) * (branchStart + len * 0.4));
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.lineWidth = 1 + progress * 1.5;
      }
    }
    return c;
  });
}

function bakeReflection(w: number, h: number, isSafe: boolean): HTMLCanvasElement | OffscreenCanvas {
  const c = createOffscreen(w, h);
  const ctx = getCtx2d(c);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (isSafe) {
    grad.addColorStop(0, "rgba(180,220,255,0.22)");
    grad.addColorStop(0.4, "rgba(120,185,255,0.14)");
    grad.addColorStop(1, "rgba(60,120,220,0.04)");
  } else {
    grad.addColorStop(0, "rgba(140,190,160,0.12)");
    grad.addColorStop(0.4, "rgba(100,155,130,0.08)");
    grad.addColorStop(1, "rgba(50,100,80,0.02)");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function bakeVignette(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  const c = createOffscreen(w, h);
  const ctx = getCtx2d(c);
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.8);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.3)");
  grad.addColorStop(1, "rgba(8,2,4,0.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function initBakedAssets(): BakedAssets {
  return {
    background: bakeBackground(WORLD_W, WORLD_H),
    crackStages: bakeCrackStages(PANEL_W, PANEL_H),
    safeReflection: bakeReflection(PANEL_W, PANEL_H, true),
    fragileReflection: bakeReflection(PANEL_W, PANEL_H, false),
    vignetteCanvas: bakeVignette(WORLD_W, WORLD_H),
  };
}

let particlePool: ObjectPool<Particle> | null = null;

function getPool(): ObjectPool<Particle> {
  if (!particlePool) {
    particlePool = new ObjectPool<Particle>(256, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, decay: 0, r: 255, g: 255, b: 255,
      size: 4, active: false,
    }));
  }
  return particlePool;
}

interface BurstOptions {
  x: number; y: number; count: number; r: number; g: number; b: number;
  speed: number; decay: number; sizeMin?: number; sizeMax?: number; upwardBias?: number;
}

function emitBurst(gs: GameState, opts: BurstOptions): void {
  const pool = getPool();
  for (let i = 0; i < opts.count; i++) {
    if (pool.availableCount <= 0) break;
    const p = pool.acquire();
    if (!p) break;

    const angle = Math.random() * Math.PI * 2;
    const speed = opts.speed * (0.4 + Math.random() * 0.8);
    const upBias = opts.upwardBias ?? 0;

    p.x = opts.x + (Math.random() - 0.5) * 20;
    p.y = opts.y + (Math.random() - 0.5) * 10;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - upBias * speed;
    p.life = 1;
    p.decay = opts.decay * (0.7 + Math.random() * 0.6);
    p.r = opts.r;
    p.g = opts.g;
    p.b = opts.b;
    p.size = (opts.sizeMin ?? 2) + Math.random() * ((opts.sizeMax ?? 6) - (opts.sizeMin ?? 2));
    gs.particles.push(p);
  }
}

function updateParticles(gs: GameState, dtSec: number): void {
  const pool = getPool();
  let i = gs.particles.length;
  while (i--) {
    const p = gs.particles[i];
    p.vy += 400 * dtSec;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.life -= p.decay * dtSec;

    if (p.life <= 0) {
      pool.release(p);
      gs.particles[i] = gs.particles[gs.particles.length - 1];
      gs.particles.length--;
    }
  }
}

function updateCamera(gs: GameState, dtSec: number): void {
  const cam = gs.camera;
  const playerWorldY = gs.player.worldY;
  
  cam.targetY = playerWorldY - WORLD_H * 0.65;

  if (gs.player.status === "falling") {
    cam.y = cam.targetY;
  } else {
    cam.y = lerp(cam.y, cam.targetY, clamp(CAMERA_LERP * dtSec, 0, 1));
  }

  if (cam.shake > 0.01) {
    cam.shake *= cam.shakeDecay;
  } else {
    cam.shake = 0;
  }

  const progress = gs.currentRow / gs.totalRows;
  cam.targetZoom = progress > 0.7 ? 1 + (progress - 0.7) * 0.3 : 1;
  cam.zoom = lerp(cam.zoom, cam.targetZoom, dtSec * 1.5);
}

function applyShake(ctx: CanvasRenderingContext2D, cam: CameraState): void {
  if (cam.shake > 0.1) {
    const sx = (Math.random() - 0.5) * 2 * cam.shake;
    const sy = (Math.random() - 0.5) * cam.shake * 0.6;
    ctx.translate(sx, sy);
  }
}

function startJump(gs: GameState, targetCol: 0 | 1 | 2): void {
  if (gs.player.jumping || gs.player.status !== "alive") return;
  if (gs.phase !== "playing") return;

  const targetRow = gs.player.row + 1;
  if (targetRow > gs.totalRows) return;

  gs.player.jumping = true;
  gs.player.targetRow = targetRow;
  gs.player.targetCol = targetCol;
  gs.player.jumpT = 0;
  gs.player.startY = gs.player.worldY;
  gs.player.facing = targetCol === 0 ? -1 : 1;
  gs.inputConsumed = true;
}

function triggerElimination(gs: GameState): void {
  gs.phase = "falling";
  gs.elimPhase = "shatter";
  gs.elimTimer = 0;
  gs.player.status = "falling";
  gs.player.fallY = gs.player.worldY;
  gs.player.fallVy = 0;
  gs.slowMoMult = SLOW_MO_SCALE;
  gs.camera.shake = SHAKE_SHATTER;
  gs.camera.shakeDecay = SHAKE_DECAY_RATE;
  gs.vignetteTarget = 1;
  gs.flashAlpha = 1;
  gs.audioEvents.add("shatter");
}

function triggerVictory(gs: GameState): void {
  gs.phase = "victory";
  gs.player.status = "finished";
  gs.player.col = null;
  gs.audioEvents.add("victory");
}

function updatePlayer(gs: GameState, dtSec: number): void {
  const p = gs.player;

  if (p.status === "falling") {
    const scaled = dtSec;
    p.fallVy += FALL_GRAVITY * scaled;
    p.fallY += p.fallVy * scaled;
    p.worldY = p.fallY;
    return;
  }

  if (!p.jumping) {
    p.walkBob += dtSec * 3;
    return;
  }

  p.jumpT = clamp(p.jumpT + dtSec / JUMP_DURATION, 0, 1);
  const targetY = rowWorldY(p.targetRow);
  p.worldY = jumpArc(p.startY, targetY, p.jumpT);

  if (p.jumpT >= 1) {
    p.row = p.targetRow;
    p.col = p.targetCol;
    p.worldY = targetY;
    p.jumping = false;
    gs.currentRow = p.row;
    gs.inputConsumed = false;

    if (p.col !== null && !p.jumping) {
      const currentPanel = gs.panels[p.row - 1]?.[p.col];
      if (currentPanel?.safe && !gs.audioEvents.has(`land-${p.row}-${p.col}`)) {
        gs.audioEvents.add(`land-${p.row}-${p.col}`);
        SoundManager.getInstance().play("jump");
      } else if (currentPanel && !currentPanel.safe && !gs.audioEvents.has(`tension-${p.row}`)) {
        gs.audioEvents.add(`tension-${p.row}`);
      }
    }

    if (p.row > gs.totalRows) {
      triggerVictory(gs);
      return;
    }

    const safeColIndex = p.col !== null ? p.col : 0;
    const panel = gs.panels[p.row - 1]?.[safeColIndex];
    if (!panel) {
      triggerElimination(gs);
      return;
    }

    if (!panel.safe) {
      triggerElimination(gs);
      const px = colWorldX(p.col) + PANEL_W / 2;
      const py = rowWorldY(p.row) + PANEL_H / 2;
      emitBurst(gs, { x: px, y: py, count: 32, r: 140, g: 200, b: 255, speed: 320, decay: 1.8, sizeMin: 2, sizeMax: 8, upwardBias: 0.4 });
      emitBurst(gs, { x: px, y: py, count: 18, r: 80, g: 140, b: 200, speed: 160, decay: 2.4, sizeMin: 1, sizeMax: 4 });
      panel.state = "shattered";
    } else {
      panel.state = "cracking";
      panel.crackTimer = 0;
      const px = colWorldX(p.col) + PANEL_W / 2;
      const py = rowWorldY(p.row) + PANEL_H / 2;
      emitBurst(gs, { x: px, y: py, count: 6, r: 160, g: 210, b: 255, speed: 80, decay: 3, sizeMin: 1, sizeMax: 3, upwardBias: 0.2 });
      if (p.row >= gs.totalRows) {
        triggerVictory(gs);
      }
    }
  }
}

function updatePanels(gs: GameState, dtSec: number): void {
  const rowMin = Math.max(0, gs.currentRow - 1);
  const rowMax = Math.min(gs.totalRows - 1, gs.currentRow + 3);

  for (let r = rowMin; r <= rowMax; r++) {
    const row = gs.panels[r];
    if (!row) continue;
    for (let c = 0; c <= 2; c++) {
      const panel = row[c];
      panel.glintTimer += dtSec * panel.glintPhase;
      panel.flashAlpha = Math.max(0, panel.flashAlpha - dtSec * 3);

      if (panel.state === "cracking") {
        panel.crackTimer += dtSec * 4;
        if (panel.crackTimer > 1) {
          panel.state = "intact";
          panel.crackTimer = 0;
        }
      }
    }
  }
}

function updateElimination(gs: GameState, dtSec: number): void {
  gs.elimTimer += dtSec;
  gs.flashAlpha = Math.max(0, gs.flashAlpha - dtSec * 4);

  switch (gs.elimPhase) {
    case "shatter":
      if (gs.elimTimer >= 0.2) {
        gs.elimPhase = "slow_fall";
        gs.elimTimer = 0;
      }
      break;
    case "slow_fall":
      if (gs.elimTimer >= SLOW_MO_RESTORE_DELAY) {
        gs.elimPhase = "showing";
        gs.elimTimer = 0;
        gs.slowMoMult = 1;
        gs.vignetteTarget = 0.3;
      }
      break;
    case "showing":
      gs.fadeAlpha = clamp(gs.elimTimer / 0.4, 0, 1);
      if (gs.elimTimer >= 0.6) gs.phase = "gameover";
      break;
  }
}

function updateAtmosphere(gs: GameState, dtSec: number): void {
  gs.atmosphericT += dtSec * 0.4;
  gs.vignetteIntensity = lerp(gs.vignetteIntensity, gs.vignetteTarget, dtSec * 3);

  if (gs.phase === "playing" && getPool().availableCount > 10) {
    gs.ambientDripTimer -= dtSec;
    if (gs.ambientDripTimer <= 0) {
      gs.ambientDripTimer = 1.2 + Math.random() * 0.8;
      const leftEdge = colWorldX(0);
      const rightEdge = colWorldX(2) + PANEL_W;
      const rx = leftEdge + Math.random() * (rightEdge - leftEdge);
      const ry = rowWorldY(gs.currentRow) - (Math.random() * 200 + 50);
      emitBurst(gs, { x: rx, y: ry, count: 2, r: 100, g: 40, b: 80, speed: 40, decay: 1.2, sizeMin: 1, sizeMax: 2.5, upwardBias: -0.5 });
    }
  }

  if (gs.phase === "playing") {
    gs.timeLeft -= dtSec;
    if (gs.timeLeft <= 0) {
      gs.timeLeft = 0;
      if (gs.player.status === "alive") triggerElimination(gs);
    }
    if (gs.timeLeft < 20) {
      gs.vignetteTarget = Math.max(gs.vignetteTarget, 0.3 + (20 - gs.timeLeft) / 20 * 0.4);
    }
  }
}

function gameTick(gs: GameState, dtSec: number, inputRef: React.MutableRefObject<TouchState>): void {
  if (gs.phase === "gameover" || gs.phase === "victory" || gs.phase === "intro") return;

  const scaled = dtSec * gs.slowMoMult;

  if (!gs.inputConsumed && !gs.player.jumping && gs.player.status === "alive") {
    if (inputRef.current.left) startJump(gs, 0);
    else if (inputRef.current.center) startJump(gs, 1);
    else if (inputRef.current.right) startJump(gs, 2);
  }

  inputRef.current.left = false;
  inputRef.current.center = false;
  inputRef.current.right = false;

  updatePanels(gs, scaled);
  updatePlayer(gs, scaled);
  updateCamera(gs, scaled);
  updateParticles(gs, scaled);
  updateAtmosphere(gs, dtSec);

  if (gs.phase === "falling") updateElimination(gs, dtSec);
  gs.elapsed += dtSec;
}

function drawDoll(
  ctx: CanvasRenderingContext2D,
  dollX: number,
  dollY: number,
  scale: number,
  gs: GameState
): void {
  const S = 130 * scale;
  const t = gs.atmosphericT ?? performance.now() * 0.001;

  const targetCol = gs.player.col ?? gs.player.targetCol ?? 1;
  const colOffsets = [-0.32, 0, 0.32];
  const targetTilt = colOffsets[targetCol];
  
  // @ts-expect-error: WebKit prefix
  gs.__dollHeadTilt = gs.__dollHeadTilt ?? 0;
  // @ts-expect-error: WebKit prefix
  gs.__dollHeadTilt += (targetTilt - gs.__dollHeadTilt) * 0.18;
  // @ts-expect-error: WebKit prefix
  const headTilt: number = gs.__dollHeadTilt;

  const isFalling  = gs.phase === "falling";
  const isHostile  = isFalling || gs.timeLeft < 12;

  const tremor = isHostile ? (Math.sin(t * 36) * 0.4 + Math.sin(t * 17) * 0.6) : 0;

  ctx.save();
  ctx.translate(dollX + tremor, dollY);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, S * 0.85, S * 0.55, S * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  const dressGrad = ctx.createLinearGradient(0, -S * 0.2, 0, S * 0.8);
  dressGrad.addColorStop(0, "#f9a03f");
  dressGrad.addColorStop(0.55, "#e0651a");
  dressGrad.addColorStop(1, "#8a1a1f");
  ctx.fillStyle = dressGrad;
  ctx.beginPath();
  ctx.moveTo(-S * 0.42, -S * 0.10);
  ctx.lineTo(-S * 0.55,  S * 0.82);
  ctx.lineTo( S * 0.55,  S * 0.82);
  ctx.lineTo( S * 0.42, -S * 0.10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fde74c";
  ctx.fillRect(-S * 0.25, -S * 0.22, S * 0.5, S * 0.32);

  ctx.save();
  ctx.translate(0, -S * 0.38);
  ctx.rotate(headTilt);

  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.34, 0, Math.PI * 2);
  ctx.fill();

  const faceGrad = ctx.createRadialGradient(-S * 0.05, -S * 0.05, S * 0.04, 0, 0, S * 0.30);
  faceGrad.addColorStop(0, "#ffe1d4");
  faceGrad.addColorStop(1, "#d49a82");
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c8521a";
  ctx.beginPath(); ctx.arc(-S * 0.38, -S * 0.05, S * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( S * 0.38, -S * 0.05, S * 0.13, 0, Math.PI * 2); ctx.fill();

  const eyeY = -S * 0.04;
  const eyeOffX = S * 0.12;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(-eyeOffX, eyeY, S * 0.055, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( eyeOffX, eyeY, S * 0.055, 0, Math.PI * 2); ctx.fill();

  if (isHostile) {
    const pulse = 0.7 + Math.sin(t * 8) * 0.3;
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur  = 28 * pulse;
    ctx.fillStyle   = "#ff3030";
    ctx.beginPath(); ctx.arc(-eyeOffX, eyeY, S * 0.035 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( eyeOffX, eyeY, S * 0.035 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath(); ctx.arc(-eyeOffX, eyeY, S * 0.012, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( eyeOffX, eyeY, S * 0.012, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(-eyeOffX, eyeY, S * 0.028, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( eyeOffX, eyeY, S * 0.028, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore(); 

  if (isFalling) {
    const playerColIdx = gs.player.col ?? gs.player.targetCol ?? 1;
    const colDelta = (playerColIdx - 1) * 180 * scale;
    const abyssY   = 3000; 

    ctx.strokeStyle = "rgba(255,0,30,0.85)";
    ctx.lineWidth   = 5 * scale;
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur  = 22 * scale;
    ctx.beginPath();
    ctx.moveTo(-eyeOffX, -S * 0.38 + headTilt * eyeOffX);
    ctx.lineTo(colDelta, abyssY);
    ctx.moveTo( eyeOffX, -S * 0.38 + headTilt * eyeOffX);
    ctx.lineTo(colDelta, abyssY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,220,220,0.95)";
    ctx.lineWidth   = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-eyeOffX, -S * 0.38 + headTilt * eyeOffX);
    ctx.lineTo(colDelta, abyssY);
    ctx.moveTo( eyeOffX, -S * 0.38 + headTilt * eyeOffX);
    ctx.lineTo(colDelta, abyssY);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,40,40,0.9)";
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur  = 24 * scale;
    ctx.beginPath();
    ctx.arc(colDelta, 600, 9 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function renderPanel(
  ctx: CanvasRenderingContext2D,
  panel: Panel,
  camY: number,
  assets: BakedAssets,
  atmosphericT: number,
  isPlayerOn: boolean,
  quality: "high" | "low"
): void {
  const wx = colWorldX(panel.col);
  const wy = rowWorldY(panel.row) - camY;

  if (wy < -PANEL_H - 20 || wy > WORLD_H + 20) return;

  const wobble = Math.sin(atmosphericT * 1.2 + panel.wobblePhase) * panel.wobbleAmp * 0.3;
  
  const safeHoverOffset = (panel.safe && isPlayerOn) 
    ? Math.sin(atmosphericT * 2.5) * 3 
    : 0;

  ctx.save();
  ctx.translate(wx, wy + wobble + safeHoverOffset);

  switch (panel.state) {
    case "gone": ctx.restore(); return;
    case "shattered":
      ctx.fillStyle = "rgba(0,4,12,0.9)";
      ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      ctx.strokeStyle = "rgba(80,140,220,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, PANEL_W, PANEL_H);
      ctx.restore();
      return;
  }

  const [br, bg, bb] = panel.safe ? SAFE_BLUE : FRAGILE_BLUE;
  const baseAlpha = 0.20 + Math.sin(atmosphericT * 0.7 + panel.wobblePhase) * 0.06;

  ctx.fillStyle = rgb(br, bg, bb, baseAlpha);
  ctx.fillRect(0, 0, PANEL_W, PANEL_H);

  const refCanvas = panel.safe ? assets.safeReflection : assets.fragileReflection;
  ctx.globalAlpha = panel.reflectionAlpha + Math.sin(panel.glintTimer) * 0.06;
  ctx.drawImage(refCanvas as CanvasImageSource, 0, 0, PANEL_W, PANEL_H);
  ctx.globalAlpha = 1;

  const glint1 = (Math.sin(panel.glintTimer * panel.glintPhase) + 1) * 0.5;
  let glintVal: number;
  if (panel.safe) {
    glintVal = glint1 * 0.32;
  } else {
    const glint2 = (Math.sin(panel.glintTimer * panel.glintPhase2 + 1.7) + 1) * 0.5;
    glintVal = (glint1 * 0.6 + glint2 * 0.4) * 0.22;
    if (glint2 > 0.8) {
      ctx.fillStyle = `rgba(180,220,180,${(glint2 - 0.8) * 0.18})`;
      const shimX = PANEL_W * 0.3 + glint2 * PANEL_W * 0.4;
      ctx.fillRect(shimX, 0, 3, PANEL_H);
    }
  }
  ctx.fillStyle = `rgba(220,240,255,${glintVal})`;
  ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  
  if (isPlayerOn) {
    const glowPulse = 0.7 + Math.sin(atmosphericT * 3) * 0.3;
    ctx.shadowColor = `rgba(${br}, ${bg + 120}, ${bb + 120}, ${glowPulse})`;
    ctx.shadowBlur = 40;
    ctx.fillStyle = `rgba(${br + 100}, ${bg + 140}, ${bb + 120}, ${glowPulse * 0.5})`;
    ctx.fillRect(0, 0, PANEL_W, PANEL_H);
    ctx.shadowBlur = 0;
  }

  const borderAlpha = isPlayerOn ? 0.85 : 0.30 + glintVal * 0.4;
  ctx.strokeStyle = rgb(br, bg + 30, bb + 30, borderAlpha);
  ctx.lineWidth = isPlayerOn ? 3 : 1.8;
  ctx.strokeRect(0.75, 0.75, PANEL_W - 1.5, PANEL_H - 1.5);

  ctx.strokeStyle = rgb(255, 255, 255, 0.10 + glintVal * 0.18);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(3, 3, PANEL_W - 6, PANEL_H - 6);

  if (quality === "high") {
    const figureSize = 16;
    const figureX = PANEL_W / 2;
    const figureY = PANEL_H / 2;
    const figureGlow = isPlayerOn ? 0.6 : 0.15;
    
    ctx.save();
    ctx.translate(figureX, figureY);
    ctx.shadowColor = `rgba(255, 255, 255, ${figureGlow})`;
    ctx.shadowBlur = isPlayerOn ? 15 : 5;
    ctx.strokeStyle = `rgba(255, 255, 255, ${figureGlow * 1.5})`;
    ctx.lineWidth = 2.5;
    
    ctx.beginPath();
    if (panel.col === 0) {
      ctx.rect(-figureSize, -figureSize, figureSize * 2, figureSize * 2);
    } else if (panel.col === 1) {
      ctx.moveTo(0, -figureSize - 2);
      ctx.lineTo(-figureSize * 1.1, figureSize * 0.8);
      ctx.lineTo(figureSize * 1.1, figureSize * 0.8);
      ctx.closePath();
    } else {
      ctx.arc(0, 0, figureSize * 1.1, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  if (isPlayerOn && quality === "high") {
    ctx.shadowColor = rgb(br, bg, bb, 0.8);
    ctx.shadowBlur = 18;
    ctx.strokeStyle = rgb(br, bg, bb, 0.6);
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, PANEL_W, PANEL_H);
    ctx.shadowBlur = 0;
  }

  if (panel.state === "cracking" && panel.crackTimer > 0) {
    const stage = Math.min(3, Math.floor(panel.crackTimer * 4));
    const crackCanvas = assets.crackStages[stage];
    ctx.globalAlpha = panel.crackTimer;
    ctx.drawImage(crackCanvas as CanvasImageSource, 0, 0, PANEL_W, PANEL_H);
    ctx.globalAlpha = 1;
  }

  if (panel.flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${panel.flashAlpha})`;
    ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  }

  ctx.restore();
}

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  camY: number,
  atmosphericT: number
): void {
  const screenX = colWorldX(player.col ?? (player.targetCol ?? 0));
  const screenY = player.worldY - camY;

  ctx.save();
  ctx.translate(screenX + PANEL_W / 2, screenY + PANEL_H / 2);
  ctx.scale(player.facing, 1);

  const bob = player.jumping ? 0 : Math.sin(player.walkBob * 2) * 1.5;
  const py = bob;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.ellipse(0, PLAYER_H * 0.45, PLAYER_W * 0.35, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a1628";
  ctx.fillRect(-PLAYER_W / 2 + 6, py - PLAYER_H * 0.2, PLAYER_W - 12, PLAYER_H * 0.55);

  ctx.fillStyle = "#1a8a7a";
  ctx.fillRect(-PLAYER_W / 2 + 9, py - PLAYER_H * 0.15, PLAYER_W - 18, PLAYER_H * 0.45);

  ctx.fillStyle = "#0a1628";
  ctx.fillRect(-10, py - PLAYER_H * 0.02, 20, 18);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("456", 0, py + 12);

  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.ellipse(0, py - PLAYER_H * 0.32, PLAYER_W * 0.22, PLAYER_H * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const breathe = Math.sin(atmosphericT * 1.8) * 0.05;
  ctx.fillStyle = `rgba(80,200,240,${0.25 + breathe})`;
  ctx.beginPath();
  ctx.ellipse(3, py - PLAYER_H * 0.34, PLAYER_W * 0.14, PLAYER_H * 0.1, 0.2, 0, Math.PI * 2);
  ctx.fill();

  const legSwing = player.jumping ? Math.sin(player.jumpT * Math.PI) * 12 : 0;
  ctx.fillStyle = "#0a1628";
  ctx.fillRect(-PLAYER_W / 2 + 9, py + PLAYER_H * 0.32, PLAYER_W * 0.3, PLAYER_H * 0.15);
  ctx.fillRect(PLAYER_W * 0.04, py + PLAYER_H * 0.32 + legSwing, PLAYER_W * 0.3, PLAYER_H * 0.15);

  ctx.restore();
}

function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[], camY: number): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const p of particles) {
    if (!p.active) continue;
    const alpha = p.life * p.life;
    ctx.fillStyle = rgb(p.r, p.g, p.b, alpha);
    ctx.fillRect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
  }
  ctx.restore();
}

function renderTutorialHint(ctx: CanvasRenderingContext2D, gs: GameState): void {
  if (gs.currentRow === 0 && gs.elapsed < 5) {
    const alpha = clamp(1 - (gs.elapsed - 3) / 2, 0, 1);
    ctx.fillStyle = `rgba(180,220,255,${alpha * 0.8})`;
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("← LEFT / ↑ CENTER / RIGHT →", WORLD_W / 2, WORLD_H - 80);
  }
}

function renderOverlays(ctx: CanvasRenderingContext2D, gs: GameState, assets: BakedAssets): void {
  if (gs.vignetteIntensity > 0.01) {
    ctx.globalAlpha = gs.vignetteIntensity;
    ctx.drawImage(assets.vignetteCanvas as CanvasImageSource, 0, 0, WORLD_W, WORLD_H);
    ctx.globalAlpha = 1;
  }
  if (gs.flashAlpha > 0) {
    ctx.fillStyle = `rgba(180,230,255,${gs.flashAlpha * 0.6})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  if (gs.fadeAlpha > 0) {
    ctx.fillStyle = `rgba(0,2,8,${gs.fadeAlpha})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  const breatheA = (Math.sin(gs.atmosphericT * 0.6) + 1) * 0.5 * 0.025;
  ctx.fillStyle = `rgba(10,30,70,${breatheA})`;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function renderFrame(ctx: CanvasRenderingContext2D, gs: GameState, assets: BakedAssets, quality: "high" | "low"): void {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.drawImage(assets.background as CanvasImageSource, 0, 0, WORLD_W, WORLD_H);

  const cam = gs.camera;
  const camY = cam.y;

  ctx.save();
  if (cam.zoom !== 1) {
    ctx.translate(WORLD_W / 2, WORLD_H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-WORLD_W / 2, -WORLD_H / 2);
  }
  applyShake(ctx, cam);

  const startPlatformY = rowWorldY(0) - camY;
  const endPlatformY = rowWorldY(gs.totalRows + 1) - camY;

  drawDoll(ctx, WORLD_W / 2, endPlatformY - 20, 1.3, gs);

  const platformW = 560;
  ctx.fillStyle = "rgba(20,50,100,0.6)";
  ctx.fillRect(WORLD_W / 2 - platformW / 2, startPlatformY, platformW, 30);
  ctx.strokeStyle = "rgba(80,140,220,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(WORLD_W / 2 - platformW / 2, startPlatformY, platformW, 30);

  ctx.fillStyle = "rgba(20,80,60,0.6)";
  ctx.fillRect(WORLD_W / 2 - platformW / 2, endPlatformY, platformW, 30);
  ctx.strokeStyle = "rgba(80,200,140,0.4)";
  ctx.strokeRect(WORLD_W / 2 - platformW / 2, endPlatformY, platformW, 30);

  ctx.strokeStyle = "rgba(60,90,140,0.25)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 16]);
  ctx.beginPath();
  ctx.moveTo(colWorldX(0) + PANEL_W / 2, endPlatformY);
  ctx.lineTo(colWorldX(0) + PANEL_W / 2, startPlatformY + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(colWorldX(1) + PANEL_W / 2, endPlatformY);
  ctx.lineTo(colWorldX(1) + PANEL_W / 2, startPlatformY + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(colWorldX(2) + PANEL_W / 2, endPlatformY);
  ctx.lineTo(colWorldX(2) + PANEL_W / 2, startPlatformY + 30);
  ctx.stroke();
  ctx.setLineDash([]);

  const rowMin = Math.max(1, gs.currentRow - 1);
  const rowMax = Math.min(gs.totalRows, gs.currentRow + 5);

  for (let r = rowMin; r <= rowMax; r++) {
    const rowPanels = gs.panels[r - 1];
    if (!rowPanels) continue;
    for (const panel of rowPanels) {
      const isPlayerOn = gs.player.row === r && gs.player.col === panel.col && !gs.player.jumping;
      renderPanel(ctx, panel, camY, assets, gs.atmosphericT, isPlayerOn, quality);
    }
  }

  if (gs.player.status !== "finished") renderPlayer(ctx, gs.player, camY, gs.atmosphericT);
  renderParticles(ctx, gs.particles, camY);
  ctx.restore(); 

  if (gs.phase === "playing" || gs.phase === "falling") renderTutorialHint(ctx, gs);
  renderOverlays(ctx, gs, assets);
}

interface TouchState {
  left: boolean;
  center: boolean;
  right: boolean;
}

function createGameState(seed: number): GameState {
  const startY = rowWorldY(0);
  return {
    phase: "playing", elimPhase: "none", elimTimer: 0,
    panels: generateBridge(TOTAL_ROWS, seed),
    currentRow: 0, totalRows: TOTAL_ROWS,
    player: {
      row: 0, col: null, worldY: startY, jumpT: 0, jumping: false, targetRow: 1, targetCol: 1,
      startY, facing: 1, status: "alive", fallY: 0, fallVy: 0, screenShakeX: 0, screenShakeY: 0, walkBob: 0, walkBobDir: 1,
    },
    camera: { y: startY - WORLD_H * 0.5, targetY: startY - WORLD_H * 0.5, shake: 0, shakeTimer: 0, shakeDecay: SHAKE_DECAY_RATE, zoom: 1, targetZoom: 1 },
    timeLeft: COUNTDOWN_TOTAL, elapsed: 0, slowMoMult: 1, particles: [], audioEvents: new Set(),
    atmosphericT: 0, vignetteIntensity: 0.15, vignetteTarget: 0.15, flashAlpha: 0, fadeAlpha: 0, inputConsumed: false, seed, ambientDripTimer: 1, lateGameZoomActive: false,
  };
}

function useGameLoop(callback: (dt: number) => void, active: boolean): React.MutableRefObject<((scale: number) => void) | null> {
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const scaleValRef = useRef(1);

  const scaleRef = useRef<((s: number) => void)>((s: number) => { scaleValRef.current = s; });

  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active) return;
    function frame(now: number) {
      const raw = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;
      if (callbackRef.current) callbackRef.current(raw * scaleValRef.current);
      rafRef.current = requestAnimationFrame(frame);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  
  return scaleRef as unknown as React.MutableRefObject<((scale: number) => void) | null>;
}

interface MobileTouchControlsProps {
  visible: boolean;
  inputRef: React.MutableRefObject<TouchState>;
}

const MobileTouchControls: React.FC<MobileTouchControlsProps> = ({ visible, inputRef }) => {
  const leftRef = useRef<HTMLButtonElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);
  const rightRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const left = leftRef.current;
    const center = centerRef.current;
    const right = rightRef.current;
    if (!left || !center || !right) return;
    
    const onLeftDown = (e: Event) => { e.preventDefault(); inputRef.current.left = true; };
    const onCenterDown = (e: Event) => { e.preventDefault(); inputRef.current.center = true; };
    const onRightDown = (e: Event) => { e.preventDefault(); inputRef.current.right = true; };
    
    const onLeftUp = (e: Event) => { e.preventDefault(); inputRef.current.left = false; };
    const onCenterUp = (e: Event) => { e.preventDefault(); inputRef.current.center = false; };
    const onRightUp = (e: Event) => { e.preventDefault(); inputRef.current.right = false; };
    
    left.addEventListener("touchstart", onLeftDown, { passive: false });
    center.addEventListener("touchstart", onCenterDown, { passive: false });
    right.addEventListener("touchstart", onRightDown, { passive: false });
    
    left.addEventListener("touchend", onLeftUp, { passive: false });
    left.addEventListener("touchcancel", onLeftUp, { passive: false });
    center.addEventListener("touchend", onCenterUp, { passive: false });
    center.addEventListener("touchcancel", onCenterUp, { passive: false });
    right.addEventListener("touchend", onRightUp, { passive: false });
    right.addEventListener("touchcancel", onRightUp, { passive: false });
    
    return () => {
      left.removeEventListener("touchstart", onLeftDown);
      center.removeEventListener("touchstart", onCenterDown);
      right.removeEventListener("touchstart", onRightDown);
      left.removeEventListener("touchend", onLeftUp);
      left.removeEventListener("touchcancel", onLeftUp);
      center.removeEventListener("touchend", onCenterUp);
      center.removeEventListener("touchcancel", onCenterUp);
      right.removeEventListener("touchend", onRightUp);
      right.removeEventListener("touchcancel", onRightUp);
    };
  }, [inputRef]);

  if (!visible) return null;
  const btnBase: React.CSSProperties = {
    position: "absolute", bottom: 32, width: 80, height: 80, borderRadius: 12,
    background: "rgba(20,60,120,0.55)", border: "1.5px solid rgba(80,160,255,0.4)",
    color: "rgba(160,210,255,0.9)", fontSize: 24, fontFamily: "monospace", display: "flex",
    alignItems: "center", justifyContent: "center", cursor: "pointer",
    userSelect: "none", WebkitUserSelect: "none", touchAction: "none", backdropFilter: "blur(4px)", zIndex: 100
  };

  return (
    <>
      <button ref={leftRef} style={{ ...btnBase, left: 16 }} aria-label="Left panel">←</button>
      <button ref={centerRef} style={{ ...btnBase, left: "50%", transform: "translateX(-50%)" }} aria-label="Center panel">↑</button>
      <button ref={rightRef} style={{ ...btnBase, right: 16 }} aria-label="Right panel">→</button>
    </>
  );
};

const IntroScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,4,14,0.92)", zIndex: 10 }}>
    <div style={{ fontFamily: "'Courier New', monospace", color: "rgba(140,200,255,0.95)", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: "bold", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8, textShadow: "0 0 40px rgba(80,160,255,0.6)" }}>
      Glass Bridge
    </div>
    <div style={{ fontFamily: "'Courier New', monospace", color: "rgba(100,150,200,0.7)", fontSize: 14, letterSpacing: "0.2em", marginBottom: 48 }}>
      ONE WRONG STEP. ONE CHANCE.
    </div>
    <div style={{ fontFamily: "'Courier New', monospace", color: "rgba(120,180,240,0.6)", fontSize: 13, marginBottom: 40, textAlign: "center", lineHeight: 2, maxWidth: 320 }}>
      {`← / ↑ / → ARROW KEYS or TOUCH BUTTONS\n\nChoose your path across the 3 lanes.\nOnly one is tempered glass.`}
    </div>
    <button onClick={onStart} style={{ fontFamily: "'Courier New', monospace", fontSize: 16, letterSpacing: "0.25em", color: "#0a1628", background: "rgba(80,180,255,0.9)", border: "none", padding: "16px 48px", borderRadius: 4, cursor: "pointer", fontWeight: "bold", textTransform: "uppercase" }}>
      Begin
    </button>
  </div>
);

const GlassBridge: React.FC<GameProps> = ({ onExit, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const assetsRef = useRef<BakedAssets | null>(null);
  const inputRef = useRef<TouchState>({ left: false, center: false, right: false });
  const containerRef = useRef<HTMLDivElement>(null);

  const [uiPhase, setUiPhase] = useState<"intro" | "playing" | "gameover" | "victory">("intro");
  const [finalRow, setFinalRow] = useState(0);
  
  const [finalScore, setFinalScore] = useState(0);
  const addScore = useGameStore((s) => s.addScore);
  const scoreRecorded = useRef(false);

  const uiPhaseRef = useRef(uiPhase);
  useEffect(() => {
    uiPhaseRef.current = uiPhase;
  }, [uiPhase]);

  useEffect(() => {
    return () => {
      if (particlePool) {
        const pool = particlePool as any;
        if (pool.pool) {
          for (let i = 0; i < pool.pool.length; i++) {
            const p = pool.pool[i];
            if (p && p.active) pool.release(p);
          }
        }
        particlePool = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      SoundManager.getInstance().stopAll(0);
      SoundManager.getInstance().stopAllLoops(0);
    };
  }, []);

  useGameShellBridge({
    uiPhase,
    sourceGame: "glass-bridge",
    progressMarker: finalRow,
    progressTotal: TOTAL_ROWS,
    outcome: uiPhase === "victory" ? "victory" : "eliminated"
  });

  const hudSync = useHUDSync({ flushInterval: 100 });
  const isTouchDevice =
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      /android|iphone|ipad|ipod/i.test(navigator.userAgent));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio ?? 1, 2) : 1;

    const resize = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      canvas.width  = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width  = cw + "px";
      canvas.style.height = ch + "px";

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sx = (cw * dpr) / WORLD_W;
      const sy = (ch * dpr) / WORLD_H;
      const s  = Math.max(sx, sy);
      ctx.setTransform(s, 0, 0, s, ((cw * dpr) - WORLD_W * s) / 2, ((ch * dpr) - WORLD_H * s) / 2);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        if (!e.repeat) inputRef.current.left = true;
      }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        if (!e.repeat) inputRef.current.center = true;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        if (!e.repeat) inputRef.current.right = true;
      }
      if (e.key === "Escape" && onExit) {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const startGame = useCallback(() => {
    const seed = Date.now() ^ (Math.random() * 0xffffffff);
    gsRef.current = createGameState(seed >>> 0);
    if (!assetsRef.current) {
      assetsRef.current = initBakedAssets();
    }
    scoreRecorded.current = false;
    setUiPhase("playing");
  }, []);

  const restartGame = useCallback(() => {
    startGame();
  }, [startGame]);

  const tick = useCallback((dt: number) => {
    const gs = gsRef.current;
    const assets = assetsRef.current;
    const canvas = canvasRef.current;
    if (!gs || !assets || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    gameTick(gs, dt, inputRef);

    if (gs.audioEvents.size > 0) {
      const sm = SoundManager.getInstance();
      for (const ev of gs.audioEvents) {
        if (ev.startsWith("land-")) {
        } else if (ev.startsWith("tension-")) {
        } else {
          switch (ev) {
            case "shatter":
              sm.play("shatter", 0);
              break;
            case "victory":
              sm.play("victory", 0);
              break;
          }
        }
      }
      gs.audioEvents.clear();
    }

    const playerAlive = gs.player.status === "alive";
    hudSync.write({
      score:     gs.currentRow * 100,
      lives:     playerAlive ? 1 : 0,
      time:      Math.ceil(Math.max(0, gs.timeLeft)),
      health:    playerAlive ? 100 : 0,
      maxHealth: 100,
      level:     gs.currentRow + 1,
    });
    
    hudSync.tick(performance.now());   

    if (gs.phase === "gameover" && uiPhaseRef.current === "playing") {
      hudSync.write({ health: 0, lives: 0 });
      hudSync.forceFlush();
      setFinalRow(gs.currentRow);
      const score = gs.currentRow * 100;
      if (!scoreRecorded.current) {
          addScore(score);
          setFinalScore(score);
          scoreRecorded.current = true;
          if (onComplete) onComplete(score, "eliminated");
      }
      setUiPhase("gameover");
    }

    if (gs.phase === "victory" && uiPhaseRef.current === "playing") {
      const timeBonus = Math.floor((gs.timeLeft / COUNTDOWN_TOTAL) * 500);
      const score = (TOTAL_ROWS * 100) + timeBonus;
      if (!scoreRecorded.current) {
          addScore(score);
          setFinalScore(score);
          scoreRecorded.current = true;
          if (onComplete) onComplete(score, "victory");
      }
      setUiPhase("victory");
    }

    const quality: "high" | "low" = "high";
    renderFrame(ctx, gs, assets, quality);
  }, [hudSync, addScore, onComplete]);

  useGameLoop(tick, uiPhase === "playing");

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 400,
        background: "radial-gradient(ellipse at bottom, #040308 0%, #000000 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: "'Courier New', monospace",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          position: "absolute",
          inset: 0,
          width:  "100%",
          height: "100%",
          background: "#000",
        }}
      />

      {onExit && (
        <button
          onClick={onExit}
          style={{
            position: "absolute", top: 16, left: 16, zIndex: 250, padding: "10px 18px",
            background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 4, color: "#fff", fontFamily: "monospace", fontSize: 12,
            letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer",
            backdropFilter: "blur(6px)",
          }}
        >
          ← MENU (ESC)
        </button>
      )}

      {uiPhase === "intro" && <IntroScreen onStart={startGame} />}

      {(uiPhase === "gameover" || uiPhase === "victory") && (
        <ResultScreen 
          outcome={uiPhase === "victory" ? "victory" : "eliminated"} 
          statLine={uiPhase === "victory" ? `SCORE: ${finalScore.toLocaleString()}` : `SCORE: ${finalScore.toLocaleString()} (PANEL ${finalRow})`} 
          prize={uiPhase === "victory" ? 45600000000 : undefined}
          onTryAgain={restartGame} 
          onMenu={onExit ?? (() => {})} 
        />
      )}

      {uiPhase === "playing" && (
        <MobileTouchControls visible={isTouchDevice} inputRef={inputRef} />
      )}
    </div>
  );
};

export default GlassBridge;