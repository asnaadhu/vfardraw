import { DrawState, StaffMember, CategoryId, Winner, TierRules } from '../types';
import { DEFAULT_PRIZES_LIST } from '../data/defaultPrizes';
import { DEFAULT_CAT1_STAFF_RAW, DEFAULT_CAT2_STAFF_RAW, DEFAULT_CAT3_STAFF_RAW } from '../data/defaultStaff';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const STORAGE_KEY = 'annual_raffle_safe_offline_v6';

export const DEFAULT_TIER_RULES: TierRules = {
  cat1Cutoff: 10,
  cat2Cutoff: 30,
};

export { DEFAULT_PRIZES_LIST, DEFAULT_CAT1_STAFF_RAW, DEFAULT_CAT2_STAFF_RAW, DEFAULT_CAT3_STAFF_RAW };

export function parseStaffText(rawText: string, category: CategoryId): StaffMember[] {
  if (!rawText) return [];
  const lines = rawText.split('\n');
  const members: StaffMember[] = [];
  const seenIds = new Set<string>();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.includes('\t')
      ? trimmed.split('\t').map(s => s.trim())
      : trimmed.split(',').map(s => s.trim());

    const name = parts[0] || `Staff ${index + 1}`;
    let id = parts[1] || `EMP-${1000 + index}`;
    const dept = parts[2] || 'General';

    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    members.push({ id, name, dept, category });
  });

  return members;
}

export function generateSampleData(): {
  prizesText: string;
  cat1Text: string;
  cat2Text: string;
  cat3Text: string;
} {
  return {
    prizesText: DEFAULT_PRIZES_LIST.join('\n'),
    cat1Text: DEFAULT_CAT1_STAFF_RAW,
    cat2Text: DEFAULT_CAT2_STAFF_RAW,
    cat3Text: DEFAULT_CAT3_STAFF_RAW,
  };
}

