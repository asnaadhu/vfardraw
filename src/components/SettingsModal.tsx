import { useState, useEffect } from 'react';
import { X, Trophy, Settings, Sliders, Download, RefreshCw, Sparkles, Trash2, Search, RotateCcw, AlertTriangle, FileText, Check, Upload, Volume2, VolumeX } from 'lucide-react';
import { DrawState, StaffMember, Winner, TierRules } from '../types';
import { parseStaffText, generateSampleData, exportWinnersToCSV, DEFAULT_TIER_RULES } from '../utils/storage';
import { soundEngine } from '../utils/audio';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: 'setup' | 'winners' | 'rules';
  state: DrawState;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onClose: () => void;
  onApplyChanges: (updatedState: DrawState) => void;
  onResetAll: () => void;
  onRedrawWinner: (winner: Winner) => void;
}

export function SettingsModal({
  isOpen,
  initialTab = 'setup',
  state,
  isMuted = false,
  onToggleMute,
  onClose,
  onApplyChanges,
  onResetAll,
  onRedrawWinner,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'setup' | 'winners' | 'rules'>(initialTab);

  // Form inputs
  const [prizesInput, setPrizesInput] = useState('');
  const [cat1Input, setCat1Input] = useState('');
  const [cat2Input, setCat2Input] = useState('');
  const [cat3Input, setCat3Input] = useState('');

  // Tier rules
  const [cat1Cutoff, setCat1Cutoff] = useState(10);
  const [cat2Cutoff, setCat2Cutoff] = useState(30);

  // Winners tab search
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Sync inputs whenever modal opens or state raw inputs change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'setup');
      setPrizesInput(state.rawInputs?.prizes || state.prizes.join('\n'));
      setCat1Input(state.rawInputs?.cat1 || state.cat1.map(s => `${s.name}, ${s.id}, ${s.dept}`).join('\n'));
      setCat2Input(state.rawInputs?.cat2 || state.cat2.map(s => `${s.name}, ${s.id}, ${s.dept}`).join('\n'));
      setCat3Input(state.rawInputs?.cat3 || state.cat3.map(s => `${s.name}, ${s.id}, ${s.dept}`).join('\n'));
      setCat1Cutoff(state.tierRules?.cat1Cutoff || DEFAULT_TIER_RULES.cat1Cutoff);
      setCat2Cutoff(state.tierRules?.cat2Cutoff || DEFAULT_TIER_RULES.cat2Cutoff);
      setConfirmResetOpen(false);
    }
  }, [isOpen, initialTab, state]);

  if (!isOpen) return null;

  // Counts
  const prizeCount = prizesInput.split('\n').filter(s => s.trim().length > 0).length;
  const cat1Count = cat1Input.split('\n').filter(s => s.trim().length > 0).length;
  const cat2Count = cat2Input.split('\n').filter(s => s.trim().length > 0).length;
  const cat3Count = cat3Input.split('\n').filter(s => s.trim().length > 0).length;

  const handleLoadSamples = () => {
    soundEngine.playClick();
    const samples = generateSampleData();
    setPrizesInput(samples.prizesText);
    setCat1Input(samples.cat1Text);
    setCat2Input(samples.cat2Text);
    setCat3Input(samples.cat3Text);
  };

  const handleSaveAndApply = () => {
    soundEngine.playClick();
    const parsedPrizes = prizesInput.split('\n').map(p => p.trim()).filter(Boolean);
    const parsedCat1 = parseStaffText(cat1Input, 'cat1');
    const parsedCat2 = parseStaffText(cat2Input, 'cat2');
    const parsedCat3 = parseStaffText(cat3Input, 'cat3');

    const newRules: TierRules = {
      cat1Cutoff: Number(cat1Cutoff) || 10,
      cat2Cutoff: Number(cat2Cutoff) || 30,
    };

    const updated: DrawState = {
      ...state,
      prizes: parsedPrizes,
      cat1: parsedCat1,
      cat2: parsedCat2,
      cat3: parsedCat3,
      tierRules: newRules,
      rawInputs: {
        prizes: prizesInput,
        cat1: cat1Input,
        cat2: cat2Input,
        cat3: cat3Input,
      },
    };

    onApplyChanges(updated);
    onClose();
  };

  // Filtered winners list
  const filteredWinners = state.winners.filter(w => {
    const q = searchQuery.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q) ||
      w.dept.toLowerCase().includes(q) ||
      w.prize.toLowerCase().includes(q) ||
      `#${w.rank}`.includes(q)
    );
  }).slice().reverse(); // Most recent first

  const handleCopySummary = () => {
    soundEngine.playClick();
    if (state.winners.length === 0) return;
    const lines = state.winners.map(w => `#${w.rank} - ${w.prize}: ${w.name} (${w.id}, ${w.dept})`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900">
          {/* Settings Navigation Tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('setup');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'setup'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Setup Lists</span>
            </button>

            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('rules');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'rules'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Tier Rules</span>
            </button>

            <button
              id="settings-tab-winners"
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('winners');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'winners'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Winners</span>
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {state.winners.length}
              </span>
            </button>
          </div>

          {/* Right Header Controls: Sound & Close */}
          <div className="flex items-center gap-2">
            {onToggleMute && (
              <button
                id="modal-audio-toggle-btn"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound ON'}</span>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={() => {
                soundEngine.playClick();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-slate-200 text-xs sm:text-sm">
          {/* TAB 1: SETUP LISTS */}
          {activeTab === 'setup' && (
            <div className="space-y-5">
              {/* Prize List Textarea */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span>Prize List (Ordered 1 to N)</span>
                    <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      {prizeCount} prizes
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">One prize name per line</span>
                </div>
                <textarea
                  id="prizes-input-area"
                  rows={4}
                  value={prizesInput}
                  onChange={e => setPrizesInput(e.target.value)}
                  placeholder="Grand Prize #1: iPhone 16 Pro Max&#10;Grand Prize #2: MacBook Pro&#10;Tier 2 Gift #11: Dyson Airwrap"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500 transition-colors resize-y"
                />
              </div>

              {/* 3 Categories 3-column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Category 1 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-emerald-400 flex items-center gap-1">
                      <span>Category 1</span>
                      <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        {cat1Count}
                      </span>
                    </label>
                    <span className="text-[10px] text-emerald-500 font-medium">All Gifts (1..N)</span>
                  </div>
                  <textarea
                    id="cat1-input-area"
                    rows={7}
                    value={cat1Input}
                    onChange={e => setCat1Input(e.target.value)}
                    placeholder="Alice Wong, EMP-101, Executive&#10;Bob Smith, EMP-102, Engineering"
                    className="flex-1 w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none transition-colors resize-y"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Eligible for Top Grand Prizes (1-10) and all lower tiers</p>
                </div>

                {/* Category 2 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-amber-400 flex items-center gap-1">
                      <span>Category 2</span>
                      <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                        {cat2Count}
                      </span>
                    </label>
                    <span className="text-[10px] text-amber-500 font-medium">Gifts 11+</span>
                  </div>
                  <textarea
                    id="cat2-input-area"
                    rows={7}
                    value={cat2Input}
                    onChange={e => setCat2Input(e.target.value)}
                    placeholder="Liam Johnson, EMP-201, Sales&#10;Mia Martinez, EMP-202, Support"
                    className="flex-1 w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none transition-colors resize-y"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Eligible for Tier 2 (11-30) and Consolation Gifts</p>
                </div>

                {/* Category 3 */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-rose-400 flex items-center gap-1">
                      <span>Category 3</span>
                      <span className="text-[10px] text-rose-300 font-mono bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                        {cat3Count}
                      </span>
                    </label>
                    <span className="text-[10px] text-rose-500 font-medium">Gifts 31+</span>
                  </div>
                  <textarea
                    id="cat3-input-area"
                    rows={7}
                    value={cat3Input}
                    onChange={e => setCat3Input(e.target.value)}
                    placeholder="Quinn Roberts, EMP-301, Intern&#10;Ruby Evans, EMP-302, Contractor"
                    className="flex-1 w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none transition-colors resize-y"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Eligible for Consolation gifts (31+)</p>
                </div>
              </div>

              {/* Format explanation */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div>
                  <span className="font-semibold text-slate-300">Format:</span> Line-by-line <code className="text-indigo-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">Name, Staff ID, Department</code>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Total Roster: {cat1Count + cat2Count + cat3Count} Staff
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TIER RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Configurable Tier Cutoffs</span>
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The lucky draw algorithm strictly governs employee eligibility based on the current prize draw order rank:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-emerald-400">Grand Prize Tier (Cutoff Rank)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={cat1Cutoff}
                        onChange={e => setCat1Cutoff(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-center text-white focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-xs text-slate-400">Prizes 1 to {cat1Cutoff}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Only Category 1 eligible (with automatic fallback if exhausted)</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-amber-400">Tier 2 Gifts (Cutoff Rank)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={cat1Cutoff + 1}
                        max={200}
                        value={cat2Cutoff}
                        onChange={e => setCat2Cutoff(Math.max(cat1Cutoff + 1, parseInt(e.target.value) || cat1Cutoff + 1))}
                        className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-center text-white focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-xs text-slate-400">Prizes {cat1Cutoff + 1} to {cat2Cutoff}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Category 1 + Category 2 eligible</span>
                  </div>
                </div>
              </div>

              {/* Visual Tier Breakdown diagram */}
              <div className="space-y-3">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  Prize Distribution Hierarchy
                </h5>

                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center justify-center text-xs">
                        1-{cat1Cutoff}
                      </span>
                      <div>
                        <div className="font-bold text-emerald-400 text-xs">Grand Prize Tier</div>
                        <div className="text-[11px] text-slate-400">Prize #1 through #{cat1Cutoff}</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      Category 1 Pool
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center justify-center text-xs">
                        {cat1Cutoff + 1}-{cat2Cutoff}
                      </span>
                      <div>
                        <div className="font-bold text-amber-400 text-xs">Tier 2 Gifts</div>
                        <div className="text-[11px] text-slate-400">Prize #{cat1Cutoff + 1} through #{cat2Cutoff}</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      Category 1 + 2 Pool
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold flex items-center justify-center text-xs">
                        {cat2Cutoff + 1}+
                      </span>
                      <div>
                        <div className="font-bold text-indigo-300 text-xs">Consolation & Remaining Gifts</div>
                        <div className="text-[11px] text-slate-400">Prize #{cat2Cutoff + 1} and above</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      All Categories (1 + 2 + 3)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WINNERS LIST */}
          {activeTab === 'winners' && (
            <div className="space-y-4">
              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search winner name, ID, prize..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleCopySummary}
                    disabled={state.winners.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copiedSummary ? 'Copied!' : 'Copy Summary'}</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      exportWinnersToCSV(state.winners);
                    }}
                    disabled={state.winners.length === 0}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>

              {/* Table of Winners */}
              {state.winners.length === 0 ? (
                <div className="p-10 text-center rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center gap-2">
                  <Trophy className="w-8 h-8 text-slate-600" />
                  <div className="font-bold text-slate-300">No Winners Drawn Yet</div>
                  <p className="text-xs text-slate-400">Winners will appear here in real-time as the draw takes place.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
                  <div className="overflow-x-auto max-h-[380px]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3">Order</th>
                          <th className="py-2.5 px-3">Prize</th>
                          <th className="py-2.5 px-3">Winner Name</th>
                          <th className="py-2.5 px-3">Staff ID</th>
                          <th className="py-2.5 px-3">Department</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredWinners.map(winner => (
                          <tr key={`${winner.id}-${winner.rank}`} className="hover:bg-slate-900/60 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-400">
                              #{winner.rank}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {winner.prize}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-amber-300">
                              {winner.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {winner.id}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300">
                              {winner.dept}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  soundEngine.playClick();
                                  onRedrawWinner(winner);
                                }}
                                title="Return winner to pool and redraw this prize"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-[11px] font-semibold transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Redraw</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-900">
          {activeTab === 'winners' ? (
            <>
              <div className="text-xs text-slate-400 font-medium">
                Showing <span className="text-slate-200 font-bold">{filteredWinners.length}</span> of <span className="text-slate-200 font-bold">{state.winners.length}</span> winners
              </div>
              <button
                id="close-winners-modal-btn"
                onClick={() => {
                  soundEngine.playClick();
                  onClose();
                }}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            <>
              {/* Left: Reset data trigger */}
              <div>
                {!confirmResetOpen ? (
                  <button
                    id="reset-progress-btn"
                    onClick={() => {
                      soundEngine.playClick();
                      setConfirmResetOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset Progress</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 inline" /> Reset all?
                    </span>
                    <button
                      onClick={() => {
                        soundEngine.playClick();
                        onResetAll();
                        setConfirmResetOpen(false);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
                    >
                      Yes, Reset
                    </button>
                    <button
                      onClick={() => setConfirmResetOpen(false)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Load Samples & Apply */}
              <div className="flex items-center gap-2.5">
                <button
                  id="load-samples-btn"
                  onClick={handleLoadSamples}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Load Samples</span>
                </button>

                <button
                  id="apply-modal-btn"
                  onClick={handleSaveAndApply}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply & Save</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
