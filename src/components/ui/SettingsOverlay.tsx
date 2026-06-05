// src/components/ui/SettingsOverlay.tsx
//
// Settings modal that slides in over the main menu.
// Visual identity matches the zip's design spec — dark glass, neon pink accents.
// Reuses gameStore for persistent settings.

"use client";

import React, { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { SymbolTrio } from "./SquidSymbols";

interface SettingsOverlayProps {
  onClose: () => void;
  onHover?: () => void;
  onClick?: () => void;
}

interface SliderRowProps {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  onHover?: () => void;
}

function SliderRow({ label, value, onChange, onHover }: SliderRowProps) {
  return (
    <div className="sq-settings-row" onMouseEnter={onHover}>
      <span className="sq-settings-label">{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, maxWidth: 200 }}>
        <input
          type="range"
          className="sq-slider"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className="sq-settings-value">{Math.round(value * 100)}</span>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label:    string;
  value:    boolean;
  onChange: (v: boolean) => void;
  onHover?: () => void;
}

function ToggleRow({ label, value, onChange, onHover }: ToggleRowProps) {
  const id = `sq-toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="sq-settings-row" onMouseEnter={onHover}>
      <span className="sq-settings-label">{label}</span>
      <label className="sq-toggle" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="sq-toggle-track" />
        <span className="sq-toggle-thumb" />
      </label>
    </div>
  );
}

export default function SettingsOverlay({ onClose, onHover, onClick }: SettingsOverlayProps) {
  const settings       = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const panelRef       = useRef<HTMLDivElement>(null);

  // Apply settings to audio managers whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sm = require('@/managers/SoundManager').SoundManager.getInstance();
      const mm = require('@/managers/MusicManager').MusicManager.getInstance();
      
      sm.setMasterVolume(settings.masterVolume);
      sm.setSFXVolume(settings.sfxVolume);
      sm.setMusicVolume(settings.musicVolume);
      mm.updateVolume();
    }
  }, [settings.masterVolume, settings.sfxVolume, settings.musicVolume]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on backdrop click (not panel)
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="sq-overlay-backdrop"
      onMouseDown={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="sq-overlay-panel" ref={panelRef}>
        {/* Header */}
        <div className="sq-overlay-header">
          <h2 className="sq-overlay-title">SETTINGS</h2>
          <button
            className="sq-overlay-close"
            onClick={() => { onClick?.(); onClose(); }}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="sq-settings-group">
          {/* Audio section */}
          <p className="sq-settings-section-title">— AUDIO —</p>

          <SliderRow
            label="MASTER VOL"
            value={settings.masterVolume}
            onChange={(v) => updateSettings({ masterVolume: v })}
            onHover={onHover}
          />
          <SliderRow
            label="MUSIC VOL"
            value={settings.musicVolume}
            onChange={(v) => updateSettings({ musicVolume: v })}
            onHover={onHover}
          />
          <SliderRow
            label="SFX VOL"
            value={settings.sfxVolume}
            onChange={(v) => updateSettings({ sfxVolume: v })}
            onHover={onHover}
          />

          {/* Game section */}
          <p className="sq-settings-section-title" style={{ marginTop: "0.75rem" }}>— GAMEPLAY —</p>

          <ToggleRow
            label="SCREEN SHAKE"
            value={settings.screenShake}
            onChange={(v) => updateSettings({ screenShake: v })}
            onHover={onHover}
          />
          <ToggleRow
            label="PARTICLES"
            value={settings.particlesEnabled}
            onChange={(v) => updateSettings({ particlesEnabled: v })}
            onHover={onHover}
          />
          <ToggleRow
            label="SHOW FPS"
            value={settings.showFPS}
            onChange={(v) => updateSettings({ showFPS: v })}
            onHover={onHover}
          />

          {/* Difficulty */}
          <p className="sq-settings-section-title" style={{ marginTop: "0.75rem" }}>— DIFFICULTY —</p>
          <div className="sq-settings-row">
            <span className="sq-settings-label">DIFFICULTY</span>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              {(["easy", "normal", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onMouseEnter={onHover}
                  onClick={() => { onClick?.(); updateSettings({ difficulty: d }); }}
                  style={{
                    all:          "unset",
                    cursor:       "pointer",
                    fontFamily:   "var(--font-mono-sq)",
                    fontSize:     "0.68rem",
                    letterSpacing: "0.15em",
                    padding:      "4px 10px",
                    borderRadius: "6px",
                    textTransform: "uppercase",
                    border:       `1px solid ${settings.difficulty === d ? "rgba(255,0,102,0.6)" : "rgba(255,255,255,0.1)"}`,
                    background:   settings.difficulty === d ? "rgba(255,0,102,0.12)" : "rgba(255,255,255,0.03)",
                    color:        settings.difficulty === d ? "#FF0066" : "rgba(255,255,255,0.4)",
                    boxShadow:    settings.difficulty === d ? "0 0 10px rgba(255,0,102,0.2)" : "none",
                    transition:   "all 150ms",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Symbol trio at the bottom */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem", opacity: 0.4 }}>
          <SymbolTrio size={12} gap={10} glow={false} />
        </div>
      </div>
    </div>
  );
}