import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { amountInWords, formatINR } from '../lib/money.ts';
import { MONTH_NAMES, fyLabel, monthIndexOf, receiptDateOf, shortLabel, spanTitle, toMonth, yearOf, type Month } from '../lib/months.ts';
import {
  PAN_PATTERN, PAN_THRESHOLD, STAMP_THRESHOLD, cleanPan, cleanRent, firstOverlap, futureMonths,
  panNeeded, periodsOf, type PayMode, type Stay,
} from '../lib/receipts.ts';
import { unprintable } from '../lib/charset.ts';
import type { Action, Today } from './state.ts';

interface Props {
  stay: Stay;
  index: number;
  stays: Stay[];
  tenant: string;
  tried: boolean;
  today: Today;
  years: number[];
  totals: Map<Month, number>;
  dispatch: (a: Action) => void;
  tenantRef?: Ref<HTMLInputElement>;
}

type Note = { text: string; kind: 'warn' | 'info' };

const MODES: [PayMode, string][] = [
  ['bank', 'Bank transfer / UPI'],
  ['cheque', 'Cheque'],
  ['cash', 'Cash'],
];

function stampAdvice(mode: PayMode | null, largest: number): string {
  if (!mode) return 'Pick one; it prints on the receipts.';
  if (largest > 0 && largest <= STAMP_THRESHOLD) return 'Receipts of ₹5,000 or less don’t need a revenue stamp. The owner’s signature still helps if your employer asks.';
  if (mode === 'cash') return 'Cash rent over ₹5,000: put a ₹1 revenue stamp on each receipt and have the owner sign across it.';
  const how = mode === 'cheque' ? 'cheque' : 'bank transfer or UPI';
  return `Paid by ${how}: the Stamp Act still asks for a ₹1 stamp on receipts over ₹5,000, but many employers accept your bank statement instead. Check with yours.`;
}

/** Width in characters for a blank that grows with what's typed. */
function grow(value: string, placeholder: string): number {
  return Math.max(placeholder.length, value.length) + 1;
}

/** The address wraps like text on paper: a one-line text area that grows as you type. Enter moves on (handled by the form). */
function AddressBlank({ id, value, miss, onValue }: { id: string; value: string; miss: boolean; onValue: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      class={`blank blank-wide blank-address${miss ? ' miss' : ''}`}
      placeholder="House address, with city and PIN code"
      autoComplete="off"
      enterkeyhint="next"
      aria-invalid={miss || undefined}
      value={value}
      onInput={(e) => onValue(e.currentTarget.value.replace(/\s*\n\s*/g, ', '))}
    />
  );
}

