import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Award, Sparkles, AlertCircle, ChevronRight, ChevronLeft, CheckCircle2, RotateCcw, Users, ArrowRight } from 'lucide-react';
import { DrawState, StaffMember, Winner } from '../types';
import { soundEngine } from '../utils/audio';
import { fireGrandConfetti, fireContinuousSideCannons } from '../utils/confetti';

interface DrawStageProps {
  state: DrawState;
  onDrawComplete: (updatedState: DrawState, newWinner: Winner) => void;
  onNavigatePrize: (newIndex: number) => void;
  onOpenSettings: (tab?: 'setup' | 'winners' | 'rules') => void;
  onRedrawWinner: (winner: Winner) => void;
}

export function DrawStage({
  state,
  onDrawComplete,
  onNavigatePrize,
  onOpenSettings,
  onRedrawWinner,
}: DrawStageProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [rollingCandidate, setRollingCandidate] = useState<StaffMember | null>(null);
  const [rollSecondsLeft, setRollSecondsLeft] = useState<number>(8);
  const [rollProgress, setRollProgress] = useState<number>(0);
  const rollTimeoutRef = useRef<number | null>(null);

  const TOTAL_ROLL_MS = 8000; // 8 seconds roll duration

  const { prizes, cat1, cat2, cat3, currentPrizeIndex, tierRules, winners } = state;
  const currentRank = currentPrizeIndex + 1;
  const currentPrizeName = prizes[currentPrizeIndex] || '';
  const isFinished = prizes.length > 0 && winners.length >= prizes.length && currentPrizeIndex >= prizes.length;
  const hasNoPrizes = prizes.length === 0;

  // Check if current prize rank already has a winner recorded
  const currentPrizeWinner = winners.find(w => w.rank === currentRank);

  // Compute eligible pool based on rank and tier rules
  const getEligiblePool = (rank: number): { pool: StaffMember[]; tierName: string; isFallback: boolean } => {
    if (rank <= tierRules.cat1Cutoff) {
      if (cat1.length > 0) {
        return { pool: cat1, tierName: 'Category 1 (Grand Tier)', isFallback: false };
      } else if (cat2.length > 0) {
        return { pool: cat2, tierName: 'Category 2 (Fallback - Cat 1 empty)', isFallback: true };
      } else if (cat3.length > 0) {
        return { pool: cat3, tierName: 'Category 3 (Fallback - Cat 1 & 2 empty)', isFallback: true };
      } else {
        return { pool: [], tierName: 'No Eligible Staff Remaining', isFallback: false };
      }
    } else if (rank <= tierRules.cat2Cutoff) {
      const combined = [...cat1, ...cat2];
      if (combined.length > 0) {
        return { pool: combined, tierName: 'Category 1 & 2 (Tier 2 Gifts)', isFallback: false };
      } else if (cat3.length > 0) {
        return { pool: cat3, tierName: 'Category 3 (Fallback - Cat 1 & 2 empty)', isFallback: true };
      } else {
        return { pool: [], tierName: 'No Eligible Staff Remaining', isFallback: false };
      }
    } else {
      const all = [...cat1, ...cat2, ...cat3];
      return { pool: all, tierName: 'Open to All Categories', isFallback: false };
    }
  };

  const eligibleInfo = getEligiblePool(currentRank);
  const visualPool = [...cat1, ...cat2, ...cat3];

  // Execute Lucky Draw Routine (rolls for exactly 8 seconds)
  const executeDraw = () => {
    if (isDrawing || hasNoPrizes || isFinished || !!currentPrizeWinner) return;

    const { pool } = getEligiblePool(currentRank);
    if (pool.length === 0 || visualPool.length === 0) {
      soundEngine.playClick();
      return;
    }

    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
    }

    setIsDrawing(true);
    setRollSecondsLeft(8);
    setRollProgress(0);
    soundEngine.playTick(1.0);

    const startTime = performance.now();
    let lastPulseSec = 9;

    const step = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / TOTAL_ROLL_MS);
      const remainingMs = Math.max(0, TOTAL_ROLL_MS - elapsed);
      const remainingSec = Math.ceil(remainingMs / 1000);

      setRollProgress(progress);
      setRollSecondsLeft(remainingSec || 1);

      // Decoy candidate flip
      const randomDecoy = visualPool[Math.floor(Math.random() * visualPool.length)];
      setRollingCandidate(randomDecoy);

      // Pitch-rising tick sound
      soundEngine.playTick(0.8 + progress * 0.95);

      // Periodic rising tension pulse
      if (remainingSec !== lastPulseSec && remainingSec <= 7) {
        lastPulseSec = remainingSec;
        soundEngine.playTensionPulse(progress);
      }

      if (elapsed < TOTAL_ROLL_MS) {
        // Dynamic pacing curve across 8 seconds:
        // 0s - 5.5s (progress < 0.68): Rapid high-energy cycling (55ms)
        // 5.5s - 7.0s (0.68 <= progress < 0.88): Gradual deceleration (70ms -> 180ms)
        // 7.0s - 7.7s (0.88 <= progress < 0.96): Dramatic suspense flips (220ms -> 360ms)
        // 7.7s - 8.0s (progress >= 0.96): Final suspense climax before 8.0s
        let nextDelay = 55;
        if (progress >= 0.96) {
          nextDelay = Math.min(remainingMs, 400);
        } else if (progress >= 0.88) {
          const subProgress = (progress - 0.88) / (0.96 - 0.88);
          nextDelay = 200 + subProgress * 160;
        } else if (progress >= 0.68) {
          const subProgress = (progress - 0.68) / (0.88 - 0.68);
          nextDelay = 65 + subProgress * 135;
        } else {
          nextDelay = 55;
        }

        const safeDelay = Math.min(nextDelay, remainingMs > 0 ? remainingMs : 10);
        rollTimeoutRef.current = window.setTimeout(step, safeDelay);
      } else {
        // 8 SECONDS COMPLETE: Pick Winner!
        const winnerIndex = Math.floor(Math.random() * pool.length);
        const actualWinner = pool[winnerIndex];

        // Remove winner from specific category pool
        const newCat1 = cat1.filter(s => s.id !== actualWinner.id);
        const newCat2 = cat2.filter(s => s.id !== actualWinner.id);
        const newCat3 = cat3.filter(s => s.id !== actualWinner.id);

        const newWinnerObj: Winner = {
          ...actualWinner,
          rank: currentRank,
          prize: currentPrizeName,
          timestamp: Date.now(),
        };

        const remainingWinners = state.winners.filter(w => w.rank !== currentRank);
        const newWinnersList = [...remainingWinners, newWinnerObj].sort((a, b) => a.rank - b.rank);

        const updatedState: DrawState = {
          ...state,
          cat1: newCat1,
          cat2: newCat2,
          cat3: newCat3,
          winners: newWinnersList,
          currentPrizeIndex: currentPrizeIndex,
        };

        setRollingCandidate(null);
        setIsDrawing(false);
        setRollProgress(0);

        // Sound & Confetti celebration
        soundEngine.playFanfare();
        fireGrandConfetti();
        fireContinuousSideCannons(2500);

        onDrawComplete(updatedState, newWinnerObj);
      }
    };

    rollTimeoutRef.current = window.setTimeout(step, 55);
  };

  // Unmount safety cleanup
  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) {
        clearTimeout(rollTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcut handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (isDrawing) return;

        if (currentPrizeWinner) {
          // If prize is already drawn, pressing space moves to next prize
          if (currentPrizeIndex < prizes.length - 1) {
            onNavigatePrize(currentPrizeIndex + 1);
          }
        } else if (!hasNoPrizes && eligibleInfo.pool.length > 0) {
          executeDraw();
        }
      } else if (e.code === 'ArrowRight') {
        if (!isDrawing && currentPrizeIndex < prizes.length - 1) {
          onNavigatePrize(currentPrizeIndex + 1);
        }
      } else if (e.code === 'ArrowLeft') {
        if (!isDrawing && currentPrizeIndex > 0) {
          onNavigatePrize(currentPrizeIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawing, isFinished, hasNoPrizes, currentPrizeIndex, currentPrizeWinner, eligibleInfo.pool.length, prizes.length, cat1, cat2, cat3]);

  // Initials generator
  const getInitials = (name: string) => {
    if (!name) return '★';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-8 max-w-4xl mx-auto w-full relative z-10">
      {/* Background Ambience Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[540px] h-[340px] sm:h-[540px] bg-gradient-to-tr from-indigo-600/10 via-purple-600/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Prize Badge & Navigation */}
      <div className="w-full text-center mb-3 sm:mb-5">
        {hasNoPrizes ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            <span>No prizes in list. Open Settings to load or configure prizes.</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {/* Big Prize Title */}
            <motion.h2
              key={currentPrizeName}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white px-2 py-0.5 max-w-3xl"
            >
              {currentPrizeName}
            </motion.h2>
          </div>
        )}
      </div>

      {/* Center Stage Card */}
      <div className="relative my-2 sm:my-3">
        {/* Glowing Aura Ring */}
        <div className={`absolute inset-0 -m-3 rounded-3xl transition-all duration-700 blur-xl ${
          isDrawing
            ? 'bg-indigo-500/25 scale-105'
            : currentPrizeWinner
            ? 'bg-emerald-500/15'
            : 'bg-slate-800/30'
        }`} />

        <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center overflow-hidden transition-all">
          {/* Subtle Grid Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

          {/* Card Content State */}
          <AnimatePresence mode="wait">
            {isDrawing && rollingCandidate ? (
              /* Rolling State */
              <motion.div
                key="rolling"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center gap-3 w-full h-full relative z-10"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-3xl sm:text-4xl font-extrabold shadow-lg shadow-indigo-600/30 border border-indigo-400/30 animate-pulse">
                  {getInitials(rollingCandidate.name)}
                </div>

                <div className="w-full overflow-hidden px-2">
                  <div className="text-xl sm:text-2xl font-bold text-white truncate">
                    {rollingCandidate.name}
                  </div>
                  <div className="text-xs text-indigo-400 font-mono tracking-wider mt-0.5 font-medium">
                    {rollingCandidate.id}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {rollingCandidate.dept}
                  </div>
                </div>

                {/* Animated Rolling Badge & Countdown */}
                <div className="mt-1 flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-950/90 border border-indigo-500/40 text-indigo-300 text-xs font-bold tracking-wider uppercase shadow-md">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  <span>Rolling Winner ({rollSecondsLeft}s)</span>
                </div>

                {/* 8-Second Suspense Progress Line */}
                <div className="w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 border border-slate-700/50">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-75 ease-linear"
                    style={{ width: `${Math.round(rollProgress * 100)}%` }}
                  />
                </div>
              </motion.div>
            ) : currentPrizeWinner ? (
              /* Winner Revealed State */
              <motion.div
                key={`winner-${currentPrizeWinner.id}-${currentRank}`}
                initial={{ opacity: 0, scale: 0.7, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 14, stiffness: 180 }}
                className="flex flex-col items-center justify-center gap-2.5 w-full h-full relative z-10"
              >
                {/* Winner Crown Tag */}
                <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider shadow-sm">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>Winner Selected</span>
                </div>

                {/* Avatar Initials */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800 border border-slate-700 p-0.5 shadow-xl">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-white text-3xl sm:text-4xl font-extrabold tracking-wider">
                    {getInitials(currentPrizeWinner.name)}
                  </div>
                </div>

                {/* Winner Name & Details */}
                <div className="w-full px-2">
                  <h3 className="text-xl sm:text-2xl font-bold text-white truncate">
                    {currentPrizeWinner.name}
                  </h3>
                  <p className="text-xs text-indigo-400 font-mono tracking-wider font-semibold">
                    {currentPrizeWinner.id}
                  </p>
                  <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
                    {currentPrizeWinner.dept}
                  </p>
                </div>
              </motion.div>
            ) : (
              /* Ready / Empty Idle State */
              <motion.div
                key={`idle-${currentRank}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-3 relative z-10"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner">
                  <Gift className="w-10 h-10 sm:w-12 sm:h-12 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">Ready for Draw</h3>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-2.5 w-full max-w-sm mt-2">
        {currentPrizeWinner ? (
          /* Prize Already Drawn Controls */
          <div className="flex flex-col gap-2 w-full">
            {currentPrizeIndex < prizes.length - 1 ? (
              <button
                id="next-prize-btn"
                onClick={() => {
                  soundEngine.playClick();
                  onNavigatePrize(currentPrizeIndex + 1);
                }}
                className="w-full py-3.5 px-6 rounded-xl font-bold text-sm sm:text-base tracking-wide shadow-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Proceed to Prize #{currentRank + 1}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-full py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold text-center text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>All {prizes.length} Prizes Completed!</span>
              </div>
            )}

            {/* Redraw Button */}
            <button
              id="redraw-current-btn"
              onClick={() => {
                soundEngine.playClick();
                onRedrawWinner(currentPrizeWinner);
              }}
              className="w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Redraw Prize #{currentRank}</span>
            </button>
          </div>
        ) : (
          /* Ready to Draw Button */
          <button
            id="main-draw-btn"
            onClick={executeDraw}
            disabled={isDrawing || hasNoPrizes || eligibleInfo.pool.length === 0}
            className={`w-full py-4 px-8 rounded-xl font-bold text-base sm:text-lg tracking-wide shadow-xl transition-all duration-200 transform active:scale-95 flex items-center justify-center gap-2.5 ${
              isDrawing
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                : hasNoPrizes || eligibleInfo.pool.length === 0
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:shadow-indigo-600/50 cursor-pointer'
            }`}
          >
            {isDrawing ? (
              <>
                <Sparkles className="w-5 h-5 animate-spin" />
                <span>Rolling Winner ({rollSecondsLeft}s)...</span>
              </>
            ) : hasNoPrizes ? (
              <span>Load Prizes in Settings</span>
            ) : eligibleInfo.pool.length === 0 ? (
              <span>No Staff Left in Pool</span>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Draw Winner</span>
              </>
            )}
          </button>
        )}

        {/* Navigation & Keyboard shortcuts */}
        <div className="flex items-center justify-between w-full px-2 text-xs text-slate-400 mt-1">
          <button
            onClick={() => onNavigatePrize(Math.max(0, currentPrizeIndex - 1))}
            disabled={currentPrizeIndex <= 0 || isDrawing}
            className="flex items-center gap-1 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev Prize
          </button>

          <span className="text-[11px] font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            [Spacebar / Enter]
          </span>

          <button
            onClick={() => onNavigatePrize(Math.min(prizes.length - 1, currentPrizeIndex + 1))}
            disabled={currentPrizeIndex >= prizes.length - 1 || isDrawing}
            className="flex items-center gap-1 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
          >
            Next Prize <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {prizes.length > 0 && (
        <div className="w-full max-w-md mt-5 px-4">
          <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
            <span>Draw Progress</span>
            <span>{winners.length} of {prizes.length} Awarded ({Math.round((winners.length / prizes.length) * 100)}%)</span>
          </div>
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <motion.div
              className="h-full bg-indigo-600"
              initial={{ width: 0 }}
              animate={{ width: `${(winners.length / prizes.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

