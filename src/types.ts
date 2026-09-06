export type CategoryId = 'cat1' | 'cat2' | 'cat3';

export interface StaffMember {
  id: string;
  name: string;
  dept: string;
  category: CategoryId;
}

export interface Prize {
  id: string;
  rank: number;
  name: string;
  tierLabel?: string;
}

export interface Winner extends StaffMember {
  rank: number;
  prize: string;
  timestamp: number;
}

export interface TierRules {
  cat1Cutoff: number; // e.g. 10 -> prizes 1..10
  cat2Cutoff: number; // e.g. 30 -> prizes 11..30
  // prizes > 30 are cat3 + all
}

export interface DrawState {
  prizes: string[];
  cat1: StaffMember[];
  cat2: StaffMember[];
  cat3: StaffMember[];
  winners: Winner[];
  currentPrizeIndex: number;
  tierRules: TierRules;
  rawInputs: {
    prizes: string;
    cat1: string;
    cat2: string;
    cat3: string;
  };
}
