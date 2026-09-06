import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Award, Sparkles, AlertCircle, ChevronRight, ChevronLeft, CheckCircle2, RotateCcw, ArrowRight } from 'lucide-react';
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

const CARD_HEIGHT = 80; // Height of each card in pixels
const TOTAL_ROLL_MS = 8000; // Exact 8-second rolling duration

// Generate fast-rolling randomized track using ALL ACTIVE staff members (including the winner) during the roll without adjacent repeats
function generateNonRepeatingReel(
  allActiveStaff: StaffMember[],
  winner: StaffMember,
  targetCount: number = 100
): StaffMember[] {
  const winnerId = winner.id.toLowerCase().trim();

  // Deduplicate all active staff members by ID
  const uniqueMap = new Map<string, StaffMember>();
  for (const member of allActiveStaff) {
    const key = member.id.toLowerCase().trim();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, member);
    }
  }

  // Ensure winner is in the active candidate set
  if (!uniqueMap.has(winnerId)) {
    uniqueMap.set(winnerId, winner);
  }

  const allCandidates = Array.from(uniqueMap.values());
  if (allCandidates.length <= 1) {
    return [winner];
  }

  const track: StaffMember[] = [];
  const requiredCount = Math.max(12, targetCount);

  while (track.length < requiredCount - 1) {
    // Fisher-Yates shuffle all active candidates (EVERY active person, including the winner, rolls through the stream!)
    const cycle = [...allCandidates];
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }

    // Ensure no adjacent duplicate across cycle boundaries
    if (track.length > 0 && cycle.length > 1 && track[track.length - 1].id === cycle[0].id) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }

    for (const item of cycle) {
      if (track.length >= requiredCount - 1) break;
      // Guarantee zero adjacent duplicate names
      if (track.length > 0 && track[track.length - 1].id === item.id && cycle.length > 1) {
        continue;
      }
      track.push(item);
    }
  }

  // Ensure the card immediately before the final landing card is NOT the winner
  // so the final deceleration click onto the winner is distinct and exciting
  const otherCandidates = allCandidates.filter(c => c.id.toLowerCase().trim() !== winnerId);
  if (otherCandidates.length > 0 && track.length > 0) {
    const lastItem = track[track.length - 1];
    if (lastItem.id.toLowerCase().trim() === winnerId) {
      const randomOther = otherCandidates[Math.floor(Math.random() * otherCandidates.length)];
      track[track.length - 1] = randomOther;
    }
  }

  // The track finishes precisely by locking onto the selected winner at the landing target
  track.push(winner);
  return track;
}

