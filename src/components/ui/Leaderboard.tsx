"use client";

import React from "react";
import { getLeaderboard,  } from "@/lib/Leaderboard";

interface LeaderboardProps {
  onBack: () => void;
  highlightSession?: string | null;
}

export default function Leaderboard({ onBack, highlightSession }: LeaderboardProps) {
  const entries = getLeaderboard();

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#07080f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Mono', monospace",
      color: "#fff",
      padding: "2rem",
    }}>
      <h2 style={{ marginBottom: "2rem", fontSize: "1.5rem", letterSpacing: "0.1em" }}>
        LEADERBOARD
      </h2>

      {entries.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No scores yet</p>
      ) : (
        <div style={{
          maxHeight: "70vh",
          overflowY: "auto",
          width: "100%",
          maxWidth: "600px",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                <th style={{ padding: "0.5rem", textAlign: "left", fontWeight: "normal" }}>Rank</th>
                <th style={{ padding: "0.5rem", textAlign: "left", fontWeight: "normal" }}>Name</th>
                <th style={{ padding: "0.5rem", textAlign: "right", fontWeight: "normal" }}>Score</th>
                <th style={{ padding: "0.5rem", textAlign: "right", fontWeight: "normal" }}>Survived</th>
                <th style={{ padding: "0.5rem", textAlign: "right", fontWeight: "normal" }}>Best</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr
                  key={`${entry.sessionId}-${idx}`}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    background: entry.sessionId === highlightSession ? "rgba(255,255,255,0.05)" : "transparent",
                  }}
                >
                  <td style={{ padding: "0.5rem", textAlign: "left" }}>{idx + 1}</td>
                  <td style={{ padding: "0.5rem", textAlign: "left" }}>{entry.name}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>{entry.totalScore}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>{entry.gamesSurvived}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right" }}>{entry.bestSingleGame}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onBack}
        style={{
          marginTop: "2rem",
          padding: "0.75rem 1.5rem",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.875rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Back
      </button>
    </div>
  );
}
