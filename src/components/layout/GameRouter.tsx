// src/components/layout/GameRouter.tsx

"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useGameStore, type GameId } from "@/store/gameStore";
import { usePlatformDetection } from "@/hooks/usePlatformDetection";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import GameShell from "@/components/GameShell";
import GameMenu from "@/components/ui/GameMenu";

// FIX: Use Next.js dynamic imports and strictly disable SSR to prevent the WebGL/React 19 crash
const DalgonaCandy = dynamic(() => import("@/components/games/DalgonaCandy"), { ssr: false });
const GlassBridge = dynamic(() => import("@/components/games/GlassBridge"), { ssr: false });
const RedLightGreenLight = dynamic(() => import("@/components/games/RedLightGreenLight"), { ssr: false });

export default function GameRouter() {
  const activeGame = useGameStore((s) => s.activeGame);
  const setActiveGame = useGameStore((s) => s.setActiveGame);
  const runtimePhase = useGameStore((s) => s.runtimePhase);

  usePlatformDetection();

  // WIRING IN THE MUSIC MANAGER (This smart hook handles play/pause/fade automatically)
  useBackgroundMusic();

  // Stable ref — prevents duplicate event listener accumulation on shell mounts
  const handleExit = useCallback(() => setActiveGame("menu"), [setActiveGame]);

  // BUG FIX: handleComplete was referenced in JSX but never defined, causing a runtime
  // crash on every game victory. Now defined as a stable callback that returns the player
  // to the menu after a win — extend this with leaderboard / session-history calls as needed.
  const handleComplete = useCallback(() => setActiveGame("menu"), [setActiveGame]);

  const [transitionState, setTransitionState] = useState("idle");
  const prevGameRef = useRef(activeGame);

  useEffect(() => {
    if (prevGameRef.current === activeGame) return;
    
    // Cleanup audio when switching games
    if (typeof window !== 'undefined') {
      const { SoundManager } = require('@/managers/SoundManager');
      const { MusicManager } = require('@/managers/MusicManager');
      SoundManager.getInstance().stopAll(0);
      SoundManager.getInstance().stopAllLoops(0);
      MusicManager.getInstance().stopAll();
    }
    
    prevGameRef.current = activeGame;

    setTransitionState("entering");

    const t1 = setTimeout(() => setTransitionState("active"),  200);
    const t2 = setTimeout(() => setTransitionState("leaving"), 300);
    const t3 = setTimeout(() => setTransitionState("idle"),    500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [activeGame]);

  return (
    <div className="game-router-root" data-game={activeGame} style={{ width: "100%", height: "100%" }}>
      <div
        className="transition-curtain"
        aria-hidden="true"
        data-state={runtimePhase}
      />

      <Suspense fallback={<LoadingScreen />}>
        {activeGame === "menu" && (
          <GameMenu onLaunch={(id: GameId) => setActiveGame(id)} />
        )}

        {activeGame === "glass-bridge" && (
          <SceneWrapper key="glass-bridge" transition={transitionState} showGlobalHUD={false}>
            {/* BUG FIX: onComplete was missing — victories were silently dropped */}
            <GlassBridge onExit={handleExit} onComplete={handleComplete} />
          </SceneWrapper>
        )}

        {activeGame === "red-light-green-light" && (
          <SceneWrapper key="red-light-green-light" transition={transitionState} showGlobalHUD={false}>
            {/* BUG FIX: handleComplete is now defined above and wired in here */}
            <RedLightGreenLight onExit={handleExit} onComplete={handleComplete} />
          </SceneWrapper>
        )}

        {activeGame === "dalgona" && (
          <GameShell key="dalgona" worldW={390} worldH={844} transition={transitionState}>
            {/* BUG FIX: onComplete was missing — victories were silently dropped */}
            <DalgonaCandy onExit={handleExit} onComplete={handleComplete} />
          </GameShell>
        )}
      </Suspense>
    </div>
  );
}

function SceneWrapper({
  children,
  transition = "idle",
  showGlobalHUD = true,
}: {
  children: React.ReactNode;
  transition?: string;
  showGlobalHUD?: boolean;
}) {
  return (
    <GameShell worldW={1280} worldH={720} transition={transition} showGlobalHUD={showGlobalHUD}>
      {children}
    </GameShell>
  );
}

function LoadingScreen() {
  return (
    <div style={{ color: "white", display: "flex", justifyContent: "center", alignItems: "center", height: "100%", background: "#000" }}>
      <span style={{ fontFamily: "monospace", letterSpacing: "2px" }}>LOADING SYSTEM...</span>
    </div>
  );
}