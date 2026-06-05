/**
 * src/lib/inputManager.ts
 *
 * UNIFIED INPUT MANAGER — Phase 1
 *
 * Abstracts mouse, touch, and keyboard events into a single `UnifiedInput`
 * snapshot that any game can read each frame without touching the DOM.
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. Framework-agnostic — zero React imports. Instantiate once, attach to
 * window/canvas, read from anywhere (game loops, Zustand subscribers,
 * audio engine callbacks).
 *
 * 2. Stability metric — a rolling variance of pointer-delta magnitudes over
 * a configurable time window (default 300 ms). Outputs a 0–1 scalar:
 * 1.0 = perfectly still / rock-steady
 * 0.0 = maximum detected jitter / tremor
 * DalgonaCandy uses this to scale fracture risk. RLGL uses it to detect
 * illegal movement during Red Light. GlassBridge ignores it (discrete
 * input only).
 *
 * 3. Zero-allocation hot path — the rolling sample buffer is pre-allocated
 * as a fixed-length Float32Array. No GC pressure during gameplay.
 *
 * 4. Pointer Events API first — falls back to legacy mouse/touch events only
 * when Pointer Events are unavailable (very old iOS Safari).
 *
 * 5. Multi-touch aware — tracks up to MAX_TOUCHES simultaneous contacts.
 * The primary pointer (first finger / mouse) drives `UnifiedInput`.
 * Secondary touches are available via `getTouches()` for games that
 * need raw multi-touch (pinch-zoom, two-button layouts, etc.).
 *
 * 6. Discrete left/right intents — latched on press, consumed by calling
 * `consumeIntent()`. This prevents the same keypress from triggering
 * two jumps if the game loop runs twice before the key-up fires.
 *
 * USAGE:
 *
 * // Instantiate once (e.g. in GameShell.tsx)
 * const input = new InputManager({ stabilityWindowMs: 300 });
 * input.attach(canvasElement);
 *
 * // In game loop:
 * const snap = input.snapshot();
 * if (snap.left) { ... }
 * input.consumeIntent("left");
 *
 * // Cleanup on unmount:
 * input.detach();
 *
 * SINGLETON EXPORT:
 * For convenience a singleton `inputManager` is exported. GameShell calls
 * attach() on mount and detach() on unmount. Games import the singleton
 * and call snapshot() — no prop drilling needed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of all input state.
 * Read this once per game-tick; do not hold a reference between frames
 * because the manager mutates its internal state in place.
 */
export interface UnifiedInput {
  // ── Pointer position ───────────────────────────────────────────────────────
  /** X in logical canvas pixels (already divided by the CSS scale factor) */
  x: number;
  /** Y in logical canvas pixels */
  y: number;
  /** X normalized to [0, 1] relative to the attached element's width */
  nx: number;
  /** Y normalized to [0, 1] relative to the attached element's height */
  ny: number;

  // ── Button / touch state ───────────────────────────────────────────────────
  /** True while the primary pointer is pressed / finger is down */
  isDown: boolean;
  /** True on the exact frame the pointer was pressed (single-frame) */
  justPressed: boolean;
  /** True on the exact frame the pointer was released (single-frame) */
  justReleased: boolean;

  // ── Discrete directional intents (latched until consumed) ─────────────────
  /**
   * Left intent — true when ArrowLeft / A / left-side tap is detected.
   * Stays true until consumeIntent("left") is called.
   */
  left: boolean;
  /**
   * Right intent — true when ArrowRight / D / right-side tap is detected.
   * Stays true until consumeIntent("right") is called.
   */
  right: boolean;
  /**
   * Up intent — ArrowUp / W / swipe-up.
   * Available for games that need vertical discrete input.
   */
  up: boolean;
  /**
   * Down intent — ArrowDown / S / swipe-down.
   */
  down: boolean;
  /**
   * Action intent — Space / Enter / tap center.
   * Generic confirm / jump / cut button.
   */
  action: boolean;

