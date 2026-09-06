/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { DrawStage } from './components/DrawStage';
import { SettingsModal } from './components/SettingsModal';
import { DrawState, Winner, StaffMember } from './types';
import { loadInitialState, saveState, generateSampleData, parseStaffText, DEFAULT_TIER_RULES, subscribeToChanges } from './utils/storage';
import { soundEngine } from './utils/audio';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<DrawState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'setup' | 'winners' | 'rules'>('setup');
  const [isMuted, setIsMuted] = useState(false);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadInitialState();
      if (!cancelled) setState(loaded);
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime sync: when another browser/device writes to the database,
  // reload the full state to stay in sync. Skip the first sync event that
  // arrives right after our own local write (saveState already updated state).
  useEffect(() => {
    if (!state) return;
    const unsub = subscribeToChanges(() => {
      if (skipNextSyncRef.current) {
        skipNextSyncRef.current = false;
        return;
      }
      loadInitialState().then(setState).catch(err => console.warn('Realtime reload failed', err));
    });
    return () => { unsub(); };
  }, [state?.winners.length]);

  // Sync mute state with sound engine
  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  // Update draw state and persist
  const handleDrawComplete = useCallback((updatedState: DrawState, newWinner: Winner) => {
    setState(updatedState);
    skipNextSyncRef.current = true;
    saveState(updatedState);
  }, []);

  // Navigate to specific prize index (e.g. Host wants to draw a specific prize or skip)
  const handleNavigatePrize = useCallback((newIndex: number) => {
    setState(prev => {
      if (!prev) return prev;
      const updated = { ...prev, currentPrizeIndex: newIndex };
      skipNextSyncRef.current = true;
      saveState(updated);
      return updated;
    });
  }, []);

  // Apply changes from settings modal
  const handleApplySettings = useCallback((updatedState: DrawState) => {
    setState(updatedState);
    skipNextSyncRef.current = true;
    saveState(updatedState);
  }, []);

  // Reset all progress
  const handleResetAll = useCallback(() => {
    const samples = generateSampleData();
    const prizes = samples.prizesText.split('\n').map(p => p.trim()).filter(Boolean);
    const cat1 = parseStaffText(samples.cat1Text, 'cat1');
    const cat2 = parseStaffText(samples.cat2Text, 'cat2');
    const cat3 = parseStaffText(samples.cat3Text, 'cat3');

    const newState: DrawState = {
      prizes,
      cat1,
      cat2,
      cat3,
      winners: [],
      currentPrizeIndex: 0,
      tierRules: DEFAULT_TIER_RULES,
      rawInputs: {
        prizes: samples.prizesText,
        cat1: samples.cat1Text,
        cat2: samples.cat2Text,
        cat3: samples.cat3Text,
      },
    };

    setState(newState);
    skipNextSyncRef.current = true;
    saveState(newState);
  }, []);

  // Redraw / return a winner back to pool
  const handleRedrawWinner = useCallback((winnerToRedraw: Winner) => {
    setState(prev => {
      if (!prev) return prev;
      // Remove from winners list
      const updatedWinners = prev.winners.filter(w => !(w.id === winnerToRedraw.id && w.rank === winnerToRedraw.rank));

      // Put back into respective category pool without duplication
      const member: StaffMember = {
        id: winnerToRedraw.id,
        name: winnerToRedraw.name,
        dept: winnerToRedraw.dept,
        category: winnerToRedraw.category,
      };

      const memberIdNorm = winnerToRedraw.id.toLowerCase().trim();
      const memberNameNorm = winnerToRedraw.name.toLowerCase().trim();

      const existsInCat1 = prev.cat1.some(s => s.id.toLowerCase().trim() === memberIdNorm || s.name.toLowerCase().trim() === memberNameNorm);
      const existsInCat2 = prev.cat2.some(s => s.id.toLowerCase().trim() === memberIdNorm || s.name.toLowerCase().trim() === memberNameNorm);
      const existsInCat3 = prev.cat3.some(s => s.id.toLowerCase().trim() === memberIdNorm || s.name.toLowerCase().trim() === memberNameNorm);

      const updatedCat1 = winnerToRedraw.category === 'cat1' && !existsInCat1 ? [...prev.cat1, member] : prev.cat1;
      const updatedCat2 = winnerToRedraw.category === 'cat2' && !existsInCat2 ? [...prev.cat2, member] : prev.cat2;
      const updatedCat3 = winnerToRedraw.category === 'cat3' && !existsInCat3 ? [...prev.cat3, member] : prev.cat3;

      // Set current prize index back to this prize rank - 1 so it can be re-drawn
      const newPrizeIndex = Math.max(0, winnerToRedraw.rank - 1);

      const updatedState: DrawState = {
        ...prev,
        cat1: updatedCat1,
        cat2: updatedCat2,
        cat3: updatedCat3,
        winners: updatedWinners,
        currentPrizeIndex: newPrizeIndex,
      };

      skipNextSyncRef.current = true;
      saveState(updatedState);
      return updatedState;
    });
  }, []);

  const openSettings = useCallback((tab: 'setup' | 'winners' | 'rules' = 'setup') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  }, []);

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center selection:bg-indigo-500 selection:text-white relative overflow-hidden font-sans">
        <div className="fixed top-0 left-1/3 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="w-10 h-10 text-indigo-400 animate-spin" />
          <p className="text-lg font-bold text-slate-300 tracking-wide">Loading Lucky Draw...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white relative overflow-hidden font-sans">
      {/* Background Decorative Lighting */}
      <div className="fixed top-0 left-1/3 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/3 w-96 h-96 bg-slate-800/20 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Header */}
      <Header
        onOpenSettings={openSettings}
      />

      {/* Main Draw Stage Area */}
      <DrawStage
        state={state}
        onDrawComplete={handleDrawComplete}
        onNavigatePrize={handleNavigatePrize}
        onOpenSettings={openSettings}
        onRedrawWinner={handleRedrawWinner}
      />

      {/* Settings / Winners / Rules Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        initialTab={settingsTab}
        state={state}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onClose={() => setIsSettingsOpen(false)}
        onApplyChanges={handleApplySettings}
        onResetAll={handleResetAll}
        onRedrawWinner={handleRedrawWinner}
      />
    </div>
  );
}
