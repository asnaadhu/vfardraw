import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronRight, Sparkles } from 'lucide-react';
import { Winner } from '../types';
import { soundEngine } from '../utils/audio';

interface RecentWinnersBarProps {
  winners: Winner[];
  onOpenWinnersTab: () => void;
}

export function RecentWinnersBar({ winners, onOpenWinnersTab }: RecentWinnersBarProps) {
  if (!winners || winners.length === 0) return null;

  // Show up to 5 most recent winners
  const recentList = [...winners].reverse().slice(0, 6);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-4 sm:pb-6 relative z-20">
      <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Title */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Recent Winners
          </span>
          <span className="text-[11px] text-slate-500">({winners.length} total)</span>
        </div>

        {/* Horizontal Card Chips */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          <AnimatePresence mode="popLayout">
            {recentList.map((w, idx) => (
              <motion.div
                key={`${w.id}-${w.rank}`}
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  idx === 0
                    ? 'bg-slate-800 border-slate-700 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800/80 text-slate-300'
                }`}
              >
                <span className="font-mono text-[10px] text-amber-400 font-bold">
                  #{w.rank}
                </span>
                <span className="font-bold text-white max-w-[110px] truncate">{w.name}</span>
                <span className="text-[10px] text-slate-400 max-w-[90px] truncate hidden md:inline">
                  {w.dept}
                </span>
                {idx === 0 && <Sparkles className="w-3 h-3 text-amber-400" />}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* View All button */}
        <button
          onClick={() => {
            soundEngine.playClick();
            onOpenWinnersTab();
          }}
          className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 whitespace-nowrap pl-1 sm:pl-0 transition-colors"
        >
          <span>View All</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
