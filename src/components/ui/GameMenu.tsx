"use client";

/**
 * src/components/GameMenu.tsx
 *
 * Part 1 Refactor — Navigation & UI
 *
 * Changes from original:
 * - "select" MenuState removed; clicking a game icon launches immediately.
 * - SelectCard component removed.
 * - handleShowSelect / handleBackToMain removed.
 * - Nav list (PLAY GAME / SETTINGS / EXIT) replaced by ControlsHUD
 * (fixed bottom-right ⚙ gear + ↩ exit icon buttons).
 * - SettingsOverlay dynamic import replaced by inline SettingsPanel that
 * reads and writes gameStore directly — settings now persist correctly.
 * - handleExitConfirm: window.close() replaced with resetHUD() +
 * setActiveGame("menu"), which atomically resets runtimePhase → "idle"
 * and clears eliminationPayload.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGameStore, type GameId, type Difficulty } from "@/store/gameStore";
import { SymbolTrio, CircleSymbol, TriangleSymbol, SquareSymbol } from "./SquidSymbols";
import { useMenuAudio } from "@/hooks/useMenuAudio";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface GameMenuProps {
  onLaunch?: (id: GameId) => void;
}

// "select" removed — icon tap launches directly.
type MenuState = "intro" | "main" | "settings" | "exit-confirm";

interface GameMode {
  id:         GameId;
  icon:       string;
  label:      string;
  sub:        string;
  color:      string;
  badge:      string;
  episode:    number;
  desc:       string;
  difficulty: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const GAME_MODES: GameMode[] = [
  { id: "red-light-green-light", icon: "/RedLightGreenLight.ico", label: "RED LIGHT\nGREEN LIGHT", sub: "RED LIGHT GREEN LIGHT", color: "#FF0066", badge: "GAME 01", episode: 1, desc: "Run. Freeze. Survive 60 seconds. One false move ends everything.", difficulty: 3 },
  { id: "glass-bridge",          icon: "/GlassBridge.ico",        label: "GLASS\nBRIDGE",           sub: "GLASS BRIDGE",          color: "#00FFB2", badge: "GAME 02", episode: 2, desc: "Two panes. One safe. Sixteen rows to cross. No second chances.",   difficulty: 4 },
  { id: "dalgona",               icon: "/DalgonaCandy.ico",        label: "DALGONA",                 sub: "DALGONA",               color: "#FFD700", badge: "GAME 03", episode: 3, desc: "Carve the shape without breaking the candy. Steady hands survive.", difficulty: 3 },
];

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PANEL — style tokens (defined at module scope, not recreated per render)
// ─────────────────────────────────────────────────────────────────────────────

const SP = {
  sectionWrap: {
    marginBottom: "1.2rem",
    padding: "0.75rem 0.9rem",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 3,
  } as React.CSSProperties,
  sectionHead: {
    fontFamily: "var(--font-mono-sq)",
    fontSize: "0.6rem",
    letterSpacing: "0.22em",
    color: "rgba(255,0,102,0.65)",
    marginBottom: "0.7rem",
  } as React.CSSProperties,
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    marginBottom: "0.52rem",
  } as React.CSSProperties,
  sliderLabel: {
    fontFamily: "var(--font-mono-sq)",
    fontSize: "0.62rem",
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.35)",
    width: "5.2rem",
    flexShrink: 0,
  } as React.CSSProperties,
  sliderPct: {
    fontFamily: "var(--font-mono-sq)",
    fontSize: "0.65rem",
    color: "#FF0066",
    width: "2.4rem",
    textAlign: "right",
  } as React.CSSProperties,
  toggleRow: {
    all: "unset",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    cursor: "pointer",
    padding: "0.38rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  toggleLabel: {
    fontFamily: "var(--font-mono-sq)",
    fontSize: "0.65rem",
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.5)",
  } as React.CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND CANVAS (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    const COLORS = ["rgba(255,0,102,0.10)","rgba(255,0,102,0.05)","rgba(180,0,60,0.07)","rgba(0,255,178,0.04)","rgba(255,255,255,0.025)"];
    type Streak = { x:number; y:number; length:number; speed:number; alpha:number; color:string };
    let streaks: Streak[] = [];
    function resize() { canvas!.width = canvas!.offsetWidth; canvas!.height = canvas!.offsetHeight; }
    function spawn(): Streak { return { x: Math.random()*canvas!.width, y: Math.random()*canvas!.height, length: 80+Math.random()*220, speed: 3+Math.random()*10, alpha: 0.3+Math.random()*0.7, color: COLORS[Math.floor(Math.random()*COLORS.length)] }; }
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 28; i++) streaks.push(spawn());
    function draw() {
      ctx.clearRect(0,0,canvas!.width,canvas!.height);
      for (const s of streaks) {
        ctx.save(); ctx.globalAlpha = s.alpha;
        const g = ctx.createLinearGradient(s.x,s.y,s.x+s.length,s.y);
        g.addColorStop(0,"transparent"); g.addColorStop(1,s.color);
        ctx.fillStyle = g; ctx.fillRect(s.x,s.y,s.length,1.5); ctx.restore();
        s.x += s.speed;
        if (s.x > canvas!.width + s.length) { s.x = -s.length; s.y = Math.random()*canvas!.height; }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }} aria-hidden />;
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME ICON CARD
// Simplified: onClick always fires the launch handler directly.
// aria-label updated to "Play …" (was "Select …") since one tap now launches.
// ─────────────────────────────────────────────────────────────────────────────

function GameIconCard({
  mode,
  onHover,
  onClick,
  delay,
}: {
  mode:    GameMode;
  onHover: () => void;
  onClick: (id: GameId) => void;
  delay:   number;
}) {
  const lines    = mode.label.split("\n");
  const colorKey = mode.color === "#FF0066" ? "pink" : mode.color === "#00FFB2" ? "teal" : "gold";
  return (
    <button
      className="sq-icon-card"
      data-color={colorKey}
      style={{ animationDelay: `${delay}s` }}
      onMouseEnter={onHover}
      onClick={() => onClick(mode.id)}
      aria-label={`Play ${mode.sub}`}
    >
      <span className="sq-icon-badge" style={{ color: mode.color, background: `${mode.color}12`, border: `1px solid ${mode.color}30` }}>
        {mode.badge}
      </span>
      <img src={mode.icon} alt={mode.sub} className="sq-icon-img" style={{ color: mode.color }} />
      <span className="sq-icon-label" style={{ color: mode.color }}>
        {lines.map((l, i) => (
          <React.Fragment key={i}>{l}{i < lines.length - 1 && <br />}</React.Fragment>
        ))}
      </span>
      {/* FIX 1.5 / Menu Polish — render desc field below the label */}
      <span
        className="sq-icon-desc"
        style={{
          fontFamily: "var(--font-mono-sq, 'JetBrains Mono', monospace)",
          fontSize: "clamp(9px, 1.6vw, 11px)",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.42)",
          lineHeight: 1.55,
          textAlign: "center",
          marginTop: 6,
          padding: "0 8px",
          maxWidth: 160,
          display: "block",
        }}
      >
        {mode.desc}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS HUD
