/**
 * Minecraft-style blocky character renderer.
 *
 * Designed to drop into any 2D canvas game tick. Pure function — no allocations
 * inside the hot path (uses local consts only). Supports:
 *   - Two roles: 'player' (green tracksuit #456) and 'guard' (pink jumpsuit + mask)
 *   - Walk-cycle leg/arm swing driven by animPhase
 *   - Squash/stretch via scaleX/scaleY
 *   - Hit-flash overlay (0–1)
 *   - Per-frame opacity (for elimination fade)
 *
 * Coordinate convention:
 *   x, y is the TOP-LEFT of the character's bounding box (matches the
 *   existing RedLightGreenLight player coords where wy = top of sprite).
 */

export type CharacterRole = "player" | "guard";
export type CharacterState = "idle" | "running" | "hit" | "jumping";

export interface DrawCharacterOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  facing: 1 | -1;
  animPhase: number;        // radians; advance ~ dt * |vx| * 0.05
  opacity?: number;         // 0..1, default 1
  scaleX?: number;          // squash/stretch, default 1
  scaleY?: number;          // squash/stretch, default 1
  role: CharacterRole;
  state?: CharacterState;   // default "idle"
  hitFlash?: number;        // 0..1, red overlay alpha
  playerNumber?: number;    // shown on back/chest badge
}

// ── Palettes ────────────────────────────────────────────────────────────────

const PLAYER_PALETTE = {
  suit:       "#0c8a3e",   // Squid Game green tracksuit
  suitDark:   "#075c29",
  suitLight:  "#15b04e",
  stripe:     "#ffffff",
  skin:       "#f3c89a",
  skinDark:   "#c89a6d",
  hair:       "#1a1208",
  shoe:       "#0a0a0a",
  shoeSole:   "#2a2a2a",
  badge:      "#ffffff",
  badgeText:  "#0c8a3e",
  outline:    "#02160a",
} as const;

