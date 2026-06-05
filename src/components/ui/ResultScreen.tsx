import React from "react";
import { motion } from "framer-motion";

export interface ResultProps {
  outcome: "victory" | "eliminated";
  statLine?: string;
  survived?: number;
  played?: number;
  total?: number;
  prize?: number;
  onTryAgain?: () => void;
  onMenu?: () => void;
}

export const ResultScreen: React.FC<ResultProps> = ({
  outcome,
  statLine,
  survived,
  played,
  total,
  prize,
  onTryAgain,
  onMenu
}) => {
  const isVictory = outcome === "victory";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`absolute inset-0 flex flex-col items-center justify-center z-[100] ${
        isVictory ? "bg-green-950/90" : "bg-red-950/90"
      } backdrop-blur-md`}
    >
      <motion.h1
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring" }}
        className={`text-6xl md:text-8xl font-black uppercase tracking-widest ${
          isVictory ? "text-green-400" : "text-red-500"
        } drop-shadow-2xl mb-4 text-center`}
      >
        {isVictory ? "Victory" : "Eliminated"}
      </motion.h1>

      {statLine && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-white/90 font-mono text-xl md:text-2xl tracking-widest text-center px-4"
        >
          {statLine}
        </motion.div>
      )}

      {(survived !== undefined || played !== undefined || total !== undefined || prize !== undefined) && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex flex-wrap justify-center gap-8 text-white/70 font-mono text-sm tracking-widest uppercase"
        >
          {survived !== undefined && <span>Survived: {survived}</span>}
          {played !== undefined && <span>Played: {played}</span>}
          {total !== undefined && <span>Total: {total}</span>}
          {prize !== undefined && <span className="text-yellow-400">Prize Pool: ₩{prize.toLocaleString()}</span>}
        </motion.div>
      )}

      {/* Action Buttons */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-12 flex gap-6"
      >
        {onTryAgain && (
          <button 
            onClick={onTryAgain}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-mono uppercase tracking-widest transition-colors cursor-pointer"
          >
            Try Again
          </button>
        )}
        {onMenu && (
          <button 
            onClick={onMenu}
            className="px-8 py-3 bg-red-600/80 hover:bg-red-500 text-white border border-red-400/50 font-mono uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(220,38,38,0.5)] cursor-pointer"
          >
            Main Menu
          </button>
        )}
      </motion.div>
    </motion.div>
  );
};