// Fixed bottom-right: gear (settings) and log-out (exit) icon buttons.
// — 44 × 44 px minimum touch targets per WCAG 2.5.5
// — env(safe-area-inset-*) keeps buttons clear of iPhone notch/home bar
// — Feather-style SVGs: stroke-based, scale-independent
// ─────────────────────────────────────────────────────────────────────────────

const CTRL_BASE: React.CSSProperties = {
  width: 44, height: 44, minWidth: 44, minHeight: 44,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(8,8,14,0.78)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 4,
  cursor: "pointer",
  color: "rgba(255,255,255,0.55)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  transition: "border-color 140ms, background 140ms, color 140ms",
};

function ControlsHUD({
  onSettings,
  onExit,
  onHover,
}: {
  onSettings: () => void;
  onExit:     () => void;
  onHover:    () => void;
}) {
  const applyHover = (accentColor: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      onHover();
      const el = e.currentTarget;
      el.style.borderColor = `${accentColor}80`;
      el.style.background  = `${accentColor}18`;
      el.style.color       = accentColor;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = e.currentTarget;
      el.style.borderColor = "rgba(255,255,255,0.14)";
      el.style.background  = "rgba(8,8,14,0.78)";
      el.style.color       = "rgba(255,255,255,0.55)";
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        right:    "max(20px, calc(env(safe-area-inset-right, 0px) + 16px))",
        bottom:   "max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
        display:  "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 50,
      }}
    >
      {/* Settings — gear icon */}
      <button aria-label="Open settings" style={CTRL_BASE} onClick={onSettings} {...applyHover("#FF0066")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Exit — log-out icon */}
      <button aria-label="Return to menu" style={CTRL_BASE} onClick={onExit} {...applyHover("#FF5050")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PANEL
// Inline replacement for the old SettingsOverlay dynamic import.
// Reads and writes gameStore directly — every change persists to localStorage
// immediately via updateSettings() (see gameStore.ts § updateSettings).
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPanel({
  onClose,
  onHover,
  onClick,
}: {
  onClose:  () => void;
  onHover:  () => void;
  onClick:  () => void;
}) {
  const settings       = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);

  return (
    <div
      className="sq-overlay-backdrop"
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sq-overlay-panel"
        style={{ maxWidth: 420, width: "min(420px, 90vw)", maxHeight: "85dvh", overflowY: "auto", overscrollBehavior: "contain" }}
      >
        <div style={{ display:"flex", justifyContent:"center", marginBottom:"0.9rem" }}>
          <SymbolTrio size={14} gap={10} />
        </div>
        <h2
          className="sq-overlay-title"
          style={{ textAlign:"center", fontSize:"clamp(1.6rem,3vw,2.2rem)", marginBottom:"1.4rem", letterSpacing:"0.2em" }}
        >
          SETTINGS
        </h2>

        {/* ── AUDIO ─────────────────────────────────────────────────────── */}
        <div style={SP.sectionWrap}>
          <div style={SP.sectionHead}>◉  AUDIO</div>

          <div style={SP.sliderRow}>
            <span style={SP.sliderLabel}>MASTER</span>
            <input type="range" min={0} max={1} step={0.05}
              value={settings.masterVolume}
              onChange={e => updateSettings({ masterVolume: parseFloat(e.target.value) })}
              style={{ flex:1, accentColor:"#FF0066", cursor:"pointer" }}
              aria-label="Master Volume"
            />
            <span style={SP.sliderPct}>{Math.round(settings.masterVolume * 100)}%</span>
          </div>

          <div style={SP.sliderRow}>
            <span style={SP.sliderLabel}>MUSIC</span>
            <input type="range" min={0} max={1} step={0.05}
              value={settings.musicVolume}
              onChange={e => updateSettings({ musicVolume: parseFloat(e.target.value) })}
              style={{ flex:1, accentColor:"#FF0066", cursor:"pointer" }}
              aria-label="Music Volume"
            />
            <span style={SP.sliderPct}>{Math.round(settings.musicVolume * 100)}%</span>
          </div>

          <div style={{ ...SP.sliderRow, marginBottom: 0 }}>
            <span style={SP.sliderLabel}>SFX</span>
            <input type="range" min={0} max={1} step={0.05}
              value={settings.sfxVolume}
              onChange={e => updateSettings({ sfxVolume: parseFloat(e.target.value) })}
              style={{ flex:1, accentColor:"#FF0066", cursor:"pointer" }}
              aria-label="SFX Volume"
            />
            <span style={SP.sliderPct}>{Math.round(settings.sfxVolume * 100)}%</span>
          </div>
        </div>

        {/* ── GAMEPLAY ──────────────────────────────────────────────────── */}
        <div style={SP.sectionWrap}>
          <div style={SP.sectionHead}>⬡  GAMEPLAY</div>

          <button style={SP.toggleRow} onMouseEnter={onHover} onClick={() => { onClick(); updateSettings({ screenShake: !settings.screenShake }); }}>
            <span style={SP.toggleLabel}>SCREEN SHAKE</span>
            <span style={{ fontFamily:"var(--font-mono-sq)", fontSize:"0.65rem", letterSpacing:"0.14em", color: settings.screenShake ? "#00FFB2" : "rgba(255,255,255,0.22)", transition:"color 160ms" }}>
              {settings.screenShake ? "ON" : "OFF"}
            </span>
          </button>

          <button style={SP.toggleRow} onMouseEnter={onHover} onClick={() => { onClick(); updateSettings({ particlesEnabled: !settings.particlesEnabled }); }}>
            <span style={SP.toggleLabel}>PARTICLES</span>
            <span style={{ fontFamily:"var(--font-mono-sq)", fontSize:"0.65rem", letterSpacing:"0.14em", color: settings.particlesEnabled ? "#00FFB2" : "rgba(255,255,255,0.22)", transition:"color 160ms" }}>
              {settings.particlesEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <button style={{ ...SP.toggleRow, borderBottom:"none" }} onMouseEnter={onHover} onClick={() => { onClick(); updateSettings({ showFPS: !settings.showFPS }); }}>
            <span style={SP.toggleLabel}>SHOW FPS</span>
            <span style={{ fontFamily:"var(--font-mono-sq)", fontSize:"0.65rem", letterSpacing:"0.14em", color: settings.showFPS ? "#00FFB2" : "rgba(255,255,255,0.22)", transition:"color 160ms" }}>
              {settings.showFPS ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        {/* ── DIFFICULTY ────────────────────────────────────────────────── */}
        <div style={SP.sectionWrap}>
          <div style={SP.sectionHead}>△  DIFFICULTY</div>
          <div style={{ display:"flex", gap:8 }}>
            {(["easy", "normal", "hard"] as Difficulty[]).map(d => {
              const active = settings.difficulty === d;
              const col    = d === "easy" ? "#00FFB2" : d === "hard" ? "#FF0066" : "#FFD700";
              return (
                <button
                  key={d}
                  onMouseEnter={onHover}
                  onClick={() => { onClick(); updateSettings({ difficulty: d }); }}
                  style={{
                    all: "unset",
                    flex: 1,
                    textAlign: "center",
                    fontFamily: "var(--font-mono-sq)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.18em",
                    padding: "0.5rem 0",
                    cursor: "pointer",
                    borderRadius: 3,
                    transition: "all 140ms",
                    border: `1px solid ${active ? col : "rgba(255,255,255,0.1)"}`,
                    background: active ? `${col}18` : "transparent",
                    color: active ? col : "rgba(255,255,255,0.35)",
                  }}
                >
                  {d.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display:"flex", justifyContent:"center", marginTop:"0.4rem" }}>
          <button className="sq-btn sq-btn-cancel" onMouseEnter={onHover} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXIT CONFIRM
// Text updated: "RETURN TO MENU?" instead of "EXIT GAME?"
// Confirm action: resetHUD + setActiveGame("menu") (in parent handler)
// ─────────────────────────────────────────────────────────────────────────────

function ExitConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel:  () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="sq-overlay-backdrop"
      onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="sq-overlay-panel" style={{ textAlign:"center", maxWidth:380, width: "min(380px, 90vw)" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:"1rem" }}>
          <SymbolTrio size={18} gap={10} />
        </div>
        <h2
          className="sq-overlay-title"
          style={{ fontSize:"clamp(1.8rem,4vw,2.6rem)", marginBottom:"0.5rem" }}
        >
          RETURN TO MENU?
        </h2>
        <p
          style={{
            fontFamily: "var(--font-mono-sq)",
            fontSize: "0.72rem",
            letterSpacing: "0.15em",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          Your current progress will be lost.<br />
          Return to game selection?
        </p>
        <div className="sq-confirm-row">
          <button className="sq-btn sq-btn-cancel"  onClick={onCancel}>CANCEL</button>
          <button className="sq-btn sq-btn-confirm" onClick={onConfirm}>CONFIRM</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME MENU
// ─────────────────────────────────────────────────────────────────────────────

export default function GameMenu({ onLaunch }: GameMenuProps = {}) {
  const [menuState,    setMenuState]    = useState<MenuState>("intro");
  const [curtainOpen,  setCurtainOpen]  = useState(false);
  const [playerCount,  setPlayerCount]  = useState(456);
  const [countTick,    setCountTick]    = useState(false);
  const [countdownSec, setCountdownSec] = useState(30);

  const setActiveGame = useGameStore(s => s.setActiveGame);
  const resetHUD      = useGameStore(s => s.resetHUD);
  const audio         = useMenuAudio();
  const settings       = useGameStore(s => s.settings);
  const updateSettings = useGameStore(s => s.updateSettings);

  // ── Intro sequence ────────────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setCurtainOpen(true),                       600);
    const t2 = setTimeout(() => { setMenuState("main"); audio.startBg(); }, 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player count ticker ───────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setPlayerCount(p => { const n = p - Math.floor(Math.random() * 3); return n < 1 ? 456 : n; });
      setCountTick(t => !t);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setCountdownSec(s => (s <= 0 ? 30 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Audio helpers ─────────────────────────────────────────────────────────
  const handleHover = useCallback(() => audio.play("hover"), [audio]);
  const handleClick = useCallback(() => audio.play("click"), [audio]);

  // ── Launch ────────────────────────────────────────────────────────────────
  // Guard: only launch when main is the active state. This prevents accidental
  // triggers from icon cards that remain visible behind overlay backdrops.
  const handleLaunch = useCallback((id: GameId) => {
    if (menuState !== "main") return;
    audio.play("transition");
    audio.stopBg();
    setTimeout(() => { onLaunch?.(id); setActiveGame(id); }, 350);
  }, [audio, menuState, onLaunch, setActiveGame]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const handleOpenSettings  = useCallback(() => { audio.play("open");  setMenuState("settings"); }, [audio]);
  const handleCloseSettings = useCallback(() => { audio.play("click"); setMenuState("main");     }, [audio]);

  // ── Exit ──────────────────────────────────────────────────────────────────
  const handleExitRequest = useCallback(() => { audio.play("open"); setMenuState("exit-confirm"); }, [audio]);

  const handleExitConfirm = useCallback(() => {
    audio.play("exit");
    audio.stopBg();
    // Reset HUD state, then atomically reset activeGame + runtimePhase via store.
    // setActiveGame("menu") sets runtimePhase → "idle" and clears eliminationPayload.
    resetHUD();
    setActiveGame("menu");
    setTimeout(() => setMenuState("main"), 500);
  }, [audio, resetHUD, setActiveGame]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sq-menu-root sq-scanlines">
      <BackgroundCanvas />
      <div className="sq-grid-bg"       aria-hidden />
      <div className="sq-scanline-sweep" aria-hidden />

      {/* Ambient glow shapes */}
      <div className="sq-ambient-shape pink" aria-hidden style={{ width:"80vmin", height:"80vmin", top:"-15%",  left:"-10%" }} />
      <div className="sq-ambient-shape teal" aria-hidden style={{ width:"60vmin", height:"60vmin", bottom:"-10%", right:"-8%", animationDelay:"3s" }} />

      {/* Geometric rings */}
      <div className="sq-geo-circle spin" aria-hidden style={{ width:"70vmin", height:"70vmin", top:"-15vmin",  right:"-15vmin", borderColor:"rgba(255,0,102,0.08)" }} />
      <div className="sq-geo-circle"      aria-hidden style={{ width:"90vmin", height:"90vmin", bottom:"-25vmin", left:"-25vmin", borderColor:"rgba(0,255,178,0.04)", animation:"sq-spin-slow 40s linear reverse infinite" }} />

      {/* Decorative symbols */}
      <CircleSymbol   size={70} color="#FF0066" glow animate style={{ position:"absolute", top:"12%",    left:"6%",   opacity:0.15 }} />
      <TriangleSymbol size={50} color="#00FFB2" glow animate style={{ position:"absolute", top:"20%",    right:"8%",  opacity:0.15 }} />
      <SquareSymbol   size={40} color="#FFD700" glow animate style={{ position:"absolute", bottom:"25%", left:"10%",  opacity:0.12 }} />
      <CircleSymbol   size={30} color="#00FFB2" glow animate style={{ position:"absolute", bottom:"18%", right:"6%",  opacity:0.12 }} />

      {/* Curtain */}
      <div className={`sq-curtain${curtainOpen ? " open" : ""}`} aria-hidden />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div
        className="sq-menu-content"
        style={{ opacity: menuState === "intro" ? 0 : 1, transition: "opacity 0.5s ease" }}
      >
        {/* Title */}
        <div className="sq-title-block">
          <span className="sq-korean-label sq-font-korean">오징어 게임</span>
          <h1 className="sq-main-title sq-font-bebas">SQUID GAME</h1>
          <div className="sq-title-divider">
            <div className="sq-title-divider-line pink-right" />
            <CircleSymbol   size={7} color="#FF0066" glow />
            <TriangleSymbol size={7} color="#00FFB2" glow />
            <SquareSymbol   size={7} color="#FF0066" glow />
            <div className="sq-title-divider-line pink-left" />
          </div>
        </div>

        {/* Game icons — always visible; one tap launches directly */}
        <div className="sq-icons-row">
          {GAME_MODES.map((mode, i) => (
            <GameIconCard
              key={mode.id}
              mode={mode}
              onHover={handleHover}
              onClick={handleLaunch}
              delay={0.65 + i * 0.12}
            />
          ))}
        </div>

        {/* Live status pill — shown in main state */}
        {menuState === "main" && (
          <div className="sq-status-pill">
            <div className="sq-status-item">
              <span className="sq-status-label sq-font-mono">PLAYERS</span>
              <span
                className="sq-status-val sq-font-bebas sq-neon-teal"
                style={{ color:"#00FFB2", transform: countTick ? "scale(1.08)" : "scale(1)", transition:"transform 0.4s" }}
              >
                {playerCount}
              </span>
            </div>
            <div className="sq-status-divider" aria-hidden />
            <div className="sq-status-item">
              <span className="sq-status-label sq-font-mono">PRIZE</span>
              <span className="sq-status-val sq-font-bebas sq-neon-gold" style={{ color:"#FFD700" }}>₩45.6B</span>
            </div>
            <div className="sq-status-divider" aria-hidden />
            <div className="sq-status-item">
              <span className="sq-status-label sq-font-mono">GAMES</span>
              <span
                className="sq-status-val sq-font-bebas sq-neon-pink"
                style={{ color:"#FF0066", fontSize:"1.4rem" }}
              >
                3
              </span>
            </div>
          </div>
        )}

        {/* Footer symbols */}
        <div style={{ opacity:0.22, animation:"sq-fade-in 0.8s ease 1.6s both" }}>
          <SymbolTrio size={10} gap={8} glow={false} />
        </div>
      </div>

      {/* ── Bottom-right controls (visible in main state only) ─────────── */}
      {menuState === "main" && (
        <ControlsHUD
          onSettings={handleOpenSettings}
          onExit={handleExitRequest}
          onHover={handleHover}
        />
      )}

      {/* ── NEW: Custom Play/Pause Music Toggle ─────────── */}
      {menuState === "main" && (
        <button
          aria-label="Toggle Music"
          onClick={(e) => {
            e.stopPropagation(); // Prevents clicks from triggering anything behind it
            handleClick(); // Plays your UI click sound
            // Toggle the global music volume between 1 (100%) and 0 (Muted)
            updateSettings({ musicVolume: settings.musicVolume > 0 ? 0 : 1 });
          }}
          onMouseEnter={(e) => {
            handleHover();
            e.currentTarget.style.borderColor = "#00FFB280";
            e.currentTarget.style.background = "#00FFB218";
            e.currentTarget.style.color = "#00FFB2";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
            e.currentTarget.style.background = "rgba(8,8,14,0.78)";
            e.currentTarget.style.color = "rgba(255,255,255,0.55)";
          }}
          style={{
            position: "absolute",
            left: "max(20px, calc(env(safe-area-inset-left, 0px) + 16px))",
            bottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
            width: 44, height: 44, minWidth: 44, minHeight: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(8,8,14,0.78)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 4,
            cursor: "pointer",
            color: "rgba(255,255,255,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            transition: "border-color 140ms, background 140ms, color 140ms",
            zIndex: 50,
          }}
        >
          {settings.musicVolume > 0 ? (
            /* Playing Icon (Speaker with waves) */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            /* Muted Icon (Speaker with an X) */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
      )}
      {menuState === "settings" && (
        <SettingsPanel
          onClose={handleCloseSettings}
          onHover={handleHover}
          onClick={handleClick}
        />
      )}

      {menuState === "exit-confirm" && (
        <ExitConfirm
          onCancel={() => { handleClick(); setMenuState("main"); }}
          onConfirm={handleExitConfirm}
        />
      )}

      {/* Portrait warning */}
      <div className="portrait-warning" role="alert">
        <div className="portrait-warning-icon">📱</div>
        <p style={{ fontFamily:"var(--font-mono-sq)", letterSpacing:"0.1em" }}>ROTATE YOUR DEVICE</p>
      </div>
    </div>
  );
}