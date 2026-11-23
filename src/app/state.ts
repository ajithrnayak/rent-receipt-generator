import { fyStartOf, toMonth, type Month } from '../lib/months.ts';
import type { Frequency, PayMode, Stay } from '../lib/receipts.ts';

export interface Today {
  /** The current month. */
  now: Month;
  /** April of the current financial year. */
  fy: Month;
  /** Last month of "this financial year so far": last month, but never before April. */
  fyToDate: Month;
}

export function today(date = new Date()): Today {
  const now = toMonth(date.getFullYear(), date.getMonth());
  const fy = fyStartOf(now);
  return { now, fy, fyToDate: Math.max(fy, now - 1) };
}

export interface State {
  tenant: string;
  stays: Stay[];
  nextId: number;
  /** Set after the first Generate press, to highlight missing blanks. */
  tried: boolean;
}

export type Action =
  | { type: 'tenant'; value: string }
  | { type: 'stay'; id: number; patch: Partial<Omit<Stay, 'id'>> }
  | { type: 'add' }
  | { type: 'remove'; id: number }
  | { type: 'tried' };

/** What someone typed into the pre-rendered form before the script took over (see seed.ts). */
export interface Seed {
  tenant?: string;
  /** Changes to the first stay, the only one the pre-rendered page has. */
  stay?: Partial<Omit<Stay, 'id'>>;
  /** The id of the field that had the cursor. */
  focus?: string;
}

export function initialState(t: Today, seed: Seed = {}): State {
  return {
    tenant: seed.tenant ?? '',
    stays: [{ ...blankStay(1, t.fy, t.fyToDate, 'monthly', false, null), ...seed.stay }],
    nextId: 2,
    tried: false,
  };
}

function blankStay(id: number, from: Month, till: Month, frequency: Frequency, sign: boolean, mode: PayMode | null): Stay {
  return { id, rent: null, address: '', owner: '', pan: '', from, till, frequency, sign, mode };
}

export function reducer(t: Today) {
  return (state: State, action: Action): State => {
    switch (action.type) {
      case 'tenant':
        return { ...state, tenant: action.value };
      case 'stay':
        return { ...state, stays: state.stays.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
      case 'add': {
        // A new stay continues where the last one ended; how you pay and the
        // receipt style carry over; owner, address and rent start blank.
        const last = state.stays[state.stays.length - 1]!;
        const from = last.till + 1;
        const stay = blankStay(state.nextId, from, Math.max(from, t.fyToDate), last.frequency, last.sign, last.mode);
        return { ...state, stays: [...state.stays, stay], nextId: state.nextId + 1 };
      }
      case 'remove':
        return state.stays.length > 1 ? { ...state, stays: state.stays.filter((s) => s.id !== action.id) } : state;
      case 'tried':
        return { ...state, tried: true };
    }
  };
}
