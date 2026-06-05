"use client";

import React from "react";
import { motion } from "framer-motion";
import { type GameId } from "@/store/gameStore";

export interface BriefingData {
  title: string;
  episode: string;
  tagline: string;
  description: string;
  objective: string;
  controls: { key: string; action: string }[];
  accentColor: string;
  symbol: string;
  dangerNote: string;
}

// Partial<> used because "menu" has no briefing screen
const BRIEFING_DATA: Partial<Record<GameId, BriefingData>> = {
  "red-light-green-light": {
    title: "Red Light, Green Light",
    episode: "01",
    tagline: "Don't move.",
    description: "Reach the finish line before the timer runs out. You may only move when the doll is facing the tree.",
    objective: "Cross the finish line.",
    controls: [{ key: "W / ARROWS", action: "Move" }, { key: "SHIFT", action: "Sprint" }, { key: "SPACE", action: "Jump" }],
    accentColor: "#FF0066",
    symbol: "▲",
    dangerNote: "Movement during Red Light results in immediate elimination."
  },
  "glass-bridge": {
    title: "Glass Bridge",
    episode: "02",
    tagline: "Step carefully.",
    description: "Memorize the safe panels and cross the bridge. Tempered glass will hold your weight, regular glass will shatter.",
    objective: "Reach the other side.",
    controls: [{ key: "LEFT / RIGHT", action: "Jump to panel" }],
    accentColor: "#00FFB2",
    symbol: "○",
    dangerNote: "Stepping on regular glass results in immediate elimination."
  },
  "dalgona": {
    title: "Dalgona Candy",
    episode: "03",
    tagline: "Carve the shape.",
    description: "Carefully carve out the shape from the honeycomb candy without breaking it.",
    objective: "Extract the shape intact.",
    controls: [{ key: "CLICK", action: "Carve" }, { key: "HOLD", action: "Deep Cut" }],
    accentColor: "#FFD700",
    symbol: "□",
    dangerNote: "Breaking the shape results in immediate elimination."
  },
};

interface GameBriefingProps {
  gameId: GameId;
  onBegin: () => void;
  onBack: () => void;
}

export default function GameBriefing({ gameId, onBegin, onBack }: GameBriefingProps) {
  const data = BRIEFING_DATA[gameId];
  if (!data) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, background: "#050810", color: "#fff",
        display: "flex", flexDirection: "column", zIndex: 100,
        fontFamily: "'DM Mono', monospace", overflowY: "auto"
      }}
    >
      <div style={{ padding: "40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack} style={{ background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.2)", padding: "10px 24px", cursor: "pointer", letterSpacing: "0.2em", textTransform: "uppercase" }}>
          ← ABORT
        </button>
        <div style={{ fontSize: 12, letterSpacing: "0.4em", color: data.accentColor }}>EPISODE {data.episode}</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px 60px" }}>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          <div style={{ fontSize: "clamp(48px, 8vw, 84px)", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.1em", color: "#fff", textAlign: "center", lineHeight: 1 }}>
            {data.title}
          </div>
          <div style={{ fontSize: 20, color: data.accentColor, textAlign: "center", letterSpacing: "0.2em", marginTop: 10, textTransform: "uppercase" }}>
            {data.tagline}
          </div>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} style={{ maxWidth: 600, textAlign: "center", marginTop: 40, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          {data.description}
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} style={{ display: "flex", gap: 40, marginTop: 60, background: "rgba(255,255,255,0.03)", padding: "30px 60px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap", justifyContent: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em", marginBottom: 12 }}>OBJECTIVE</div>
            <div style={{ fontSize: 14, color: "#fff", textTransform: "uppercase" }}>{data.objective}</div>
          </div>
          <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em", marginBottom: 12 }}>CONTROLS</div>
            {data.controls.map((c, i) => (
              <div key={i} style={{ fontSize: 14, color: "#fff", marginBottom: 6, textTransform: "uppercase" }}>
                <span style={{ color: data.accentColor, marginRight: 10 }}>{c.key}</span> {c.action}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} style={{ marginTop: 40, fontSize: 12, color: "#FF0066", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          ⚠️ {data.dangerNote}
        </motion.div>

        <motion.button
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={onBegin}
          style={{ marginTop: 60, background: data.accentColor, color: "#000", border: "none", padding: "18px 80px", fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.15em", cursor: "pointer", borderRadius: 4, textTransform: "uppercase" }}
        >
          ACCEPT & BEGIN
        </motion.button>
      </div>
    </motion.div>
  );
}