const GUARD_PALETTE = {
  suit:       "#e8438a",   // Squid Game pink guard jumpsuit
  suitDark:   "#a01e5e",
  suitLight:  "#f56fa9",
  stripe:     "#1a0a14",
  skin:       "#1a1a1a",   // black mask (no skin shown)
  skinDark:   "#000000",
  hair:       "#000000",   // hood
  shoe:       "#1a0a14",
  shoeSole:   "#0a0408",
  badge:      "#1a0a14",   // mask shape (circle/triangle/square)
  badgeText:  "#e8438a",
  outline:    "#1a0612",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Draws a flat-color rectangle with a 1px darker bottom/right edge for that
 *  blocky Minecraft pixel-art feel. Coordinates are in LOCAL space. */
function block(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, edge?: string
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (edge) {
    ctx.fillStyle = edge;
    ctx.fillRect(x, y + h - 1, w, 1);          // bottom shadow
    ctx.fillRect(x + w - 1, y, 1, h - 1);      // right shadow
  }
}

/** Top-light highlight on a block (1px brighter top edge). */
function blockHi(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, hi: string
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hi;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
}

// ── Main draw ───────────────────────────────────────────────────────────────

export function drawMinecraftCharacter(
  ctx: CanvasRenderingContext2D,
  opts: DrawCharacterOptions
): void {
  const {
    x, y, width: W, height: H,
    facing, animPhase,
    opacity = 1,
    scaleX = 1, scaleY = 1,
    role,
    state = "idle",
    hitFlash = 0,
    playerNumber,
  } = opts;

  const pal = role === "player" ? PLAYER_PALETTE : GUARD_PALETTE;

  // Walk swing (radians → pixels). Idle = no swing.
  const swing = state === "running" || state === "jumping"
    ? Math.sin(animPhase) * (W * 0.18)
    : 0;
  const armSwing = -swing * 0.85;

  // Subtle vertical bob while running
  const bob = state === "running" ? Math.abs(Math.sin(animPhase * 2)) * -1.2 : 0;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

  // Transform: center pivot at character's middle-bottom for natural facing/scale
  const cx = x + W * 0.5;
  const cy = y + H * 0.5;
  ctx.translate(cx, cy + bob);
  ctx.scale(scaleX * facing, scaleY);
  ctx.translate(-W * 0.5, -H * 0.5);

  // Anti-aliasing OFF for crisp pixel look
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  // ── Ground shadow (drawn in screen-space, so undo X-flip via scale below) ──
  ctx.save();
  ctx.translate(W * 0.5, H);
  ctx.scale(1 / Math.abs(facing), 0.25);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Block dimensions ────────────────────────────────────────────────────
  // Minecraft-ish proportions: head ~30%, torso ~38%, legs ~32%.
  const headSize = Math.round(W * 0.62);
  const headX    = Math.round((W - headSize) / 2);
  const headY    = 0;

  const torsoW   = Math.round(W * 0.74);
  const torsoH   = Math.round(H * 0.34);
  const torsoX   = Math.round((W - torsoW) / 2);
  const torsoY   = headSize - 2;

  const armW     = Math.round(W * 0.22);
  const armH     = torsoH + 2;
  const legW     = Math.round(W * 0.30);
  const legH     = Math.round(H * 0.30);
  const legY     = torsoY + torsoH - 1;

  // ── LEGS (drawn first, behind torso) ────────────────────────────────────
  // Left leg
  block(ctx,
    Math.round(W * 0.20) - swing * 0.5,
    legY,
    legW, legH,
    pal.suit, pal.suitDark
  );
  // Right leg
  block(ctx,
    Math.round(W * 0.50) + swing * 0.5,
    legY,
    legW, legH,
    pal.suit, pal.suitDark
  );

  // Side stripe down the legs (Squid Game tracksuit signature) — player only
  if (role === "player") {
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(
      Math.round(W * 0.20) - swing * 0.5 + legW - 2,
      legY + 2,
      1, legH - 4
    );
    ctx.fillRect(
      Math.round(W * 0.50) + swing * 0.5 + 1,
      legY + 2,
      1, legH - 4
    );
  }

  // Shoes
  const shoeH = Math.max(3, Math.round(H * 0.05));
  block(ctx,
    Math.round(W * 0.18) - swing * 0.5,
    legY + legH - shoeH,
    legW + 2, shoeH,
    pal.shoe, pal.shoeSole
  );
  block(ctx,
    Math.round(W * 0.50) + swing * 0.5 - 1,
    legY + legH - shoeH,
    legW + 2, shoeH,
    pal.shoe, pal.shoeSole
  );

  // ── BACK ARM (behind torso) ─────────────────────────────────────────────
  block(ctx,
    Math.round(W * 0.06) - armSwing * 0.4,
    torsoY + 1,
    armW, armH,
    pal.suitDark, pal.outline
  );

  // ── TORSO ───────────────────────────────────────────────────────────────
  blockHi(ctx, torsoX, torsoY, torsoW, torsoH, pal.suit, pal.suitLight);

  // Zipper / center seam
  ctx.fillStyle = pal.suitDark;
  ctx.fillRect(torsoX + Math.floor(torsoW / 2), torsoY + 2, 1, torsoH - 4);

  // Player number badge on chest (player only)
  if (role === "player" && playerNumber !== undefined) {
    const badgeW = Math.round(torsoW * 0.55);
    const badgeH = Math.round(torsoH * 0.42);
    const badgeX = torsoX + Math.round((torsoW - badgeW) / 2);
    const badgeY = torsoY + Math.round(torsoH * 0.18);
    block(ctx, badgeX, badgeY, badgeW, badgeH, pal.badge, pal.skinDark);

    // Number text — drawn in screen space so it doesn't mirror with facing
    ctx.save();
    ctx.scale(facing, 1); // undo horizontal flip for legibility
    const tx = (badgeX + badgeW / 2) * facing;
    const ty = badgeY + badgeH / 2;
    ctx.fillStyle = pal.badgeText;
    const fontPx = Math.max(6, Math.round(badgeH * 0.75));
    ctx.font = `bold ${fontPx}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(playerNumber).padStart(3, "0").slice(0, 3), tx, ty + 0.5);
    ctx.restore();
  }

  // Guard mask emblem on chest (guard only)
  if (role === "guard") {
    const emX = torsoX + Math.round(torsoW * 0.5);
    const emY = torsoY + Math.round(torsoH * 0.42);
    const r  = Math.max(2, Math.round(torsoW * 0.12));
    ctx.fillStyle = pal.badge;
    ctx.beginPath();
    ctx.arc(emX, emY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── FRONT ARM ───────────────────────────────────────────────────────────
  block(ctx,
    torsoX + torsoW - 1 + armSwing * 0.4,
    torsoY + 1,
    armW, armH,
    pal.suit, pal.suitDark
  );
  // Hand (skin tone peek for player, gloved black for guard)
  block(ctx,
    torsoX + torsoW - 1 + armSwing * 0.4,
    torsoY + armH - 3,
    armW, 3,
    role === "player" ? pal.skin : pal.shoe,
    pal.skinDark
  );

  // ── HEAD ────────────────────────────────────────────────────────────────
  if (role === "player") {
    // Skin face block
    blockHi(ctx, headX, headY, headSize, headSize, pal.skin, "#ffd9b0");

    // Hair (top portion)
    block(ctx, headX, headY, headSize, Math.round(headSize * 0.32),
      pal.hair, "#000000");

    // Sideburn pixels
    ctx.fillStyle = pal.hair;
    ctx.fillRect(headX, headY + Math.round(headSize * 0.32), 2, 3);
    ctx.fillRect(headX + headSize - 2, headY + Math.round(headSize * 0.32), 2, 3);

    // Eyes (Minecraft-style: two pixel blocks)
    const eyeY = headY + Math.round(headSize * 0.48);
    const eyeW = Math.max(2, Math.round(headSize * 0.14));
    const eyeH = Math.max(2, Math.round(headSize * 0.18));
    const eyeGap = Math.round(headSize * 0.18);
    const eyeXL = headX + Math.round(headSize * 0.5) - eyeGap - eyeW;
    const eyeXR = headX + Math.round(headSize * 0.5) + eyeGap;

    // Eye whites
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(eyeXL, eyeY, eyeW, eyeH);
    ctx.fillRect(eyeXR, eyeY, eyeW, eyeH);
    // Pupils
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(eyeXL + Math.max(1, eyeW - 2), eyeY, Math.min(2, eyeW), eyeH);
    ctx.fillRect(eyeXR + Math.max(1, eyeW - 2), eyeY, Math.min(2, eyeW), eyeH);

    // Mouth
    const mouthY = headY + Math.round(headSize * 0.78);
    ctx.fillStyle = "#6b3a1a";
    ctx.fillRect(headX + Math.round(headSize * 0.36), mouthY, Math.round(headSize * 0.28), 1);

  } else {
    // GUARD: black mask covering full head
    blockHi(ctx, headX, headY, headSize, headSize, pal.skin, "#2a2a2a");

    // Mask symbol (centered) — randomized per draw call would be nice,
    // but we deterministically pick "circle" for now.
    const symCx = headX + headSize / 2;
    const symCy = headY + headSize / 2;
    const symR  = Math.round(headSize * 0.22);

    ctx.strokeStyle = pal.suit;       // pink outline
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(symCx, symCy, symR, 0, Math.PI * 2);
    ctx.stroke();

    // Two faint eye-slot pixels under the mask
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(headX + Math.round(headSize * 0.28), headY + Math.round(headSize * 0.42), 2, 1);
    ctx.fillRect(headX + Math.round(headSize * 0.66), headY + Math.round(headSize * 0.42), 2, 1);
  }

  // ── Hit flash overlay ───────────────────────────────────────────────────
  if (hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 80, ${Math.min(0.7, hitFlash * 0.7)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Restore
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.restore();
}