function buildDefaultState(): DrawState {
  const samples = generateSampleData();
  const prizes = samples.prizesText.split('\n').map(p => p.trim()).filter(Boolean);
  return {
    prizes,
    cat1: parseStaffText(samples.cat1Text, 'cat1'),
    cat2: parseStaffText(samples.cat2Text, 'cat2'),
    cat3: parseStaffText(samples.cat3Text, 'cat3'),
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
}

// ─── Supabase persistence ───────────────────────────────────────────
//
// Only two tables are used for persistence:
//   1. draw_settings (singleton row id=1) — stores raw text inputs, tier
//      rules, and current_prize_index. Staff and prize lists are reconstructed
//      from the raw text on load, so we never need to bulk-fetch hundreds of
//      rows from staff_members/prizes.
//   2. winners — one row per drawn winner.
//
// The staff_members and prizes tables still exist from the original migration
// but are no longer read or written. This keeps load/save fast and reliable.

interface DbWinner {
  id: string;
  rank: number;
  prize_name: string;
  staff_id: string;
  staff_name: string;
  dept: string;
  category: string;
  drawn_at: string;
}

interface DbSettings {
  id: number;
  cat1_cutoff: number;
  cat2_cutoff: number;
  raw_prizes: string;
  raw_cat1: string;
  raw_cat2: string;
  raw_cat3: string;
  current_prize_index: number;
}

let lastSavedState: DrawState | null = null;
let saveQueue: Promise<void> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function loadInitialState(): Promise<DrawState> {
  if (!isSupabaseConfigured) {
    return buildDefaultState();
  }
  try {
    const [settingsRes, winnersRes] = await withTimeout(
      Promise.all([
        supabase.from('draw_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('winners').select('*').order('rank', { ascending: true }),
      ]),
      10000
    );

    if (settingsRes.error) throw settingsRes.error;
    if (winnersRes.error) throw winnersRes.error;

    const settings = settingsRes.data as DbSettings | null;
    const winnerRows = (winnersRes.data || []) as DbWinner[];

    // No settings row yet → first run. Seed defaults.
    if (!settings) {
      const defaults = buildDefaultState();
      await seedDatabase(defaults);
      lastSavedState = defaults;
      return defaults;
    }

    const winners: Winner[] = winnerRows.map(w => ({
      id: w.staff_id,
      name: w.staff_name,
      dept: w.dept,
      category: w.category as CategoryId,
      rank: w.rank,
      prize: w.prize_name,
      timestamp: new Date(w.drawn_at).getTime(),
    }));

    // Reconstruct staff lists from raw text stored in settings
    const rawInputs = {
      prizes: settings.raw_prizes || '',
      cat1: settings.raw_cat1 || '',
      cat2: settings.raw_cat2 || '',
      cat3: settings.raw_cat3 || '',
    };

    const allStaff = [
      ...parseStaffText(rawInputs.cat1, 'cat1'),
      ...parseStaffText(rawInputs.cat2, 'cat2'),
      ...parseStaffText(rawInputs.cat3, 'cat3'),
    ];

    const prizes = rawInputs.prizes.split('\n').map(p => p.trim()).filter(Boolean);

    // Remove winners from active staff pools
    const winnerIdSet = new Set(winners.map(w => w.id.toLowerCase().trim()));
    const winnerNameSet = new Set(winners.map(w => w.name.toLowerCase().trim()));
    const cleanCat1 = allStaff.filter(s => s.category === 'cat1' && !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
    const cleanCat2 = allStaff.filter(s => s.category === 'cat2' && !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
    const cleanCat3 = allStaff.filter(s => s.category === 'cat3' && !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));

    const loaded: DrawState = {
      prizes,
      cat1: cleanCat1,
      cat2: cleanCat2,
      cat3: cleanCat3,
      winners,
      currentPrizeIndex: settings.current_prize_index ?? 0,
      tierRules: { cat1Cutoff: settings.cat1_cutoff, cat2Cutoff: settings.cat2_cutoff },
      rawInputs,
    };
    lastSavedState = loaded;
    return loaded;
  } catch (err) {
    console.warn('Failed to load state from Supabase, falling back to defaults', err);
    return buildDefaultState();
  }
}

/**
 * Seed the database with the given state. Used on first run or full reset.
 * Only writes to draw_settings (raw text) and winners — no bulk staff/prize inserts.
 */
export async function seedDatabase(state: DrawState): Promise<void> {
  const { error: settingsErr } = await supabase.from('draw_settings').upsert({
    id: 1,
    cat1_cutoff: state.tierRules.cat1Cutoff,
    cat2_cutoff: state.tierRules.cat2Cutoff,
    raw_prizes: state.rawInputs.prizes,
    raw_cat1: state.rawInputs.cat1,
    raw_cat2: state.rawInputs.cat2,
    raw_cat3: state.rawInputs.cat3,
    current_prize_index: state.currentPrizeIndex,
    updated_at: new Date().toISOString(),
  });
  if (settingsErr) throw settingsErr;

  // Clear any existing winners
  const { error: winnersErr } = await supabase.from('winners')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (winnersErr) throw winnersErr;
  lastSavedState = state;
}

/**
 * Persist draw state to Supabase. Only writes what changed:
 * - Always upsert the settings row (current_prize_index, tier rules, raw text)
 * - Insert new winner rows / delete removed winner rows
 *
 * Fire-and-forget with a serial queue to prevent overlapping saves.
 */

export function saveState(state: DrawState): void {
  if (!isSupabaseConfigured) return;
  saveQueue = saveQueue.then(() => saveStateAsync(state).catch(err => {
    console.error('Failed to save state to Supabase', err);
  }));
}

async function saveStateAsync(state: DrawState): Promise<void> {
  const prev = lastSavedState;
  lastSavedState = state;

  // 1. Upsert settings (always — current_prize_index or raw text may have changed)
  const { error: settingsErr } = await supabase.from('draw_settings').upsert({
    id: 1,
    cat1_cutoff: state.tierRules.cat1Cutoff,
    cat2_cutoff: state.tierRules.cat2Cutoff,
    raw_prizes: state.rawInputs.prizes,
    raw_cat1: state.rawInputs.cat1,
    raw_cat2: state.rawInputs.cat2,
    raw_cat3: state.rawInputs.cat3,
    current_prize_index: state.currentPrizeIndex,
    updated_at: new Date().toISOString(),
  });
  if (settingsErr) throw settingsErr;

  // 2. Sync winners table via diff
  const prevWinners = prev?.winners || [];
  const prevWinnerRanks = new Set(prevWinners.map(w => w.rank));
  const currentWinnerRanks = new Set(state.winners.map(w => w.rank));

  // Delete removed winners
  const removedRanks = [...prevWinnerRanks].filter(r => !currentWinnerRanks.has(r));
  if (removedRanks.length > 0) {
    const { error } = await supabase.from('winners').delete().in('rank', removedRanks);
    if (error) throw error;
  }

  // Insert new winners
  const newWinners = state.winners.filter(w => !prevWinnerRanks.has(w.rank));
  if (newWinners.length > 0) {
    const rows = newWinners.map(w => ({
      rank: w.rank,
      prize_name: w.prize,
      staff_id: w.id,
      staff_name: w.name,
      dept: w.dept,
      category: w.category,
      drawn_at: new Date(w.timestamp).toISOString(),
    }));
    const { error } = await supabase.from('winners').insert(rows);
    if (error) throw error;
  }
}

/**
 * Subscribe to realtime changes on the winners and settings tables.
 * When another browser/device writes, the callback fires so the app
 * can reload and stay in sync. Returns an unsubscribe function.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, 600);
  };

  const channel = supabase
    .channel('draw-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_settings' }, trigger)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[draw-sync] Realtime subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[draw-sync] Realtime subscription error');
      } else if (status === 'TIMED_OUT') {
        console.warn('[draw-sync] Realtime subscription timed out');
      }
    });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

export function exportWinnersToCSV(winners: DrawState['winners']): void {
  if (!winners || winners.length === 0) return;

  const headers = ['Draw Order', 'Prize Name', 'Staff Name', 'Staff ID', 'Department'];

  const rows = winners.map(w => {
    return [
      `"#${w.rank}"`,
      `"${w.prize.replace(/"/g, '""')}"`,
      `"${w.name.replace(/"/g, '""')}"`,
      `"${w.id.replace(/"/g, '""')}"`,
      `"${w.dept.replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `lucky_draw_winners_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
