// src/components/ui/SquidSymbols.tsx
//
// Reusable geometric symbol primitives — circle, triangle, square.
// Faithfully reproduced from the zip's design scope (SquidShapes.tsx).
// Use throughout the UI for consistent visual identity.

"use client";

import React from "react";

interface ShapeProps {
  size?:      number;
  color?:     string;
  glow?:      boolean;
  className?: string;
  animate?:   boolean;
  style?:     React.CSSProperties;
}

export const CircleSymbol: React.FC<ShapeProps> = ({
  size = 32,
  color = "#FF0066",
  glow = false,
  className = "",
  animate = false,
  style,
}) => (
  <div
    className={className}
    style={{
      width:        size,
      height:       size,
      borderRadius: "50%",
      border:       `2px solid ${color}`,
      flexShrink:   0,
      boxShadow:    glow ? `0 0 12px ${color}90, 0 0 24px ${color}40` : "none",
      animation:    animate ? "sq-float 6s ease-in-out infinite" : undefined,
      ...style,
    }}
  />
);

export const TriangleSymbol: React.FC<ShapeProps> = ({
  size = 32,
  color = "#00FFB2",
  glow = false,
  className = "",
  animate = false,
  style,
}) => (
  <div
    className={className}
    style={{
      width:     size,
      height:    size,
      flexShrink: 0,
      animation: animate ? "sq-float 6s ease-in-out 0.4s infinite" : undefined,
      ...style,
    }}
  >
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <polygon
        points="50,6 94,94 6,94"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinejoin="round"
        filter={glow ? `drop-shadow(0 0 7px ${color})` : undefined}
      />
    </svg>
  </div>
);

export const SquareSymbol: React.FC<ShapeProps> = ({
  size = 32,
  color = "#FF0066",
  glow = false,
  className = "",
  animate = false,
  style,
}) => (
  <div
    className={className}
    style={{
      width:      size,
      height:     size,
      border:     `2px solid ${color}`,
      flexShrink: 0,
      boxShadow:  glow ? `0 0 12px ${color}90, 0 0 24px ${color}40` : "none",
      animation:  animate ? "sq-float 6s ease-in-out 0.8s infinite" : undefined,
      ...style,
    }}
  />
);

/** The canonical circle–triangle–square trio used as a visual signature */
export const SymbolTrio: React.FC<{
  size?:      number;
  gap?:       number;
  glow?:      boolean;
  animate?:   boolean;
  className?: string;
}> = ({ size = 20, gap = 12, glow = true, animate = false, className = "" }) => (
  <div
    className={className}
    style={{ display: "flex", alignItems: "center", gap }}
  >
    <CircleSymbol   size={size} color="#FF0066" glow={glow} animate={animate} />
    <TriangleSymbol size={size} color="#00FFB2" glow={glow} animate={animate} />
    <SquareSymbol   size={size} color="#FF0066" glow={glow} animate={animate} />
  </div>
);