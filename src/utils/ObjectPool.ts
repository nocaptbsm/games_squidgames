/**
 * ObjectPool.ts
 *
 * Generic object pool to eliminate GC pressure from frequent alloc/dealloc
 * of particles, projectiles, and transient game objects.
 *
 * WHY: Every `new` call during a rAF loop adds to GC pressure. On mobile,
 * a single GC pause of 16ms doubles your frame time and causes a visible
 * jank spike. Pooling keeps object count stable and GC silent.
 *
 * Usage:
 *   const pool = new ObjectPool(() => createParticle(), resetParticle, 256);
 *   const p = pool.acquire();
 *   // ... use p ...
 *   pool.release(p);
 */

export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize = 256) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    // Pre-warm — allocate all objects up front so no mid-game alloc
    for (let i = 0; i < maxSize; i++) {
      this.available.push(factory());
    }
  }

  acquire(): T | null {
    if (this.available.length === 0) {
      // Pool exhausted — soft fail rather than allocating unboundedly
      if (process.env.NODE_ENV === "development") {
        console.warn(`[ObjectPool] Pool exhausted (max ${this.maxSize})`);
      }
      return null;
    }
    const obj = this.available.pop()!;
    this.inUse.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUse.has(obj)) return; // Guard double-release
    this.reset(obj);
    this.inUse.delete(obj);
    this.available.push(obj);
  }

  releaseAll(): void {
    for (const obj of this.inUse) {
      this.reset(obj);
      this.available.push(obj);
    }
    this.inUse.clear();
  }

  get activeCount(): number {
    return this.inUse.size;
  }

  get availableCount(): number {
    return this.available.length;
  }
}

// ─── Particle definition ─────────────────────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;       // 0-1 (1 = fresh, 0 = dead)
  decay: number;      // life subtracted per second
  size: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  active: boolean;
}

function createParticle(): Particle {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    life: 0, decay: 1, size: 4,
    r: 255, g: 255, b: 255, alpha: 1,
    active: false,
  };
}

function resetParticle(p: Particle): void {
  p.active = false;
  p.life = 0;
  p.vx = 0;
  p.vy = 0;
}

// Singleton particle pool — 256 particles covers all burst effects
export const particlePool = new ObjectPool<Particle>(
  createParticle,
  resetParticle,
  256
);

// ─── Burst emitter helper ─────────────────────────────────────────────────────

interface BurstOptions {
  x: number;
  y: number;
  count: number;
  r: number;
  g: number;
  b: number;
  speed?: number;
  decay?: number;
  size?: number;
  /** 0-1 multiplier applied from quality tier */
  qualityMultiplier?: number;
}

/**
 * Emit a radial burst of particles from the pool.
 * Returns array of acquired particles (caller doesn't need to track them;
 * the update loop handles release when life <= 0).
 */
export function emitBurst(options: BurstOptions): Particle[] {
  const {
    x, y, r, g, b,
    count,
    speed = 3,
    decay = 1.5,
    size = 4,
    qualityMultiplier = 1,
  } = options;

  const actualCount = Math.floor(count * qualityMultiplier);
  const acquired: Particle[] = [];

  for (let i = 0; i < actualCount; i++) {
    const p = particlePool.acquire();
    if (!p) break;

    const angle = (Math.PI * 2 * i) / actualCount + Math.random() * 0.4;
    const spd = speed * (0.5 + Math.random() * 0.5);

    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * spd;
    p.vy = Math.sin(angle) * spd - Math.random() * 2; // slight upward bias
    p.life = 1;
    p.decay = decay * (0.8 + Math.random() * 0.4);
    p.size = size * (0.5 + Math.random() * 0.5);
    p.r = r;
    p.g = g;
    p.b = b;
    p.alpha = 1;
    p.active = true;

    acquired.push(p);
  }

  return acquired;
}

// ─── Particle batch renderer ──────────────────────────────────────────────────
// Call once per frame inside your renderFrame() — NOT in React render.

export function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dtSec: number,
  gravity = 0.15
): void {
  // Single save/restore wraps all particles — cheaper than per-particle save
  ctx.save();

  const toRelease: Particle[] = [];

  for (const p of particles) {
    if (!p.active) continue;

    p.life -= p.decay * dtSec;
    if (p.life <= 0) {
      p.active = false;
      toRelease.push(p);
      continue;
    }

    p.vx *= 0.97;
    p.vy += gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.alpha = p.life;

    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Return dead particles to pool after iteration (no mutation during loop)
  for (const p of toRelease) {
    particlePool.release(p);
  }
}