  // ── Movement delta ─────────────────────────────────────────────────────────
  /** Raw pointer movement since the last frame, in logical canvas pixels */
  dx: number;
  dy: number;
  /** Euclidean magnitude of (dx, dy) */
  deltaMagnitude: number;

  // ── Stability metric ───────────────────────────────────────────────────────
  /**
   * Rolling stability score over the configured time window.
   *
   * Derivation:
   * 1. Every pointermove event appends |Δ| (delta magnitude) to a circular
   * sample buffer together with the event timestamp.
   * 2. Samples older than `stabilityWindowMs` are expired.
   * 3. Variance of the remaining magnitudes is computed.
   * 4. Variance is mapped through a sigmoid-like curve and inverted:
   * stability = 1 / (1 + variance / VARIANCE_SCALE)
   * so high variance → low stability, steady hand → stability ≈ 1.
   *
   * Range: [0, 1]
   * 1.0 — no movement detected in the window (or perfectly uniform motion)
   * 0.0 — extreme jitter / rapid chaotic movement
   *
   * DalgonaCandy usage:
   * fractureRisk += (1 - stability) * JITTER_FRACTURE_COEFFICIENT * dt
   */
  stability: number;

  // ── Touch pressure ────────────────────────────────────────────────────────
  /**
   * Pressure from the Pointer Events API (0–1).
   * Mouse events always report 0.5. Falls back to 1.0 if unavailable.
   * DalgonaCandy: heavy pressure increases edge stress on the candy.
   */
  pressure: number;

  // ── Keyboard ──────────────────────────────────────────────────────────────
  /** Set of currently held keys (KeyboardEvent.code values) */
  heldKeys: ReadonlySet<string>;

  // ── Metadata ──────────────────────────────────────────────────────────────
  /** performance.now() of the most recent input event that mutated state */
  timestamp: number;
  /** True if the last input came from a touch screen (not mouse/keyboard) */
  isTouchSource: boolean;
}

/** Which discrete intent to consume after reading it */
export type IntentKey = "left" | "right" | "up" | "down" | "action";

/** Active touch contact exposed by getTouches() */
export interface TouchContact {
  pointerId: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  pressure: number;
}

export interface InputManagerOptions {
  /**
   * Rolling window for stability calculation in milliseconds.
   * Longer → smoother but more latent stability reading.
   * Default: 300
   */
  stabilityWindowMs?: number;
  /**
   * Controls how aggressively variance maps to low stability.
   * Higher → gentler curve (small jitter doesn't tank stability).
   * Tune per-game; DalgonaCandy uses a low value for sensitivity.
   * Default: 120
   */
  varianceScale?: number;
  /**
   * Maximum number of simultaneous touch contacts tracked.
   * Default: 4
   */
  maxTouches?: number;
  /**
   * Logical world width. Used to normalize pointer X and to classify
   * left/right-side taps. Must match the game's WORLD_W constant.
   * Default: 1280
   */
  worldW?: number;
  /**
   * Logical world height.
   * Default: 720
   */
  worldH?: number;
  /**
   * CSS scale factor applied to the canvas by GameShell's ResizeObserver.
   * Pointer coords are divided by this to convert from CSS px → world px.
   * You can update this at runtime via setScale() as the window resizes.
   * Default: 1
   */
  initialScale?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — INTERNAL CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-allocated sample buffer size. At 60fps over 300ms = ~18 samples max. */
const SAMPLE_BUFFER_SIZE = 64;

/**
 * Swipe recognition: minimum pointer travel distance (logical px) to register
 * as a directional intent on touch devices.
 */
const SWIPE_THRESHOLD_PX = 30;

/**
 * Left-side tap zone boundary — taps with nx < this are "left" intents.
 * Right-side is implicitly nx >= LEFT_ZONE_BOUNDARY.
 */
const LEFT_ZONE_BOUNDARY = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — STABILITY RING BUFFER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-allocated circular buffer for stability samples.
 * Avoids any heap allocation in the hot path.
 */
class StabilityBuffer {
  private magnitudes: Float32Array;
  private timestamps: Float64Array;
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.magnitudes = new Float32Array(capacity);
    this.timestamps = new Float64Array(capacity);
  }