export function DrawStage({
  state,
  onDrawComplete,
  onNavigatePrize,
  onOpenSettings,
  onRedrawWinner,
}: DrawStageProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [rollSecondsLeft, setRollSecondsLeft] = useState<number>(8);
  const [reelList, setReelList] = useState<StaffMember[]>([]);

  const reelRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const winnerPendingRef = useRef<{ state: DrawState; winner: Winner } | null>(null);

  const { prizes, cat1, cat2, cat3, currentPrizeIndex, tierRules, winners } = state;
  const currentRank = currentPrizeIndex + 1;
  const currentPrizeName = prizes[currentPrizeIndex] || '';
  const isFinished = prizes.length > 0 && winners.length >= prizes.length && currentPrizeIndex >= prizes.length;
  const hasNoPrizes = prizes.length === 0;

  // Check if current prize rank already has a winner recorded
  const currentPrizeWinner = winners.find(w => w.rank === currentRank);

  // Guaranteed single-win rule: Set of all existing winner IDs and normalized names
  const previousWinners = useMemo(() => winners.filter(w => w.rank !== currentRank), [winners, currentRank]);
  const winnerIdSet = useMemo(() => new Set(previousWinners.map(w => w.id.toLowerCase().trim())), [previousWinners]);
  const winnerNameSet = useMemo(() => new Set(previousWinners.map(w => w.name.toLowerCase().trim())), [previousWinners]);

  // Active candidate pools strictly excluding anyone who has already won any gift
  const activeCat1 = useMemo(() => cat1.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim())), [cat1, winnerIdSet, winnerNameSet]);
  const activeCat2 = useMemo(() => cat2.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim())), [cat2, winnerIdSet, winnerNameSet]);
  const activeCat3 = useMemo(() => cat3.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim())), [cat3, winnerIdSet, winnerNameSet]);

  // Compute eligible pool based on rank and tier rules (strictly excluding previous winners)
  const getEligiblePool = (rank: number): { pool: StaffMember[]; tierName: string; isFallback: boolean } => {
    if (rank <= tierRules.cat1Cutoff) {
      if (activeCat1.length > 0) {
        return { pool: activeCat1, tierName: 'Category 1 (Grand Tier)', isFallback: false };
      } else if (activeCat2.length > 0) {
        return { pool: activeCat2, tierName: 'Category 2 (Fallback - Cat 1 empty)', isFallback: true };
      } else if (activeCat3.length > 0) {
        return { pool: activeCat3, tierName: 'Category 3 (Fallback - Cat 1 & 2 empty)', isFallback: true };
      } else {
        return { pool: [], tierName: 'No Eligible Staff Remaining', isFallback: false };
      }
    } else if (rank <= tierRules.cat2Cutoff) {
      const combined = [...activeCat1, ...activeCat2];
      if (combined.length > 0) {
        return { pool: combined, tierName: 'Category 1 & 2 (Tier 2 Gifts)', isFallback: false };
      } else if (activeCat3.length > 0) {
        return { pool: activeCat3, tierName: 'Category 3 (Fallback - Cat 1 & 2 empty)', isFallback: true };
      } else {
        return { pool: [], tierName: 'No Eligible Staff Remaining', isFallback: false };
      }
    } else {
      const all = [...activeCat1, ...activeCat2, ...activeCat3];
      return { pool: all, tierName: 'Open to All Categories', isFallback: false };
    }
  };

  const eligibleInfo = getEligiblePool(currentRank);
  const visualPool = useMemo(() => [...activeCat1, ...activeCat2, ...activeCat3], [activeCat1, activeCat2, activeCat3]);

  // Execute Lucky Draw with real GPU hardware accelerated 8-second reel track
  const executeDraw = () => {
    if (isDrawing || hasNoPrizes || isFinished || !!currentPrizeWinner) return;

    const { pool } = getEligiblePool(currentRank);
    if (pool.length === 0 || visualPool.length === 0) {
      soundEngine.playClick();
      return;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    // 1. Pick the actual winning candidate upfront
    const winnerIndex = Math.floor(Math.random() * pool.length);
    const actualWinner = pool[winnerIndex];
    const winnerIdNorm = actualWinner.id.toLowerCase().trim();
    const winnerNameNorm = actualWinner.name.toLowerCase().trim();

    // 2. Prepare the updated state with winner removed from all categories (1 person = 1 gift)
    const newCat1 = cat1.filter(s => s.id.toLowerCase().trim() !== winnerIdNorm && s.name.toLowerCase().trim() !== winnerNameNorm);
    const newCat2 = cat2.filter(s => s.id.toLowerCase().trim() !== winnerIdNorm && s.name.toLowerCase().trim() !== winnerNameNorm);
    const newCat3 = cat3.filter(s => s.id.toLowerCase().trim() !== winnerIdNorm && s.name.toLowerCase().trim() !== winnerNameNorm);

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

    winnerPendingRef.current = { state: updatedState, winner: newWinnerObj };

    // 3. Generate high-speed rolling track containing ALL active non-winning staff across all categories
    const track = generateNonRepeatingReel(visualPool, actualWinner, 100);

    setReelList(track);
    setIsDrawing(true);

    const totalReelCount = track.length;
    const targetDistance = (totalReelCount - 1) * CARD_HEIGHT;
    setRollSecondsLeft(8);

    // Continuous Physics Profile across exact 8000ms:
    // Phase 1: Rapid Acceleration (0 to 400ms)
    // Phase 2: High-Velocity Sustained Cruise (400ms to 5200ms) -> "keeps rolling and rolling and rolling"
    // Phase 3: Smooth Flywheel Deceleration (5200ms to 8000ms) -> Glides down to 0 velocity exactly on winner!
    const t1 = 400; // ms
    const t2 = 5200; // ms
    const t3 = 8000; // ms
    const tDecel = t3 - t2; // 2800 ms

    const totalTimeWeight = 0.2 + 4.8 + (tDecel / 1000) / 3;
    const cruiseVelocity = targetDistance / totalTimeWeight; // px/sec

    const d1 = 0.5 * cruiseVelocity * (t1 / 1000);
    const d2 = cruiseVelocity * ((t2 - t1) / 1000);

    const computeCurrentY = (elapsedMs: number): { y: number; speed: number } => {
      if (elapsedMs <= 0) return { y: 0, speed: 0 };
      if (elapsedMs >= t3) return { y: targetDistance, speed: 0 };

      if (elapsedMs <= t1) {
        const ratio = elapsedMs / t1;
        const currentSpeed = cruiseVelocity * ratio;
        const y = 0.5 * cruiseVelocity * (elapsedMs / 1000) * ratio;
        return { y, speed: currentSpeed };
      } else if (elapsedMs <= t2) {
        const elapsedCruiseSec = (elapsedMs - t1) / 1000;
        const y = d1 + cruiseVelocity * elapsedCruiseSec;
        return { y, speed: cruiseVelocity };
      } else {
        const u = (elapsedMs - t2) / tDecel;
        const decelFactor = (1 - Math.pow(1 - u, 3)) / 3;
        const currentSpeed = cruiseVelocity * Math.pow(1 - u, 2);
        const y = d1 + d2 + cruiseVelocity * (tDecel / 1000) * decelFactor;
        return { y: Math.min(targetDistance, y), speed: currentSpeed };
      }
    };

    const startTime = performance.now();
    let lastSecond = 8;
    let lastTickTime = 0;
    let lastCardIndex = 0;
    let lastPulseSec = 9;

    // Reset reel position before starting RAF physics loop
    if (reelRef.current) {
      reelRef.current.style.transition = 'none';
      reelRef.current.style.transform = 'translate3d(0, 0px, 0)';
    }

    const physicsLoop = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / TOTAL_ROLL_MS);
      const remainingMs = Math.max(0, TOTAL_ROLL_MS - elapsed);
      const remainingSec = Math.ceil(remainingMs / 1000);

      const { y: currentY, speed: currentSpeed } = computeCurrentY(elapsed);

      if (reelRef.current) {
        reelRef.current.style.transform = `translate3d(0, -${currentY.toFixed(2)}px, 0)`;
      }

      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${Math.round(progress * 100)}%`;
      }

      if (remainingSec !== lastSecond && remainingSec >= 1) {
        lastSecond = remainingSec;
        setRollSecondsLeft(remainingSec);
      }

      if (remainingSec !== lastPulseSec && remainingSec <= 7 && remainingSec >= 1) {
        lastPulseSec = remainingSec;
        soundEngine.playTensionPulse(progress);
      }

      // Audio ticks driven by physical motion
      const currentCard = Math.floor(currentY / CARD_HEIGHT);
      if (currentSpeed > 700) {
        // High speed continuous mechanical ratcheting
        if (now - lastTickTime >= 30) {
          lastTickTime = now;
          soundEngine.playReelTick(1.25, 0.10);
        }
      } else {
        // Slow speed discrete card clicks
        if (currentCard !== lastCardIndex) {
          lastCardIndex = currentCard;
          lastTickTime = now;
          const pitch = 0.85 + (currentSpeed / 700) * 0.35;
          const vol = 0.12 + (1 - progress) * 0.10;
          soundEngine.playReelTick(pitch, vol);
        }
      }

      if (elapsed < TOTAL_ROLL_MS) {
        animFrameRef.current = requestAnimationFrame(physicsLoop);
      } else {
        // Lock perfectly onto target
        if (reelRef.current) {
          reelRef.current.style.transform = `translate3d(0, -${targetDistance}px, 0)`;
        }

        soundEngine.playLockImpact();

        // Brief cinematic pause to showcase the winning card locked in target center
        setTimeout(() => {
          setIsDrawing(false);
          soundEngine.playFanfare();
          fireGrandConfetti();
          fireContinuousSideCannons(2500);

          if (winnerPendingRef.current) {
            onDrawComplete(winnerPendingRef.current.state, winnerPendingRef.current.winner);
          }
        }, 360);
      }
    };

    animFrameRef.current = requestAnimationFrame(physicsLoop);
  };

  // Unmount safety cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Keyboard shortcut handlers (Space/Enter triggers draw when idle)
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
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-3 sm:py-6 max-w-4xl mx-auto w-full relative z-10">
      {/* Background Ambience Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[560px] h-[340px] sm:h-[560px] bg-gradient-to-tr from-indigo-600/10 via-purple-600/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Prize Badge & Navigation */}
      <div className="w-full text-center mb-2 sm:mb-4">
        {hasNoPrizes ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            <span>No prizes in list. Open Settings to load or configure prizes.</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
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

      {/* Physical Slot Machine Reel Drum Stage */}
      <div className="relative my-1 sm:my-2 w-full flex justify-center">
        {/* Outer Aura Lighting */}
        <div className={`absolute inset-0 max-w-md mx-auto -m-3 rounded-3xl transition-all duration-700 blur-xl ${
          isDrawing
            ? 'bg-indigo-500/30 scale-105'
            : currentPrizeWinner
            ? 'bg-emerald-500/20'
            : 'bg-slate-800/30'
        }`} />

        {/* 3D Cylindrical Drum Frame */}
        <div className="relative w-full max-w-[340px] sm:max-w-[420px] h-[260px] rounded-2xl bg-slate-900/95 border-2 border-slate-800/90 shadow-2xl shadow-black/90 backdrop-blur-xl overflow-hidden flex flex-col justify-center">
          
          {/* Subtle Grid Background Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none z-0" />

          {/* Golden Center Laser Target Window (Pinned exactly at the vertical center) */}
          <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[80px] rounded-xl border-2 border-indigo-400/50 bg-indigo-500/[0.07] pointer-events-none z-20 shadow-[0_0_25px_rgba(99,102,241,0.25)] flex items-center justify-between px-2 sm:px-3">
            {/* Left Indicator Arrow Pointer */}
            <div className="flex items-center gap-0.5 text-indigo-400 animate-pulse">
              <div className="w-1.5 h-6 rounded-full bg-indigo-400" />
              <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-indigo-400" />
            </div>

            {/* Right Indicator Arrow Pointer */}
            <div className="flex items-center gap-0.5 text-indigo-400 animate-pulse">
              <div className="w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-indigo-400" />
              <div className="w-1.5 h-6 rounded-full bg-indigo-400" />
            </div>
          </div>

          {/* Top & Bottom Depth Gradients (Simulates 3D Cylindrical Slot Drum) */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-20" />
          <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none z-20" />

          {/* Reel Track Content */}
          {isDrawing ? (
            /* Continuous Smooth Rolling Strip */
            <div className="w-full h-full relative overflow-hidden flex items-start justify-center">
              <div
                ref={reelRef}
                className="w-full flex flex-col items-center pt-[90px] pb-[90px] will-change-transform"
                style={{ transform: 'translate3d(0, 0px, 0)' }}
              >
                {reelList.map((candidate, idx) => (
                  <div
                    key={`candidate-${candidate.id}-${idx}`}
                    style={{ height: `${CARD_HEIGHT}px` }}
                    className="w-full px-4 sm:px-6 flex items-center justify-center shrink-0"
                  >
                    <div className="w-full h-[72px] rounded-xl bg-slate-800/90 border border-slate-700/90 flex items-center px-3 sm:px-4 gap-3 shadow-md">
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-xl bg-indigo-600/90 text-white font-extrabold text-base flex items-center justify-center shrink-0 shadow-inner">
                        {getInitials(candidate.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-base sm:text-lg font-bold text-white truncate leading-snug">
                          {candidate.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-semibold text-indigo-400">
                            {candidate.id}
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-xs text-slate-300 truncate">
                            {candidate.dept}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : currentPrizeWinner ? (
            /* Winner Reveal Card with Celebratory Scale-In and Glowing Shadow */
            <div className="w-full px-4 sm:px-6 flex flex-col items-center justify-center gap-2 relative z-30 animate-winner-reveal">
              {/* Winner Crown Tag */}
              <div className="flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-extrabold uppercase tracking-wider shadow-md animate-winner-sparkle">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Winner Selected</span>
              </div>

              {/* Winner Highlight Box with Golden Glow Pulse */}
              <div className="w-full py-2.5 px-3 sm:px-4 rounded-xl bg-slate-800 border-2 border-amber-400/60 flex items-center gap-3.5 shadow-2xl animate-winner-glow transition-all">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500/30 via-slate-900 to-slate-950 border border-amber-400/50 flex items-center justify-center text-amber-300 text-xl sm:text-2xl font-extrabold tracking-wider shrink-0 shadow-inner">
                  {getInitials(currentPrizeWinner.name)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <h3 className="text-lg sm:text-xl font-extrabold text-white truncate leading-snug drop-shadow-sm">
                    {currentPrizeWinner.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-amber-400 font-mono font-bold tracking-wider">
                      {currentPrizeWinner.id}
                    </p>
                    <span className="text-slate-500">•</span>
                    <p className="text-xs text-slate-200 font-semibold truncate">
                      {currentPrizeWinner.dept}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Ready / Idle State */
            <div className="w-full px-4 sm:px-6 flex flex-col items-center justify-center gap-1.5 relative z-30">
              <div className="text-center">
                <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">Ready for Draw</h3>
                <p className="text-xs text-slate-400 mt-1 font-medium">Press Spacebar or click the Draw button below</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Countdown & Progress Indicator when rolling */}
      {isDrawing && (
        <div className="flex flex-col items-center gap-1.5 mt-2">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-950/90 border border-indigo-500/40 text-indigo-300 text-xs font-bold tracking-wider uppercase shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span>Spinning Drum ({rollSecondsLeft}s)</span>
          </div>

          {/* Dynamic 8s Progress Line */}
          <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 mt-0.5">
            <div
              ref={progressBarRef}
              className="h-full bg-indigo-500 transition-all duration-75 ease-linear w-0"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-2.5 w-full max-w-sm mt-3">
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
          /* Ready to Draw Button (Small Circle Button) */
          <div className="flex flex-col items-center gap-2">
            <button
              id="main-draw-btn"
              onClick={executeDraw}
              disabled={isDrawing || hasNoPrizes || eligibleInfo.pool.length === 0}
              title={
                hasNoPrizes
                  ? 'Load Prizes in Settings'
                  : eligibleInfo.pool.length === 0
                  ? 'No Staff Left in Pool'
                  : 'Draw Winner (Spacebar / Enter)'
              }
              aria-label="Draw Winner"
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full font-extrabold shadow-2xl transition-all duration-200 transform active:scale-90 flex flex-col items-center justify-center gap-0.5 border-2 ${
                isDrawing
                  ? 'bg-slate-800 text-slate-400 border-slate-700 cursor-not-allowed scale-95'
                  : hasNoPrizes || eligibleInfo.pool.length === 0
                  ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white border-indigo-400/60 shadow-indigo-600/50 hover:shadow-indigo-500/80 hover:scale-105 cursor-pointer animate-pulse'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-5 h-5 text-indigo-400 animate-spin" />
                  <span className="text-[11px] font-mono font-bold leading-none mt-0.5">{rollSecondsLeft}s</span>
                </>
              ) : hasNoPrizes ? (
                <span className="text-[10px] font-semibold text-center px-1 leading-tight">No Prizes</span>
              ) : eligibleInfo.pool.length === 0 ? (
                <span className="text-[10px] font-semibold text-center px-1 leading-tight">Empty</span>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow" />
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-extrabold leading-none">DRAW</span>
                </>
              )}
            </button>
            {!isDrawing && !hasNoPrizes && eligibleInfo.pool.length > 0 && (
              <span className="text-[11px] font-medium text-slate-400">Click circle or press Space</span>
            )}
          </div>
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
        <div className="w-full max-w-md mt-4 px-4">
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