/** Rent shows Indian grouping, except while you type, so the cursor never jumps. */
function RentBlank({ id, rent, miss, onRent }: { id: string; rent: number | null; miss: boolean; onRent: (v: number | null) => void }) {
  const [focused, setFocused] = useState(false);
  const shown = rent === null ? '' : focused ? String(rent) : formatINR(rent);
  return (
    <input
      id={id}
      class={`blank blank-rent${miss ? ' miss' : ''}`}
      type="text"
      inputMode="numeric"
      placeholder="Monthly rent"
      autoComplete="off"
      enterKeyHint="next"
      aria-invalid={miss || undefined}
      value={shown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onInput={(e) => {
        const el = e.currentTarget;
        const value = cleanRent(el.value);
        // Keep what's on screen in step with what's stored (letters are dropped).
        const text = value === null ? '' : String(value);
        if (el.value !== text) el.value = text;
        onRent(value);
      }}
    />
  );
}

function MonthPick({ id, label, value, years, onPick }: { id: string; label: string; value: Month; years: number[]; onPick: (m: Month) => void }) {
  return (
    <>
      <label class="sr-only" for={`${id}-m`}>{`${label} month`}</label>
      <select id={`${id}-m`} class="pick" value={String(monthIndexOf(value))} onChange={(e) => onPick(toMonth(yearOf(value), Number(e.currentTarget.value)))}>
        {MONTH_NAMES.map((name, i) => <option value={String(i)}>{name}</option>)}
      </select>
      <label class="sr-only" for={`${id}-y`}>{`${label} year`}</label>
      <select id={`${id}-y`} class="pick" value={String(yearOf(value))} onChange={(e) => onPick(toMonth(Number(e.currentTarget.value), monthIndexOf(value)))}>
        {years.map((y) => <option value={String(y)}>{y}</option>)}
      </select>
    </>
  );
}

export function StayCard({ stay, index, stays, tenant, tried, today, years, totals, dispatch, tenantRef }: Props) {
  const id = stay.id;
  const set = (patch: Partial<Omit<Stay, 'id'>>) => dispatch({ type: 'stay', id, patch });
  const multi = stays.length > 1;
  const label = multi ? `Stay ${index + 1}` : 'Rent receipt';

  const periods = periodsOf(stay);
  const overlap = firstOverlap(stays, index);
  const pan = panNeeded(stays, stay, totals);
  const largest = stay.rent ? Math.max(0, ...periods.map((p) => (p.till - p.from + 1) * stay.rent!)) : 0;

  const notes: Note[] = [];
  if (stay.till < stay.from) {
    notes.push({ kind: 'warn', text: 'The end month is before the start month, so this stay has no receipts yet.' });
  } else {
    if (overlap) notes.push({ kind: 'warn', text: `${shortLabel(overlap.month)} also appears in Stay ${overlap.other + 1}. That’s fine if you paid two rents that month; otherwise adjust the months.` });
    const future = futureMonths(stay, today.now);
    if (future.length) {
      const first = shortLabel(future[0]!);
      const span = future.length > 1 ? `${first} – ${shortLabel(future[future.length - 1]!)} haven’t` : `${first} hasn’t`;
      notes.push({ kind: 'warn', text: `${span} happened yet. Receipts are for rent you’ve already paid, so you may want to end at ${shortLabel(today.now)}.` });
    } else {
      // The receipt covering this month is dated after today (the 1st of next month).
      const current = periods.find((p) => p.from <= today.now && today.now <= p.till);
      if (current) {
        const which = current.from === current.till ? `${MONTH_NAMES[monthIndexOf(current.from)]}’s receipt` : `The ${spanTitle(current.from, current.till)} receipt`;
        notes.push({ kind: 'warn', text: `${which} will be dated ${receiptDateOf(current.till)}. Make it once you’ve paid, or end this stay at ${shortLabel(current.from - 1)}.` });
      }
    }
  }
  if (pan.needed && !stay.pan) {
    const where = multi ? 'Rent across your stays' : 'Rent';
    notes.push({ kind: 'info', text: `${where} comes to ₹${formatINR(pan.total)} in the ${fyLabel(pan.fy!)} financial year, above ₹${formatINR(PAN_THRESHOLD)}, so your employer will ask for the owner’s PAN. Owner has no PAN? Ask your employer what they accept instead.` });
  }
  if (stay.pan && !PAN_PATTERN.test(stay.pan) && (stay.pan.length === 10 || tried)) {
    notes.push({ kind: 'warn', text: 'That PAN doesn’t look right: it’s 5 letters, 4 digits, then a letter.' });
  }
  const odd = unprintable([index === 0 ? tenant : '', stay.address, stay.owner].join(''));
  if (odd.length) {
    notes.push({ kind: 'warn', text: `The PDF can only print English letters for now, so ${odd.slice(0, 5).map((c) => `“${c}”`).join(' ')} won’t show. Please type names and the address in English.` });
  }

  const thisFY = stay.from === today.fy && stay.till === today.fyToDate;
  const lastFY = stay.from === today.fy - 12 && stay.till === today.fy - 1;
  const count = periods.length;
  const rangeLabel = stay.till >= stay.from ? `${shortLabel(stay.from)} – ${shortLabel(stay.till)}` : '—';
  const missTenant = tried && !tenant.trim();

  return (
    <section class={`stay${overlap ? ' overlap' : ''}`} aria-labelledby={`stay-${id}-title`}>
      <div class="paper">
        <div class="paper-head">
          <div class="paper-title">
            <h2 class="paper-kicker" id={`stay-${id}-title`}>Rent receipt{multi && <span class="sr-only">, {label}</span>}</h2>
            {multi && <span class="paper-stay" aria-hidden="true">{label}</span>}
          </div>
          {multi && (
            <button type="button" class="link-btn" onClick={() => dispatch({ type: 'remove', id })}>
              Remove stay<span class="sr-only"> {index + 1}</span>
            </button>
          )}
        </div>

        <p>
          Received with thanks from{' '}
          {index === 0 ? (
            <>
              <label class="sr-only" for="tenant">Your name</label>
              <input
                id="tenant"
                ref={tenantRef}
                class={`blank${missTenant ? ' miss' : ''}`}
                type="text"
                placeholder="Your name"
                size={grow(tenant, 'Your name')}
                autoComplete="name"
                enterKeyHint="next"
                aria-invalid={missTenant || undefined}
                value={tenant}
                onInput={(e) => dispatch({ type: 'tenant', value: e.currentTarget.value })}
              />
            </>
          ) : (
            <strong>{tenant.trim() || 'your name (from the first stay)'}</strong>
          )}{' '}
          the sum of{' '}
          <span class="nowrap">
            ₹<label class="sr-only" for={`rent-${id}`}>Monthly rent in rupees</label>
            <RentBlank id={`rent-${id}`} rent={stay.rent} miss={tried && !stay.rent} onRent={(rent) => set({ rent })} />
          </span>{' '}
          per month{' '}
          {stay.rent ? <span class="words">({amountInWords(stay.rent)})</span> : null} towards rent for the house at
        </p>

        <div>
          <label class="sr-only" for={`addr-${id}`}>House address</label>
          <AddressBlank id={`addr-${id}`} value={stay.address} miss={tried && !stay.address.trim()} onValue={(address) => set({ address })} />
        </div>

        <p>
          for every month from <MonthPick id={`from-${id}`} label="From" value={stay.from} years={years} onPick={(from) => set({ from })} /> to{' '}
          <MonthPick id={`till-${id}`} label="Till" value={stay.till} years={years} onPick={(till) => set({ till })} />
          <span class="punct">.</span>
        </p>

        <p>
          Received by{' '}
          <label class="sr-only" for={`owner-${id}`}>House owner’s full name</label>
          <input
            id={`owner-${id}`}
            class={`blank${tried && !stay.owner.trim() ? ' miss' : ''}`}
            type="text"
            placeholder="Owner’s full name"
            size={grow(stay.owner, 'Owner’s full name')}
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={(tried && !stay.owner.trim()) || undefined}
            value={stay.owner}
            onInput={(e) => set({ owner: e.currentTarget.value })}
          />
          <span class="punct">,</span> PAN{' '}
          <label class="sr-only" for={`pan-${id}`}>{pan.needed ? 'Owner’s PAN, needed because yearly rent is over 1 lakh' : 'Owner’s PAN, optional'}</label>
          <input
            id={`pan-${id}`}
            class="blank blank-pan"
            type="text"
            placeholder={pan.needed ? 'Needed' : 'Optional'}
            maxLength={10}
            autoComplete="off"
            autoCapitalize="characters"
            spellcheck={false}
            enterKeyHint="next"
            value={stay.pan}
            onInput={(e) => {
              const el = e.currentTarget;
              const value = cleanPan(el.value);
              if (el.value !== value) el.value = value;
              set({ pan: value });
            }}
          />
          <span class="punct">.</span>
        </p>

        {stay.sign && (
          <div class="sign-boxes" aria-hidden="true">
            <div class="sign-line">
              <div />
              <span class="sign-caption">Owner’s signature</span>
            </div>
            <div class="sign-stamp">
              <div>₹1 stamp</div>
              <span class="sign-caption">Revenue stamp</span>
            </div>
          </div>
        )}
      </div>

      <div class="strip">
        <div class="chips" role="group" aria-label={`Period, ${label}`}>
          <span class="chips-label" aria-hidden="true">Period</span>
          <button type="button" class="chip" aria-pressed={thisFY} onClick={() => set({ from: today.fy, till: today.fyToDate })}>
            This financial year so far
          </button>
          <button type="button" class="chip" aria-pressed={lastFY} onClick={() => set({ from: today.fy - 12, till: today.fy - 1 })}>
            Last financial year
          </button>
        </div>

        <div class="chips" role="group" aria-label={`Receipts, ${label}`}>
          <span class="chips-label" aria-hidden="true">Receipts</span>
          <button type="button" class="chip" aria-pressed={stay.frequency === 'monthly'} onClick={() => set({ frequency: 'monthly' })}>
            One a month
          </button>
          <button type="button" class="chip" aria-pressed={stay.frequency === 'quarterly'} onClick={() => set({ frequency: 'quarterly' })}>
            One a quarter
          </button>
        </div>

        <label class="check">
          <input type="checkbox" checked={stay.sign} onChange={(e) => set({ sign: e.currentTarget.checked })} />
          <span class="check-text">
            <span>Add a signature line and revenue-stamp box</span>
            <span class="hint">Receipts over ₹5,000 legally carry a ₹1 revenue stamp, signed across by the owner. Paid online? Many employers accept your bank statement instead; check with yours.</span>
          </span>
        </label>

        {stay.sign && (
          <div class="mode">
            <span id={`mode-${id}`} class="hint">How did you pay?</span>
            <div class="chips" role="group" aria-labelledby={`mode-${id}`}>
              {MODES.map(([mode, text]) => (
                <button type="button" class="chip" aria-pressed={stay.mode === mode} onClick={() => set({ mode })}>{text}</button>
              ))}
            </div>
            <p class="hint" aria-live="polite">{stampAdvice(stay.mode, largest)}</p>
          </div>
        )}

        {notes.map((n) => (
          // Warnings are announced; the PAN info note is not, since its total changes on every keystroke of rent.
          <p class={`note note-${n.kind}`} role={n.kind === 'warn' ? 'status' : undefined}>{n.text}</p>
        ))}

        <div class="count">
          <span>
            {count} {count === 1 ? 'receipt' : 'receipts'}
            {stay.frequency === 'quarterly' && count > 0 ? ', one a quarter' : ''}
          </span>
          <span>{rangeLabel}</span>
        </div>
      </div>
    </section>
  );
}
