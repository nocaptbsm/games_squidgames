"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore, selectSessionStats, type GameId, type SessionEntry } from "@/store/gameStore";
import { addLeaderboardEntry, sanitizeName } from "@/lib/Leaderboard";
import { LeaderboardEntry } from "@/lib/Leaderboard";

const GAME_LABELS: Record<GameId, string> = {
  "red-light-green-light": "Red Light, Green Light",
  "glass-bridge":          "Glass Bridge",
  "dalgona":               "Dalgona Candy",
  "menu":                  "Menu"
};

const GAME_SYMBOLS: Record<GameId, string> = {
  "red-light-green-light": "▲",
  "glass-bridge":          "○",
  "dalgona":               "□",
  "menu":                  "M"
};

const OUTCOME_COLOR: Record<"victory" | "eliminated", string> = {
  victory:    "#00FFB2",
  eliminated: "#FF0066",
};

interface SessionSummaryProps {
  onNewSession:    () => void;
  onViewLeaderboard: () => void;
}

export default function SessionSummary({
  onNewSession,
  onViewLeaderboard,
}: SessionSummaryProps) {
  const sessionHistory = useGameStore((s) => s.sessionHistory);
  const sessionId      = useGameStore((s) => s.sessionId);
  const survived = useGameStore((s) => selectSessionStats(s).survived);
const total    = useGameStore((s) => selectSessionStats(s).total);

  const [nameChars, setNameChars] = useState<string[]>(["A", "A", "A"]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saved, setSaved]         = useState(false);
  const [rank, setRank]           = useState<number | null>(null);

  const isWin = survived === 3;
  const accentColor = isWin ? "#FFD700" : "#FF0066";

  const handleSave = useCallback(() => {
    if (saved || !sessionId) return;
    const name  = sanitizeName(nameChars.join(""));
    const best  = sessionHistory.reduce((mx: number, e: SessionEntry) => Math.max(mx, e.score), 0);
    const board = addLeaderboardEntry({
      name,
      totalScore:     total,
      gamesSurvived:  survived,
      bestSingleGame: best,
      date:           new Date().toISOString(),
      sessionId,
    } as LeaderboardEntry);
    const idx = board.findIndex((entry: LeaderboardEntry) => entry.sessionId === sessionId);
    setRank(idx === -1 ? null : idx + 1);
    setSaved(true);
  }, [saved, sessionId, nameChars, sessionHistory, total, survived]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (saved) return;
      if (e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, 2));
      } else if (e.key === "ArrowLeft") {
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowUp") {
        setNameChars((prev) => {
          const next = [...prev];
          const code = next[activeIdx].charCodeAt(0);
          next[activeIdx] = String.fromCharCode(code === 90 ? 65 : code + 1);
          return next;
        });
      } else if (e.key === "ArrowDown") {
        setNameChars((prev) => {
          const next = [...prev];
          const code = next[activeIdx].charCodeAt(0);
          next[activeIdx] = String.fromCharCode(code === 65 ? 90 : code - 1);
          return next;
        });
      } else if (/^[A-Za-z]$/.test(e.key)) {
        setNameChars((prev) => {
          const next = [...prev];
          next[activeIdx] = e.key.toUpperCase();
          return next;
        });
        setActiveIdx((i) => Math.min(i + 1, 2));
      } else if (e.key === "Enter") {
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIdx, saved, nameChars, handleSave]);

  const cycleChar = useCallback((idx: number, dir: 1 | -1) => {
    setNameChars((prev) => {
      const next = [...prev];
      const code = next[idx].charCodeAt(0);
      if (dir === 1) next[idx] = String.fromCharCode(code === 90 ? 65 : code + 1);
      else           next[idx] = String.fromCharCode(code === 65 ? 90 : code - 1);
      return next;
    });
  }, []);

  const headline = isWin
    ? "ALL GAMES SURVIVED"
    : survived === 0
    ? "ELIMINATED — FIRST GAME"
    : `SURVIVED ${survived} OF 3`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={styles.root}
    >
      <div style={styles.noise} />
      <div style={styles.inner}>
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={styles.headlineBlock}
        >
          <div style={{ ...styles.eyebrow, color: accentColor }}>SESSION COMPLETE</div>
          <div style={{ ...styles.headline, color: isWin ? "#FFD700" : "#fff" }}>{headline}</div>
          <div style={styles.totalScore}>
            <span style={styles.scoreLabel}>TOTAL SCORE</span>
            <span style={{ ...styles.scoreValue, color: accentColor }}>{total.toLocaleString()}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          style={styles.historyBlock}
        >
          {sessionHistory.map((entry: SessionEntry, i: number) => (
            <div key={i} style={styles.historyRow}>
              <span style={{ ...styles.historySymbol, color: OUTCOME_COLOR[entry.outcome] }}>
                {GAME_SYMBOLS[entry.gameId]}
              </span>
              <span style={styles.historyGame}>{GAME_LABELS[entry.gameId]}</span>
              <span style={{ ...styles.historyOutcome, color: OUTCOME_COLOR[entry.outcome] }}>
                {entry.outcome === "victory" ? "SURVIVED" : "ELIMINATED"}
              </span>
              <span style={styles.historyScore}>{entry.score.toLocaleString()}</span>
            </div>
          ))}
          {sessionHistory.length === 0 && <div style={styles.emptyHistory}>No games recorded.</div>}
        </motion.div>

        <AnimatePresence mode="wait">
          {!saved ? (
            <motion.div key="entry" initial={{ y: 16, opacity: 0 }} animate={{ y: 0,  opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: 0.4, duration: 0.4 }} style={styles.nameBlock}>
              <div style={styles.nameLabel}>ENTER YOUR NAME</div>
              <div style={styles.nameHint}>↑ ↓ to change · → to advance · ENTER to save</div>
              <div style={styles.nameRow}>
                {nameChars.map((ch, i) => (
  <div key={i} onClick={() => setActiveIdx(i)} style={{ ...styles.nameChar, ...(i === activeIdx ? styles.nameCharActive : {}) }}>
    <button onClick={(e) => { e.stopPropagation(); cycleChar(i, 1); }} style={styles.charArrow}>▲</button>
    <span style={{ color: i === activeIdx ? accentColor : "#fff" }}>{ch}</span>
    <button onClick={(e) => { e.stopPropagation(); cycleChar(i, -1); }} style={styles.charArrow}>▼</button>
  </div>
))}
              </div>
              <button onClick={handleSave} style={{ ...styles.saveBtn, background: accentColor }}>SAVE SCORE</button>
            </motion.div>
          ) : (
            <motion.div key="saved" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1,   opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} style={styles.savedBlock}>
              <div style={{ ...styles.savedTag, color: accentColor }}>SCORE SAVED</div>
              {rank && <div style={styles.rankLine}>You are <span style={{ color: accentColor }}>#{rank}</span> on the local board</div>}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.4 }} style={styles.ctaRow}>
          <button onClick={onViewLeaderboard} style={styles.secondaryBtn}>HIGH SCORES</button>
          <button onClick={onNewSession} style={{ ...styles.primaryBtn, background: accentColor, color: isWin ? "#000" : "#000" }}>NEW SESSION</button>
        </motion.div>
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: "fixed", inset: 0, background: "#07080f", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, overflow: "hidden auto", fontFamily: "'DM Mono', monospace" },
  noise: { position: "fixed", inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents: "none", opacity: 0.5, zIndex: 0 },
  inner: { position: "relative", zIndex: 1, width: "100%", maxWidth: 520, padding: "40px 24px", display: "flex", flexDirection: "column", gap: 24 },
  headlineBlock: { display: "flex", flexDirection: "column", gap: 8 },
  eyebrow: { fontSize: 9, letterSpacing: "0.32em", textTransform: "uppercase" },
  headline: { fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 7vw, 56px)", letterSpacing: "0.06em", lineHeight: 0.95 },
  totalScore: { display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 },
  scoreLabel: { fontSize: 9, letterSpacing: "0.28em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" },
  scoreValue: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: "0.05em" },
  historyBlock: { display: "flex", flexDirection: "column", gap: 0, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" },
  historyRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  historySymbol: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, flexShrink: 0, width: 18, textAlign: "center" },
  historyGame: { fontSize: 12, color: "rgba(255,255,255,0.65)", flex: 1, letterSpacing: "0.04em" },
  historyOutcome: { fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", flexShrink: 0 },
  historyScore: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "rgba(255,255,255,0.55)", flexShrink: 0, minWidth: 60, textAlign: "right" },
  emptyHistory: { padding: "20px 16px", fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center" },
  nameBlock: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px", background: "rgba(13,15,26,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3 },
  nameLabel: { fontSize: 9, letterSpacing: "0.32em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" },
  nameHint: { fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.22)", textTransform: "uppercase" },
  nameRow: { display: "flex", gap: 12, marginTop: 4 },
  nameChar: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: "0.1em", lineHeight: 1, width: 64, height: 90, border: "2px solid rgba(255,255,255,0.2)", borderRadius: 2, cursor: "pointer", padding: "4px 0", transition: "border-color 0.15s", justifyContent: "space-between" },
  nameCharActive: {border: "2px solid var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)", },
  charArrow: { fontSize: 10, color: "rgba(255,255,255,0.3)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 16px", lineHeight: 1, fontFamily: "monospace" },
  saveBtn: { width: "100%", fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "0.2em", color: "#000", border: "none", padding: "12px 0", borderRadius: 2, cursor: "pointer", marginTop: 4, textTransform: "uppercase" },
  savedBlock: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px", background: "rgba(13,15,26,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3 },
  savedTag: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: "0.15em" },
  rankLine: { fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" },
  ctaRow: { display: "flex", gap: 12 },
  primaryBtn: { flex: 1, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "0.2em", border: "none", padding: "13px 0", borderRadius: 2, cursor: "pointer", textTransform: "uppercase" },
  secondaryBtn: { flex: 1, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: "0.2em", background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.6)", padding: "13px 0", borderRadius: 2, cursor: "pointer", textTransform: "uppercase", transition: "border-color 0.2s, color 0.2s" },
};