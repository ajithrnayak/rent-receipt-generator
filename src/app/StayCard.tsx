import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Ref } from 'preact';
import { amountInWords, formatINR } from '../lib/money.ts';
import { MONTH_NAMES, monthIndexOf, parseYear, shortLabel, toMonth, yearOf, type Month } from '../lib/months.ts';
import { largestReceipt, notesFor, problemOf, stampAdvice } from '../lib/notes.ts';
import { cleanPan, cleanRent, firstOverlap, panNeeded, periodsOf, type Frequency, type PayMode, type Stay } from '../lib/receipts.ts';
import { FIXED, MODE_LABEL } from '../lib/wording.ts';
import type { Action, Today } from './state.ts';

interface Props {
  stay: Stay;
  index: number;
  stays: Stay[];
  tenant: string;
  tried: boolean;
  today: Today;
  totals: Map<Month, number>;
  dispatch: (a: Action) => void;
  onRemove: () => void;
  tenantRef?: Ref<HTMLInputElement>;
  /** The page-wide PAN note shows on one stay only: the first that needs it. */
  showPanNote: boolean;
}

const MODES = Object.entries(MODE_LABEL) as [PayMode, string][];

/** Width in characters for a blank that grows with what's typed (CSS caps it at the line's width). */
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

/**
 * The year is typed, so any year works. Digits only; it takes effect once the four
 * digits make a valid year, and a half-typed one goes back to the stored year on leaving.
 */
function YearBlank({ id, year, onYear }: { id: string; year: number; onYear: (y: number) => void }) {
  // null when not editing: show the stored year.
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      id={id}
      class="pick pick-year"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="next"
      value={text ?? String(year)}
      onFocus={() => setText(String(year))}
      onBlur={() => setText(null)}
      onInput={(e) => {
        const el = e.currentTarget;
        const digits = el.value.replace(/\D/g, '').slice(0, 4);
        if (el.value !== digits) el.value = digits;
        setText(digits);
        const typed = parseYear(digits);
        if (typed !== null && typed !== year) onYear(typed);
      }}
    />
  );
}

function MonthPick({ id, label, value, onPick }: { id: string; label: string; value: Month; onPick: (m: Month) => void }) {
  return (
    <span class="pair">
      <label class="sr-only" for={`${id}-m`}>{`${label} month`}</label>
      <select id={`${id}-m`} class="pick" value={String(monthIndexOf(value))} onChange={(e) => onPick(toMonth(yearOf(value), Number(e.currentTarget.value)))}>
        {MONTH_NAMES.map((name, i) => <option value={String(i)}>{name}</option>)}
      </select>
      <label class="sr-only" for={`${id}-y`}>{`${label} year`}</label>
      <YearBlank id={`${id}-y`} year={yearOf(value)} onYear={(y) => onPick(toMonth(y, monthIndexOf(value)))} />
    </span>
  );
}

