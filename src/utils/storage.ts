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

let lastSavedState: DrawState | null = null;
let saveQueue: Promise<void> = Promise.resolve();

interface DbStaffMember {
  id: string;
  staff_id: string;
  name: string;
  dept: string;
  category: string;
  is_drawn: boolean;
}

interface DbPrize {
  id: string;
  rank: number;
  name: string;
  drawn_at: string | null;
}

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

/**
 * Load the full draw state from Supabase. If no data exists yet (first run),
 * seeds the database with default data and returns that.
 */
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
    const [settingsRes, staffRes, prizesRes, winnersRes] = await withTimeout(
      Promise.all([
        supabase.from('draw_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('staff_members').select('*').order('created_at', { ascending: true }),
        supabase.from('prizes').select('*').order('rank', { ascending: true }),
        supabase.from('winners').select('*').order('rank', { ascending: true }),
      ]),
      5000
    );

    if (settingsRes.error) throw settingsRes.error;
    if (staffRes.error) throw staffRes.error;
    if (prizesRes.error) throw prizesRes.error;
    if (winnersRes.error) throw winnersRes.error;

    const settings = settingsRes.data as DbSettings | null;

    // No settings row yet → first run. Seed defaults.
    if (!settings) {
      const defaults = buildDefaultState();
      await seedDatabase(defaults);
      lastSavedState = defaults;
      return defaults;
    }

    const staffRows = (staffRes.data || []) as DbStaffMember[];
    const prizeRows = (prizesRes.data || []) as DbPrize[];
    const winnerRows = (winnersRes.data || []) as DbWinner[];

    // If settings exist but prizes/staff are empty, treat as fresh → seed defaults.
    if (prizeRows.length === 0 && staffRows.length === 0) {
      const defaults = buildDefaultState();
      await seedDatabase(defaults);
      lastSavedState = defaults;
      return defaults;
    }

    const cat1: StaffMember[] = staffRows.filter(s => s.category === 'cat1').map(s => ({ id: s.staff_id, name: s.name, dept: s.dept, category: 'cat1' }));
    const cat2: StaffMember[] = staffRows.filter(s => s.category === 'cat2').map(s => ({ id: s.staff_id, name: s.name, dept: s.dept, category: 'cat2' }));
    const cat3: StaffMember[] = staffRows.filter(s => s.category === 'cat3').map(s => ({ id: s.staff_id, name: s.name, dept: s.dept, category: 'cat3' }));

    const prizes = prizeRows.map(p => p.name);

    const winners: Winner[] = winnerRows.map(w => ({
      id: w.staff_id,
      name: w.staff_name,
      dept: w.dept,
      category: w.category as CategoryId,
      rank: w.rank,
      prize: w.prize_name,
      timestamp: new Date(w.drawn_at).getTime(),
    }));

    // Ensure no winner appears in active pools
    const winnerIdSet = new Set(winners.map(w => w.id.toLowerCase().trim()));
    const winnerNameSet = new Set(winners.map(w => w.name.toLowerCase().trim()));
    const cleanCat1 = cat1.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
    const cleanCat2 = cat2.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
    const cleanCat3 = cat3.filter(s => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));

    const rawInputs = {
      prizes: settings.raw_prizes || prizes.join('\n'),
      cat1: settings.raw_cat1 || '',
      cat2: settings.raw_cat2 || '',
      cat3: settings.raw_cat3 || '',
    };

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
 * Clears existing data first (safe because it's only called when DB is empty or on explicit reset).
 */
export async function seedDatabase(state: DrawState): Promise<void> {
  await Promise.all([
    supabase.from('staff_members').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('prizes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('winners').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);

  const BATCH_SIZE = 80;

  const staffRows = [
    ...state.cat1.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat1' })),
    ...state.cat2.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat2' })),
    ...state.cat3.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat3' })),
  ];

  for (let i = 0; i < staffRows.length; i += BATCH_SIZE) {
    const batch = staffRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('staff_members').insert(batch);
    if (error) throw error;
  }

  const prizeRows = state.prizes.map((name, idx) => ({ rank: idx + 1, name }));
  for (let i = 0; i < prizeRows.length; i += BATCH_SIZE) {
    const batch = prizeRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('prizes').insert(batch);
    if (error) throw error;
  }

  const settingsRow = {
    id: 1,
    cat1_cutoff: state.tierRules.cat1Cutoff,
    cat2_cutoff: state.tierRules.cat2Cutoff,
    raw_prizes: state.rawInputs.prizes,
    raw_cat1: state.rawInputs.cat1,
    raw_cat2: state.rawInputs.cat2,
    raw_cat3: state.rawInputs.cat3,
    current_prize_index: state.currentPrizeIndex,
  };

  const { error: settingsUpsertErr } = await supabase.from('draw_settings').upsert(settingsRow);
  if (settingsUpsertErr) throw settingsUpsertErr;

  lastSavedState = state;
}

/**
 * Persist the full draw state to Supabase. Fire-and-forget — the app continues
 * working with local state while the write happens in the background.
 *
 * Instead of deleting and re-inserting hundreds of rows on every draw, this
 * does a targeted sync: only writes the rows that actually changed since the
 * last successful save. A serial queue prevents overlapping saves.
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

  // First save ever, or a full re-seed (settings text inputs changed):
  // do a complete sync. This is heavier but only happens on first run,
  // reset, or when the host edits staff/prize lists in Settings.
  const settingsChanged = !prev ||
    prev.rawInputs.prizes !== state.rawInputs.prizes ||
    prev.rawInputs.cat1 !== state.rawInputs.cat1 ||
    prev.rawInputs.cat2 !== state.rawInputs.cat2 ||
    prev.rawInputs.cat3 !== state.rawInputs.cat3 ||
    prev.tierRules.cat1Cutoff !== state.tierRules.cat1Cutoff ||
    prev.tierRules.cat2Cutoff !== state.tierRules.cat2Cutoff;

  if (settingsChanged) {
    await fullSync(state);
    return;
  }

  // Targeted sync: only update what changed.
  // 1. Always update settings (current_prize_index may have changed)
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

  // 2. Diff winners: figure out what was added or removed
  const prevWinners = prev?.winners || [];
  const prevWinnerKeys = new Set(prevWinners.map(w => `${w.rank}`));
  const currentWinnerKeys = new Set(state.winners.map(w => `${w.rank}`));

  // Delete removed winners
  const removedRanks = prevWinnerKeys.size > 0
    ? [...prevWinnerKeys].filter(k => !currentWinnerKeys.has(k)).map(Number)
    : [];
  if (removedRanks.length > 0) {
    const { error: delErr } = await supabase.from('winners').delete().in('rank', removedRanks);
    if (delErr) throw delErr;
  }

  // Insert new winners
  const newWinners = state.winners.filter(w => !prevWinnerKeys.has(`${w.rank}`));
  if (newWinners.length > 0) {
    const winnerRows = newWinners.map(w => ({
      rank: w.rank,
      prize_name: w.prize,
      staff_id: w.id,
      staff_name: w.name,
      dept: w.dept,
      category: w.category,
      drawn_at: new Date(w.timestamp).toISOString(),
    }));
    const { error: winnersErr } = await supabase.from('winners').insert(winnerRows);
    if (winnersErr) throw winnersErr;
  }

  // 3. Sync staff_members only if the staff pools changed (someone was drawn or redrawn)
  const prevStaffIds = new Set([
    ...(prev?.cat1 || []).map(s => `${s.category}:${s.id.toLowerCase()}`),
    ...(prev?.cat2 || []).map(s => `${s.category}:${s.id.toLowerCase()}`),
    ...(prev?.cat3 || []).map(s => `${s.category}:${s.id.toLowerCase()}`),
  ]);
  const currentStaffIds = new Set([
    ...state.cat1.map(s => `${s.category}:${s.id.toLowerCase()}`),
    ...state.cat2.map(s => `${s.category}:${s.id.toLowerCase()}`),
    ...state.cat3.map(s => `${s.category}:${s.id.toLowerCase()}`),
  ]);

  const staffChanged = prevStaffIds.size !== currentStaffIds.size ||
    [...currentStaffIds].some(id => !prevStaffIds.has(id));

  if (staffChanged) {
    // Remove staff members who are no longer in any pool (they won a prize)
    const removedStaffKeys = [...prevStaffIds].filter(k => !currentStaffIds.has(k));
    for (const key of removedStaffKeys) {
      const [cat, staffId] = key.split(':');
      const { error } = await supabase.from('staff_members')
        .delete()
        .eq('category', cat)
        .ilike('staff_id', staffId);
      if (error) throw error;
    }

    // Re-insert staff members who came back into a pool (redraw case)
    const addedStaffKeys = [...currentStaffIds].filter(k => !prevStaffIds.has(k));
    const addedStaff = [
      ...state.cat1.filter(s => !prevStaffIds.has(`cat1:${s.id.toLowerCase()}`)),
      ...state.cat2.filter(s => !prevStaffIds.has(`cat2:${s.id.toLowerCase()}`)),
      ...state.cat3.filter(s => !prevStaffIds.has(`cat3:${s.id.toLowerCase()}`)),
    ];
    if (addedStaff.length > 0) {
      const rows = addedStaff.map(s => ({
        staff_id: s.id, name: s.name, dept: s.dept, category: s.category,
      }));
      const { error } = await supabase.from('staff_members').insert(rows);
      if (error) throw error;
    }
  }

  // 4. Sync prizes only if the prize list changed
  const prevPrizeStr = (prev?.prizes || []).join('\n');
  const currentPrizeStr = state.prizes.join('\n');
  if (prevPrizeStr !== currentPrizeStr) {
    await supabase.from('prizes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const prizeRows = state.prizes.map((name, idx) => ({ rank: idx + 1, name }));
    if (prizeRows.length > 0) {
      const { error } = await supabase.from('prizes').insert(prizeRows);
      if (error) throw error;
    }
  }
}

/**
 * Full sync: delete all rows from staff/prizes/winners and re-insert.
 * Only used on first run, reset, or when settings text inputs change.
 * Batches inserts to stay within Supabase's row limits.
 */
async function fullSync(state: DrawState): Promise<void> {
  await Promise.all([
    supabase.from('staff_members').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('prizes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('winners').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);

  const BATCH_SIZE = 80;

  const allStaff = [
    ...state.cat1.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat1' })),
    ...state.cat2.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat2' })),
    ...state.cat3.map(s => ({ staff_id: s.id, name: s.name, dept: s.dept, category: 'cat3' })),
  ];

  for (let i = 0; i < allStaff.length; i += BATCH_SIZE) {
    const batch = allStaff.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('staff_members').insert(batch);
    if (error) throw error;
  }

  const allPrizes = state.prizes.map((name, idx) => ({ rank: idx + 1, name }));
  for (let i = 0; i < allPrizes.length; i += BATCH_SIZE) {
    const batch = allPrizes.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('prizes').insert(batch);
    if (error) throw error;
  }

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
  lastSavedState = state;
}

/**
 * Subscribe to realtime changes on all draw tables. When any table changes
 * (from another browser/device), the callback is debounced and fired so the
 * app can reload its full state and stay in sync.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  if (!isSupabaseConfigured) return () => {};

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onChange, 600);
  };

  const channel = supabase
    .channel('draw-sync', { config: { private: false } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'winners' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prizes' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_settings' }, trigger)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[draw-sync] Realtime subscription active');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[draw-sync] Realtime subscription error');
      } else if (status === 'TIMED_OUT') {
        console.warn('[draw-sync] Realtime subscription timed out');
      } else if (status === 'CLOSED') {
        console.log('[draw-sync] Realtime subscription closed');
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