  push(magnitude: number, ts: number): void {
    this.magnitudes[this.head] = magnitude;
    this.timestamps[this.head] = ts;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * Compute variance of magnitudes for samples within [now - windowMs, now].
   * Expired samples are skipped without mutation (lazy expiry).
   * Returns 0 if fewer than 2 live samples exist.
   */
  variance(now: number, windowMs: number): number {
    if (this.count === 0) return 0;

    const cutoff = now - windowMs;
    let sum = 0;
    let n = 0;

    // Two-pass: first compute mean of live samples
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.timestamps[idx] < cutoff) continue;
      sum += this.magnitudes[idx];
      n++;
    }

    if (n < 2) return 0;
    const mean = sum / n;

    // Second pass: compute variance
    let sumSq = 0;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.timestamps[idx] < cutoff) continue;
      const diff = this.magnitudes[idx] - mean;
      sumSq += diff * diff;
    }

    return sumSq / n;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    // No need to zero the typed arrays — count guards access
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — INPUT MANAGER CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class InputManager {
  // ── Config ────────────────────────────────────────────────────────────────
  private readonly stabilityWindowMs: number;
  private readonly varianceScale: number;
  private readonly maxTouches: number;
  private worldW: number;
  private worldH: number;
  private scale: number;

  // ── DOM attachment ────────────────────────────────────────────────────────
  private target: HTMLElement | Window | null = null;
  private usePointerEvents = false;

  // ── Pointer state ──────────────────────────────────────────────────────────
  private _x = 0;
  private _y = 0;
  private _prevX = 0;
  private _prevY = 0;
  private _isDown = false;
  private _justPressed = false;
  private _justReleased = false;
  private _pressure = 1;
  private _isTouchSource = false;
  private _timestamp = 0;

  // Touch tracking (up to maxTouches simultaneous contacts)
  private touches = new Map<number, TouchContact>();

  // Swipe gesture tracking
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeActive = false;

  // ── Discrete intents (latched) ─────────────────────────────────────────────
  private _left = false;
  private _right = false;
  private _up = false;
  private _down = false;
  private _action = false;

  // ── Keyboard ──────────────────────────────────────────────────────────────
  private _heldKeys = new Set<string>();

  // ── Stability ─────────────────────────────────────────────────────────────
  private stabilityBuffer: StabilityBuffer;
  private _stability = 1;

  // ── Bound handler references (for clean removeEventListener) ──────────────
  private readonly _onPointerDown: (e: PointerEvent) => void;
  private readonly _onPointerMove: (e: PointerEvent) => void;
  private readonly _onPointerUp: (e: PointerEvent) => void;
  private readonly _onPointerCancel: (e: PointerEvent) => void;
  private readonly _onMouseDown: (e: MouseEvent) => void;
  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onMouseUp: (e: MouseEvent) => void;
  private readonly _onTouchStart: (e: TouchEvent) => void;
  private readonly _onTouchMove: (e: TouchEvent) => void;
  private readonly _onTouchEnd: (e: TouchEvent) => void;
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;

  // ── Frame-boundary bookkeeping ────────────────────────────────────────────
  /**
   * Call endFrame() at the END of each game tick to clear single-frame flags.
   * GameShell calls this automatically when wrapping a game loop; standalone
   * games can call it manually.
   */
  private _frameCleared = false;

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR
  // ─────────────────────────────────────────────────────────────────────────

  constructor(opts: InputManagerOptions = {}) {
    this.stabilityWindowMs = opts.stabilityWindowMs ?? 300;
    this.varianceScale = opts.varianceScale ?? 120;
    this.maxTouches = opts.maxTouches ?? 4;
    this.worldW = opts.worldW ?? 1280;
    this.worldH = opts.worldH ?? 720;
    this.scale = opts.initialScale ?? 1;

    this.stabilityBuffer = new StabilityBuffer(SAMPLE_BUFFER_SIZE);

    // Bind all handlers once so we can removeEventListener cleanly
    this._onPointerDown = this.handlePointerDown.bind(this);
    this._onPointerMove = this.handlePointerMove.bind(this);
    this._onPointerUp = this.handlePointerUp.bind(this);
    this._onPointerCancel = this.handlePointerCancel.bind(this);
    this._onMouseDown = this.handleMouseDown.bind(this);
    this._onMouseMove = this.handleMouseMove.bind(this);
    this._onMouseUp = this.handleMouseUp.bind(this);
    this._onTouchStart = this.handleTouchStart.bind(this);
    this._onTouchMove = this.handleTouchMove.bind(this);
    this._onTouchEnd = this.handleTouchEnd.bind(this);
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._onKeyUp = this.handleKeyUp.bind(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API — LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attach event listeners to a canvas or container element.
   * Keyboard listeners are always attached to `window`.
   * Safe to call multiple times — detaches previous target first.
   */
  attach(element: HTMLElement): void {
    this.detach();
    this.target = element;
    this.usePointerEvents = "onpointerdown" in element;

    if (this.usePointerEvents) {
      element.addEventListener("pointerdown", this._onPointerDown);
      element.addEventListener("pointermove", this._onPointerMove);
      element.addEventListener("pointerup", this._onPointerUp);
      element.addEventListener("pointercancel", this._onPointerCancel);
    } else {
      // Legacy fallback for older iOS Safari
      element.addEventListener("mousedown", this._onMouseDown);
      element.addEventListener("mousemove", this._onMouseMove);
      window.addEventListener("mouseup", this._onMouseUp);
      element.addEventListener("touchstart", this._onTouchStart, { passive: false });
      element.addEventListener("touchmove", this._onTouchMove, { passive: false });
      element.addEventListener("touchend", this._onTouchEnd);
    }

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  /**
   * Remove all event listeners. Call on component unmount.
   */
  detach(): void {
    const el = this.target as HTMLElement | null;
    if (el) {
      if (this.usePointerEvents) {
        el.removeEventListener("pointerdown", this._onPointerDown);
        el.removeEventListener("pointermove", this._onPointerMove);
        el.removeEventListener("pointerup", this._onPointerUp);
        el.removeEventListener("pointercancel", this._onPointerCancel);
      } else {
        el.removeEventListener("mousedown", this._onMouseDown);
        el.removeEventListener("mousemove", this._onMouseMove);
        window.removeEventListener("mouseup", this._onMouseUp);
        el.removeEventListener("touchstart", this._onTouchStart);
        el.removeEventListener("touchmove", this._onTouchMove);
        el.removeEventListener("touchend", this._onTouchEnd);
      }
    }
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);

    this.target = null;
    this.reset();
  }

  /**
   * Update the CSS→world scale factor when the window resizes.
   * GameShell calls this from its ResizeObserver callback.
   */
  setScale(scale: number): void {
    this.scale = scale > 0 ? scale : 1;
  }

  /**
   * Update logical world dimensions (call if your game changes WORLD_W/H).
   */
  setWorldSize(w: number, h: number): void {
    this.worldW = w;
    this.worldH = h;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API — READ STATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns a frozen snapshot of the current input state.
   * Call once per frame at the top of your game tick.
   *
   * The returned object is a plain struct — no methods, no refs.
   * Spread or destructure freely; it won't mutate.
   */
  snapshot(): UnifiedInput {
    // Recompute stability on every snapshot call (lazy, not event-driven)
    // so that decay happens even when the pointer is stationary.
    const now = performance.now();
    const variance = this.stabilityBuffer.variance(now, this.stabilityWindowMs);
    this._stability = 1 / (1 + variance / this.varianceScale);

    const dx = this._x - this._prevX;
    const dy = this._y - this._prevY;

    return {
      x: this._x,
      y: this._y,
      nx: this._x / this.worldW,
      ny: this._y / this.worldH,
      isDown: this._isDown,
      justPressed: this._justPressed,
      justReleased: this._justReleased,
      left: this._left,
      right: this._right,
      up: this._up,
      down: this._down,
      action: this._action,
      dx,
      dy,
      deltaMagnitude: Math.sqrt(dx * dx + dy * dy),
      stability: this._stability,
      pressure: this._pressure,
      heldKeys: this._heldKeys as ReadonlySet<string>,
      timestamp: this._timestamp,
      isTouchSource: this._isTouchSource,
    };
  }

  /**
   * Consume one or more discrete intents so they don't fire again next frame.
   * Call immediately after acting on an intent in your game tick.
   *
   * Example:
   * if (snap.left) { startJump("left"); input.consumeIntent("left"); }
   */
  consumeIntent(...keys: IntentKey[]): void {
    for (const key of keys) {
      switch (key) {
        case "left":   this._left = false;   break;
        case "right":  this._right = false;  break;
        case "up":     this._up = false;     break;
        case "down":   this._down = false;   break;
        case "action": this._action = false; break;
      }
    }
  }

  /**
   * Call at the END of each game tick to clear single-frame flags.
   * (justPressed, justReleased). Also updates prevX/prevY for dx/dy.
   *
   * GameShell wraps this automatically. Only call manually if you're
   * running a game loop outside of GameShell.
   */
  endFrame(): void {
    this._justPressed = false;
    this._justReleased = false;
    this._prevX = this._x;
    this._prevY = this._y;
    this._frameCleared = true;
  }

  /**
   * Returns all currently active touch contacts, keyed by pointerId.
   * Useful for multi-touch layouts (e.g. two-button mobile overlays).
   */
  getTouches(): ReadonlyMap<number, TouchContact> {
    return this.touches;
  }

  /**
   * Direct stability accessor (no full snapshot allocation).
   * Use this in hot paths that only need the stability number.
   */
  getStability(): number {
    return this._stability;
  }

  /**
   * True if ANY pointer is currently down (mouse or touch).
   * Avoids a full snapshot() call in simple polling scenarios.
   */
  isDown(): boolean {
    return this._isDown;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API — RESET
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset all state to defaults. Called automatically on detach().
   * Also call when transitioning between game scenes to clear stale input.
   */
  reset(): void {
    this._x = 0;
    this._y = 0;
    this._prevX = 0;
    this._prevY = 0;
    this._isDown = false;
    this._justPressed = false;
    this._justReleased = false;
    this._pressure = 1;
    this._isTouchSource = false;
    this._left = false;
    this._right = false;
    this._up = false;
    this._down = false;
    this._action = false;
    this._heldKeys.clear();
    this.touches.clear();
    this.stabilityBuffer.reset();
    this._stability = 1;
    this.swipeActive = false;
    this._timestamp = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5 — POINTER EVENTS HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  private toWorldCoords(clientX: number, clientY: number): { x: number; y: number } {
    const el = this.target as HTMLElement | null;
    if (!el || el === window as unknown) {
      return { x: clientX / this.scale, y: clientY / this.scale };
    }
    const rect = (el as HTMLElement).getBoundingClientRect();
    return {
      x: (clientX - rect.left) / this.scale,
      y: (clientY - rect.top) / this.scale,
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    // Only track up to maxTouches contacts
    if (this.touches.size >= this.maxTouches) return;

    const { x, y } = this.toWorldCoords(e.clientX, e.clientY);
    const nx = x / this.worldW;
    const ny = y / this.worldH;

    this.touches.set(e.pointerId, {
      pointerId: e.pointerId,
      x, y, nx, ny,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    });

    // Primary pointer drives the main state
    if (!this._isDown) {
      this._isDown = true;
      this._justPressed = true;
      this._x = x;
      this._y = y;
      this._pressure = e.pressure > 0 ? e.pressure : 0.5;
      this._isTouchSource = e.pointerType === "touch";
      this._timestamp = e.timeStamp;

      // Classify as left/right intent based on which half of screen was tapped
      if (nx < LEFT_ZONE_BOUNDARY) {
        this._left = true;
      } else {
        this._right = true;
      }

      // Action intent for center-ish taps (within middle third)
      if (nx >= 0.33 && nx <= 0.66) {
        this._action = true;
      }

      // Start swipe tracking
      this.swipeStartX = x;
      this.swipeStartY = y;
      this.swipeActive = true;
    }

    // Capture pointer so we receive events outside the element
    if (e.pointerType !== "touch") {
      try { (e.target as HTMLElement)?.setPointerCapture(e.pointerId); } catch {}
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const { x, y } = this.toWorldCoords(e.clientX, e.clientY);
    const nx = x / this.worldW;
    const ny = y / this.worldH;

    // Update touch contact record
    if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, {
        pointerId: e.pointerId,
        x, y, nx, ny,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      });
    }

    // Only update main state from the primary pointer (first one down)
    if (this._isDown && this.touches.has(e.pointerId)) {
      const dx = x - this._x;
      const dy = y - this._y;
      const mag = Math.sqrt(dx * dx + dy * dy);

      // Push to stability ring buffer — this is the core of the metric
      this.stabilityBuffer.push(mag, e.timeStamp);

      this._x = x;
      this._y = y;
      this._pressure = e.pressure > 0 ? e.pressure : 0.5;
      this._isTouchSource = e.pointerType === "touch";
      this._timestamp = e.timeStamp;
    } else if (!this._isDown) {
      // Hovering mouse — still track position and stability
      const dx = x - this._x;
      const dy = y - this._y;
      const mag = Math.sqrt(dx * dx + dy * dy);
      this.stabilityBuffer.push(mag, e.timeStamp);
      this._x = x;
      this._y = y;
      this._timestamp = e.timeStamp;
    }

    // Swipe detection on touch
    if (this.swipeActive && e.pointerType === "touch") {
      const totalDx = x - this.swipeStartX;
      const totalDy = y - this.swipeStartY;
      const dist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

      if (dist >= SWIPE_THRESHOLD_PX) {
        const angle = Math.atan2(totalDy, totalDx); // -π to π
        const absAngle = Math.abs(angle);

        if (absAngle < Math.PI / 4) {
          this._right = true;
        } else if (absAngle > (3 * Math.PI) / 4) {
          this._left = true;
        } else if (angle < 0) {
          this._up = true;
        } else {
          this._down = true;
        }

        this.swipeActive = false; // Consume the swipe — require lift to re-arm
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);

    if (this._isDown && this.touches.size === 0) {
      this._isDown = false;
      this._justReleased = true;
      this._timestamp = e.timeStamp;
      this.swipeActive = false;
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.touches.size === 0) {
      this._isDown = false;
      this._justReleased = true;
      this.swipeActive = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6 — LEGACY FALLBACK HANDLERS (non-Pointer Events browsers)
  // ─────────────────────────────────────────────────────────────────────────

  private handleMouseDown(e: MouseEvent): void {
    const { x, y } = this.toWorldCoords(e.clientX, e.clientY);
    const nx = x / this.worldW;

    this._isDown = true;
    this._justPressed = true;
    this._x = x;
    this._y = y;
    this._pressure = 0.5;
    this._isTouchSource = false;
    this._timestamp = e.timeStamp;

    if (nx < LEFT_ZONE_BOUNDARY) this._left = true;
    else this._right = true;
    if (nx >= 0.33 && nx <= 0.66) this._action = true;

    this.swipeStartX = x;
    this.swipeStartY = y;
    this.swipeActive = true;
  }

  private handleMouseMove(e: MouseEvent): void {
    const { x, y } = this.toWorldCoords(e.clientX, e.clientY);
    const dx = x - this._x;
    const dy = y - this._y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    this.stabilityBuffer.push(mag, e.timeStamp);
    this._x = x;
    this._y = y;
    this._isTouchSource = false;
    this._timestamp = e.timeStamp;
  }

  private handleMouseUp(_e: MouseEvent): void {
    this._isDown = false;
    this._justReleased = true;
    this.swipeActive = false;
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault(); // Prevent scroll / zoom
    const t = e.changedTouches[0];
    if (!t) return;
    const { x, y } = this.toWorldCoords(t.clientX, t.clientY);
    const nx = x / this.worldW;

    this._isDown = true;
    this._justPressed = true;
    this._x = x;
    this._y = y;
    this._pressure = (t as unknown as { force?: number }).force ?? 1;
    this._isTouchSource = true;
    this._timestamp = e.timeStamp;

    if (nx < LEFT_ZONE_BOUNDARY) this._left = true;
    else this._right = true;
    if (nx >= 0.33 && nx <= 0.66) this._action = true;

    this.swipeStartX = x;
    this.swipeStartY = y;
    this.swipeActive = true;
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const { x, y } = this.toWorldCoords(t.clientX, t.clientY);
    const dx = x - this._x;
    const dy = y - this._y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    this.stabilityBuffer.push(mag, e.timeStamp);
    this._x = x;
    this._y = y;
    this._isTouchSource = true;
    this._timestamp = e.timeStamp;

    // Swipe detection
    if (this.swipeActive) {
      const totalDx = x - this.swipeStartX;
      const totalDy = y - this.swipeStartY;
      const dist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
      if (dist >= SWIPE_THRESHOLD_PX) {
        const angle = Math.atan2(totalDy, totalDx);
        const absAngle = Math.abs(angle);
        if (absAngle < Math.PI / 4) this._right = true;
        else if (absAngle > (3 * Math.PI) / 4) this._left = true;
        else if (angle < 0) this._up = true;
        else this._down = true;
        this.swipeActive = false;
      }
    }
  }

  private handleTouchEnd(_e: TouchEvent): void {
    this._isDown = false;
    this._justReleased = true;
    this.swipeActive = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7 — KEYBOARD HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Key → Intent mapping.
   * Multiple keys can map to the same intent (e.g. ArrowLeft and A both → left).
   */
  private static readonly KEY_MAP: Record<string, IntentKey> = {
    ArrowLeft:  "left",
    KeyA:       "left",
    ArrowRight: "right",
    KeyD:       "right",
    ArrowUp:    "up",
    KeyW:       "up",
    ArrowDown:  "down",
    KeyS:       "down",
    Space:      "action",
    Enter:      "action",
    NumpadEnter:"action",
  };

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't interfere with browser shortcuts or form inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return; // Hold-to-repeat — ignore, intents are latched

    this._heldKeys.add(e.code);
    this._timestamp = e.timeStamp;
    this._isTouchSource = false;

    const intent = InputManager.KEY_MAP[e.code];
    if (!intent) return;

    // Prevent arrow keys from scrolling the page during gameplay
    e.preventDefault();

    switch (intent) {
      case "left":   this._left = true;   break;
      case "right":  this._right = true;  break;
      case "up":     this._up = true;     break;
      case "down":   this._down = true;   break;
      case "action": this._action = true; break;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this._heldKeys.delete(e.code);
    this._timestamp = e.timeStamp;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — SINGLETON EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global singleton instance.
 *
 * GameShell calls inputManager.attach(canvasEl) on mount and
 * inputManager.detach() on unmount. Games import this singleton and
 * call inputManager.snapshot() each tick — no prop drilling, no context.
 *
 * Options are set to sensible defaults for the Squid Arcade world size.
 * DalgonaCandy will call inputManager.setScale(shell.scale) after mount
 * to ensure pointer coordinates are correctly mapped.
 *
 * Override options at construction time if you need a custom world size:
 * const inputManager = new InputManager({ worldW: 1920, worldH: 1080 });
 */
export const inputManager = new InputManager({
  stabilityWindowMs: 300,
  varianceScale: 120,
  maxTouches: 4,
  worldW: 1280,
  worldH: 720,
  initialScale: 1,
});