"use client";
import GameRouter from "@/components/layout/GameRouter";

export default function Page() {
  return (
    <main style={{ width: "100vw", height: "100dvh", position: "relative", overflow: "hidden", background: "#000" }}>
      <GameRouter />
    </main>
  );
}