export function StayCard({ stay, index, stays, tenant, tried, today, totals, dispatch, onRemove, tenantRef, showPanNote }: Props) {
  const id = stay.id;
  const set = (patch: Partial<Omit<Stay, 'id'>>) => dispatch({ type: 'stay', id, patch });
  const multi = stays.length > 1;
  const label = multi ? `Stay ${index + 1}` : 'Rent receipt';

  const count = periodsOf(stay).length;
  const overlap = firstOverlap(stays, index);
  const pan = panNeeded(stays, stay, totals);
  const notes = notesFor({ stays, index, tenant, tried, now: today.now, totals, showPanNote });

  const rangeLabel = stay.till >= stay.from ? `${shortLabel(stay.from)} – ${shortLabel(stay.till)}` : '—';
  // A blank is highlighted after Generate if it is empty or holds letters the PDF can't print.
  const missTenant = tried && problemOf(tenant) !== null;
  const missAddress = tried && problemOf(stay.address) !== null;
  const missOwner = tried && problemOf(stay.owner) !== null;
  const showSignHint = !(stay.sign && stay.mode);

  return (
    <section class={`stay${overlap ? ' overlap' : ''}`} aria-labelledby={`stay-${id}-title`}>
      <div class="paper">
        <div class="paper-head">
          <div class="paper-title">
            {/* Focusable from script only, so removing a stay can move focus here. */}
            <h2 class="kicker" id={`stay-${id}-title`} tabIndex={-1}>Rent receipt{multi && <span class="sr-only">, {label}</span>}</h2>
            {multi && <span class="paper-stay" aria-hidden="true">{label}</span>}
          </div>
          {multi && (
            <button type="button" class="link-btn" onClick={onRemove}>
              Remove stay<span class="sr-only"> {index + 1}</span>
            </button>
          )}
        </div>

        <p>
          Received from{' '}
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
          {stay.rent ? <span class="words">({amountInWords(stay.rent)})</span> : null} towards rent for the property at
        </p>

        <div>
          <label class="sr-only" for={`addr-${id}`}>House address</label>
          <AddressBlank id={`addr-${id}`} value={stay.address} miss={missAddress} onValue={(address) => set({ address })} />
        </div>

        <p>
          for every{' '}
          <label class="sr-only" for={`freq-${id}`}>One receipt for every month or quarter</label>
          <select id={`freq-${id}`} class="pick pick-inline" value={stay.frequency} onChange={(e) => set({ frequency: e.currentTarget.value as Frequency })}>
            <option value="monthly">month</option>
            <option value="quarterly">quarter</option>
          </select>{' '}
          from <MonthPick id={`from-${id}`} label="From" value={stay.from} onPick={(from) => set({ from })} /> to{' '}
          <MonthPick id={`till-${id}`} label="Till" value={stay.till} onPick={(till) => set({ till })} />
          <span class="punct">.</span>
        </p>
        <p class="fill">
          <span>Fill:</span>{' '}
          <button type="button" class="link-btn" onClick={() => set({ from: today.fy, till: today.fyToDate })}>
            this financial year so far
          </button>
          <span class="fill-sep" aria-hidden="true"> · </span>
          <button type="button" class="link-btn" onClick={() => set({ from: today.fy - 12, till: today.fy - 1 })}>
            last financial year
          </button>
        </p>

        <p>
          Received by{' '}
          <label class="sr-only" for={`owner-${id}`}>House owner’s full name</label>
          <input
            id={`owner-${id}`}
            class={`blank${missOwner ? ' miss' : ''}`}
            type="text"
            placeholder="Owner’s full name"
            size={grow(stay.owner, 'Owner’s full name')}
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={missOwner || undefined}
            value={stay.owner}
            onInput={(e) => set({ owner: e.currentTarget.value })}
          />
          <span class="punct">,</span> PAN{' '}
          <label class="sr-only" for={`pan-${id}`}>{pan.needed ? 'Owner’s PAN, needed because yearly rent is over 1 lakh' : 'Owner’s PAN, optional'}</label>
          {/* No maxLength: it would cut a pasted "ABCPV 1234 K" before cleanPan drops the spaces. cleanPan caps it at 10. */}
          <input
            id={`pan-${id}`}
            class="blank blank-pan"
            type="text"
            placeholder={pan.needed ? 'Needed' : 'Optional'}
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
              <span class="sign-caption">{FIXED.signature}</span>
            </div>
            <div class="sign-stamp">
              <div>{FIXED.stamp}</div>
              <span class="sign-caption">{FIXED.stampCaption}</span>
            </div>
          </div>
        )}
      </div>

      <div class="strip">
        <div class="check">
          <label class="check-label">
            <input
              id={`sign-${id}`}
              type="checkbox"
              checked={stay.sign}
              aria-describedby={showSignHint ? `sign-${id}-hint` : undefined}
              onChange={(e) => set({ sign: e.currentTarget.checked })}
            />
            <span>Add a signature line and revenue-stamp box</span>
          </label>
          {showSignHint && (
            <span class="hint check-hint" id={`sign-${id}-hint`}>Receipts over ₹5,000 legally carry a ₹1 revenue stamp, signed across by the owner. Paid online? Many employers accept your bank statement instead; check with yours.</span>
          )}
        </div>

        {stay.sign && (
          <div class="mode">
            <div class="chips" role="radiogroup" aria-labelledby={`mode-${id}`}>
              <span id={`mode-${id}`} class="chips-label">Paid by</span>
              {MODES.map(([mode, text]) => (
                <label class="chip">
                  <input type="radio" name={`mode-${id}`} value={mode} checked={stay.mode === mode} onChange={() => set({ mode })} />
                  {text}
                </label>
              ))}
            </div>
            <p class="hint" aria-live="polite">{stampAdvice(stay.mode, largestReceipt(stay))}</p>
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
