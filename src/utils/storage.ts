import { DrawState, StaffMember, CategoryId } from '../types';
import { DEFAULT_PRIZES_LIST } from '../data/defaultPrizes';
import { DEFAULT_CAT1_STAFF_RAW, DEFAULT_CAT2_STAFF_RAW, DEFAULT_CAT3_STAFF_RAW } from '../data/defaultStaff';

export const STORAGE_KEY = 'annual_raffle_safe_offline_v6';

export const DEFAULT_TIER_RULES = {
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

    // Support comma or tab separated formats
    const parts = trimmed.includes('\t')
      ? trimmed.split('\t').map(s => s.trim())
      : trimmed.split(',').map(s => s.trim());

    const name = parts[0] || `Staff ${index + 1}`;
    let id = parts[1] || `EMP-${1000 + index}`;
    const dept = parts[2] || 'General';

    // Ensure unique ID if duplicates exist
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    members.push({
      id,
      name,
      dept,
      category,
    });
  });

  return members;
}

export function generateSampleData(): {
  prizesText: string;
  cat1Text: string;
  cat2Text: string;
  cat3Text: string;
} {
  const prizesText = DEFAULT_PRIZES_LIST.join('\n');
  const cat1Text = DEFAULT_CAT1_STAFF_RAW;
  const cat2Text = DEFAULT_CAT2_STAFF_RAW;
  const cat3Text = DEFAULT_CAT3_STAFF_RAW;

  return {
    prizesText,
    cat1Text,
    cat2Text,
    cat3Text,
  };
}

export function loadInitialState(): DrawState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.prizes) && parsed.prizes.length > 0) {
        const loadedWinners: DrawState['winners'] = parsed.winners || [];
        const winnerIdSet = new Set(loadedWinners.map(w => w.id.toLowerCase().trim()));
        const winnerNameSet = new Set(loadedWinners.map(w => w.name.toLowerCase().trim()));

        // Ensure no winner is ever in the active pool on load
        const cleanCat1 = (parsed.cat1 || []).filter((s: StaffMember) => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
        const cleanCat2 = (parsed.cat2 || []).filter((s: StaffMember) => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));
        const cleanCat3 = (parsed.cat3 || []).filter((s: StaffMember) => !winnerIdSet.has(s.id.toLowerCase().trim()) && !winnerNameSet.has(s.name.toLowerCase().trim()));

        return {
          prizes: parsed.prizes || [],
          cat1: cleanCat1,
          cat2: cleanCat2,
          cat3: cleanCat3,
          winners: loadedWinners,
          currentPrizeIndex: typeof parsed.currentPrizeIndex === 'number' ? parsed.currentPrizeIndex : 0,
          tierRules: parsed.tierRules || DEFAULT_TIER_RULES,
          rawInputs: parsed.rawInputs || {
            prizes: (parsed.prizes || []).join('\n'),
            cat1: (parsed.cat1 || []).map((s: StaffMember) => `${s.name}, ${s.id}, ${s.dept}`).join('\n'),
            cat2: (parsed.cat2 || []).map((s: StaffMember) => `${s.name}, ${s.id}, ${s.dept}`).join('\n'),
            cat3: (parsed.cat3 || []).map((s: StaffMember) => `${s.name}, ${s.id}, ${s.dept}`).join('\n'),
          },
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load state from localStorage', err);
  }

  // Fallback to sample data
  const samples = generateSampleData();
  const prizes = samples.prizesText.split('\n').map(p => p.trim()).filter(Boolean);
  const cat1 = parseStaffText(samples.cat1Text, 'cat1');
  const cat2 = parseStaffText(samples.cat2Text, 'cat2');
  const cat3 = parseStaffText(samples.cat3Text, 'cat3');

  const initialState: DrawState = {
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

  saveState(initialState);
  return initialState;
}

export function saveState(state: DrawState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save state to localStorage', err);
  }
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
