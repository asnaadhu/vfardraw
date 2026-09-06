import { DrawState, StaffMember, CategoryId } from '../types';

export const STORAGE_KEY = 'annual_raffle_safe_offline_v2';

export const DEFAULT_TIER_RULES = {
  cat1Cutoff: 10,
  cat2Cutoff: 30,
};

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
  const samplePrizes: string[] = [];
  for (let i = 1; i <= 35; i++) {
    if (i <= 3) {
      const topPrizes = [
        'Grand Prize: iPhone 16 Pro Max 512GB',
        'Grand Prize: MacBook Pro 14" M3',
        'Grand Prize: 4K OLED 65" Entertainment Suite',
      ];
      samplePrizes.push(topPrizes[i - 1]);
    } else if (i <= 10) {
      samplePrizes.push(`Grand Prize #${i}: Luxury Weekend Getaway / Tech Voucher`);
    } else if (i <= 30) {
      samplePrizes.push(`Tier 2 Gift #${i}: Dyson Airwrap / Noise-Cancelling Headphones`);
    } else {
      samplePrizes.push(`Consolation Gift #${i}: $250 Shopping & Dining Voucher`);
    }
  }

  const cat1List = [
    'Alice Wong, EMP-101, Executive Management',
    'Bob Smith, EMP-102, Principal Engineering',
    'Charlie Brown, EMP-103, Cloud Architecture',
    'David Clark, EMP-104, Global Marketing',
    'Eva Green, EMP-105, Financial Planning',
    'Frank Wright, EMP-106, People & Culture',
    'Grace Lee, EMP-107, Product Innovation',
    'Hannah White, EMP-108, Creative Design',
    'Ian Scott, EMP-109, Legal & Compliance',
    'Jack Miller, EMP-110, Cyber Security',
    'Karen Davis, EMP-111, Global Logistics',
    'Marcus Vance, EMP-112, Operations Excellence',
    'Elena Rostova, EMP-113, Strategic Growth',
  ];

  const cat2List = [
    'Liam Johnson, EMP-201, Enterprise Sales',
    'Mia Martinez, EMP-202, Client Success',
    'Noah Taylor, EMP-203, Infrastructure IT',
    'Olivia Anderson, EMP-204, Corporate Administration',
    'Sophia Chen, EMP-205, Business Development',
    'Lucas Silva, EMP-206, Data Analytics',
    'Chloe Dubois, EMP-207, Public Relations',
    'Ethan Hunt, EMP-208, Quality Assurance',
    'Maya Patel, EMP-209, Brand Strategy',
    'Zoe Bennett, EMP-210, Talent Acquisition',
    'Daniel Kim, EMP-211, Field Operations',
    'Isabella Rossi, EMP-212, Financial Audit',
  ];

  const cat3List = [
    'Quinn Roberts, EMP-301, Engineering Intern',
    'Ruby Evans, EMP-302, Creative Contractor',
    'Sam Wilson, EMP-303, Marketing Specialist',
    'Thomas Gray, EMP-304, IT Support Associate',
    'Uma Thurman, EMP-305, Research Assistant',
    'Victor Hugo, EMP-306, Content Coordinator',
    'Wendy Darling, EMP-307, Logistics Trainee',
    'Xavier Woods, EMP-308, Events Assistant',
    'Yasmine Al-Fassi, EMP-309, Junior Analyst',
    'Zachary Bell, EMP-310, Summer Fellow',
  ];

  return {
    prizesText: samplePrizes.join('\n'),
    cat1Text: cat1List.join('\n'),
    cat2Text: cat2List.join('\n'),
    cat3Text: cat3List.join('\n'),
  };
}

export function loadInitialState(): DrawState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.prizes) && parsed.prizes.length > 0) {
        return {
          prizes: parsed.prizes || [],
          cat1: parsed.cat1 || [],
          cat2: parsed.cat2 || [],
          cat3: parsed.cat3 || [],
          winners: parsed.winners || [],
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
