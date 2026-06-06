// src/components/ui/GameResultBoard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Squid-Game-style result scoreboard shown at the end of every game.
// Drop in after a game ends — it animates in, shows participant status, then
// exposes PLAY AGAIN / MENU buttons.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import React, { useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GameResultOutcome = "survived" | "eliminated";

export interface GameResultRow {
  /** Participant number shown on the suit (e.g. 456) */
  participantNumber: number;
  /** Display name — defaults to "PLAYER" */
  name?: string;
  outcome: GameResultOutcome;
  /** Optional extra detail (score, panels reached, time…) */
  detail?: string;
  /** True for the human player row — gets a highlight border */
  isPlayer?: boolean;
}

export interface GameResultBoardProps {
  /** Short game title shown at the top */
  gameTitle: string;
  /** Subtitle / sub-label (e.g. "RED LIGHT GREEN LIGHT") */
  gameSubtitle?: string;
  /** All participant rows to display */
  rows: GameResultRow[];
  /** Primary score to show in the hero stat */
  score: number;
  /** Secondary stat label (optional) */
  statLabel?: string;
  statValue?: string;
  /** Callbacks */
  onRestart?: () => void;
  onMenu?: () => void;
  /** Accent colour: defaults per outcome */
  accentOverride?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SURVIVED_COLOR  = "#00ffb2";
const ELIMINATED_COLOR = "#ff2640";
const GOLD_COLOR      = "#ffd83d";

// ─── Helper: animated counter ─────────────────────────────────────────────────

function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    function step(ts: number) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / durationMs, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ParticipantRow: React.FC<{ row: GameResultRow; delay: number }> = ({ row, delay }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const survived = row.outcome === "survived";
  const accentColor = survived ? SURVIVED_COLOR : ELIMINATED_COLOR;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 18px",
        borderRadius: 6,
        background: row.isPlayer
          ? `rgba(${survived ? "0,255,178" : "255,38,64"},0.08)`
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${row.isPlayer ? accentColor + "55" : "rgba(255,255,255,0.06)"}`,
        boxShadow: row.isPlayer ? `0 0 18px ${accentColor}22` : "none",
        transition: "opacity 0.4s ease, transform 0.4s ease",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-20px)",
      }}
    >
      {/* Participant number badge */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 4,
          background: "rgba(0,0,0,0.6)",
          border: `1.5px solid ${accentColor}44`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 7, letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
          NO.
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
          {row.participantNumber}
        </span>
      </div>

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.22em",
            color: row.isPlayer ? "#fff" : "rgba(255,255,255,0.6)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.name ?? "PLAYER"}
          {row.isPlayer && (
            <span style={{ marginLeft: 8, fontSize: 9, color: accentColor, letterSpacing: "0.18em" }}>
              ← YOU
            </span>
          )}
        </div>
        {row.detail && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginTop: 2, letterSpacing: "0.14em" }}>
            {row.detail}
          </div>
        )}
      </div>

      {/* Status badge */}
      <div
        style={{
          padding: "5px 12px",
          borderRadius: 4,
          border: `1px solid ${accentColor}55`,
          background: `${accentColor}11`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accentColor,
            boxShadow: `0 0 8px ${accentColor}`,
            display: "inline-block",
            animation: survived ? "none" : "grb-blink 1.1s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.22em",
            color: accentColor,
            textTransform: "uppercase",
          }}
        >
          {survived ? "SURVIVED" : "ELIMINATED"}
        </span>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const GameResultBoard: React.FC<GameResultBoardProps> = ({
  gameTitle,
  gameSubtitle,
  rows,
  score,
  statLabel,
  statValue,
  onRestart,
  onMenu,
  accentOverride,
}) => {
  const playerRow = rows.find((r) => r.isPlayer);
  const playerSurvived = playerRow?.outcome === "survived";
  const heroColor = accentOverride ?? (playerSurvived ? SURVIVED_COLOR : ELIMINATED_COLOR);
  const heroLabel = playerSurvived ? "SURVIVED" : "ELIMINATED";

  const [heroVisible, setHeroVisible] = useState(false);
  const [boardVisible, setBoardVisible] = useState(false);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const animScore = useCountUp(score, 1000);

  useEffect(() => {
    const t1 = setTimeout(() => setHeroVisible(true),   100);
    const t2 = setTimeout(() => setBoardVisible(true),  500);
    const t3 = setTimeout(() => setButtonsVisible(true), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        padding: "24px 16px 40px",
        background: "rgba(4,4,10,0.93)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        fontFamily: "var(--font-mono, 'JetBrains Mono', 'Courier New', monospace)",
      }}
    >
      {/* ── Hero banner ─────────────────────────────────────────────── */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 28,
          opacity: heroVisible ? 1 : 0,
          transform: heroVisible ? "translateY(0) scale(1)" : "translateY(-16px) scale(0.95)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        {/* Game label */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.4em",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {gameSubtitle ?? gameTitle}
        </div>

        {/* SURVIVED / ELIMINATED */}
        <div
          style={{
            fontSize: "clamp(42px, 10vw, 88px)",
            fontFamily: "var(--font-bebas, 'Bebas Neue', 'Impact', sans-serif)",
            letterSpacing: "0.1em",
            color: heroColor,
            textShadow: `0 0 60px ${heroColor}88, 0 0 120px ${heroColor}44`,
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          {heroLabel}
        </div>

        {/* Score counter */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            marginTop: 10,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>
              SCORE
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: GOLD_COLOR, textShadow: `0 0 16px ${GOLD_COLOR}88` }}>
              {animScore.toLocaleString("en-US")}
            </div>
          </div>
          {statLabel && statValue && (
            <>
              <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.35)", marginBottom: 3 }}>
                  {statLabel}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
                  {statValue}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Scoreboard ─────────────────────────────────────────────── */}
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          opacity: boardVisible ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 18px",
            marginBottom: 8,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
            Participant
          </span>
          <span style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
            Status
          </span>
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row, i) => (
            <ParticipantRow key={row.participantNumber} row={row} delay={i * 80} />
          ))}
        </div>
      </div>

      {/* ── Action buttons ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 14,
          marginTop: 28,
          opacity: buttonsVisible ? 1 : 0,
          transform: buttonsVisible ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        {onRestart && (
          <button
            onClick={onRestart}
            style={{
              padding: "12px 28px",
              background: `${heroColor}18`,
              border: `1.5px solid ${heroColor}88`,
              borderRadius: 4,
              color: heroColor,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: `0 0 20px ${heroColor}22`,
              transition: "background 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${heroColor}30`;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 30px ${heroColor}44`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${heroColor}18`;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 20px ${heroColor}22`;
            }}
          >
            PLAY AGAIN
          </button>
        )}
        {onMenu && (
          <button
            onClick={onMenu}
            style={{
              padding: "12px 28px",
              background: "rgba(255,0,102,0.12)",
              border: "1.5px solid rgba(255,0,102,0.45)",
              borderRadius: 4,
              color: "#ff0066",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,0,102,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,0,102,0.12)";
            }}
          >
            ← MENU
          </button>
        )}
      </div>

      {/* ── Inline keyframes ───────────────────────────────────────── */}
      <style>{`
        @keyframes grb-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
};

export default GameResultBoard;
