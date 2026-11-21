import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { shortLabel, yearOf } from '../lib/months.ts';
import { buildReceipts, periodsOf, rentByFinancialYear, type Receipt } from '../lib/receipts.ts';
import { initialState, reducer, today as getToday } from './state.ts';
import { StayCard } from './StayCard.tsx';
import { Results } from './Results.tsx';

type Generated =
  | { status: 'idle' }
  | { status: 'working'; key: string }
  | { status: 'ready'; key: string; url: string; filename: string; receipts: Receipt[] }
  | { status: 'error'; key: string; message: string };

// Starts downloading the PDF code once someone types into the form (not on page load, which
// focuses the first blank), so Generate feels instant without costing every visitor 300 KB.
let warmed = false;
function warmPdf() {
  if (warmed) return;
  warmed = true;
  void import('../pdf/generate.ts').catch(() => {
    warmed = false;
  });
}

function fileName(receipts: Receipt[]): string {
  const first = receipts[0]!;
  const last = receipts[receipts.length - 1]!;
  const slug = (m: number) => shortLabel(m).toLowerCase().replace(' ', '-');
  return `rent-receipts-${slug(first.from)}-to-${slug(last.till)}.pdf`;
}

export function App() {
  const today = useMemo(() => getToday(), []);
  const [state, dispatch] = useReducer(reducer(today), today, initialState);
  const [gen, setGen] = useState<Generated>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const tenantRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The cursor starts on the first blank.
  useEffect(() => tenantRef.current?.focus(), []);

  const receipts = useMemo(() => buildReceipts(state.tenant, state.stays), [state.tenant, state.stays]);
  const totals = useMemo(() => rentByFinancialYear(state.stays), [state.stays]);
  const key = useMemo(() => JSON.stringify([state.tenant, state.stays]), [state.tenant, state.stays]);

  const years = useMemo(() => {
    const fyYear = yearOf(today.fy);
    const all = state.stays.flatMap((s) => [yearOf(s.from), yearOf(s.till)]);
    const lo = Math.min(fyYear - 3, ...all);
    const hi = Math.max(fyYear + 1, ...all);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [state.stays, today.fy]);

  const missing: string[] = [];
  if (!state.tenant.trim()) missing.push('your name');
  state.stays.forEach((s, i) => {
    const which = state.stays.length > 1 ? ` (stay ${i + 1})` : '';
    if (!s.rent) missing.push(`monthly rent${which}`);
    if (!s.address.trim()) missing.push(`address${which}`);
    if (!s.owner.trim()) missing.push(`owner’s name${which}`);
  });
  const noReceipts = missing.length === 0 && receipts.length === 0;

  // Any edit makes an earlier PDF stale: drop it.
  useEffect(() => {
    if (gen.status !== 'idle' && gen.key !== key) {
      if (gen.status === 'ready') URL.revokeObjectURL(gen.url);
      setGen({ status: 'idle' });
    }
  }, [key]);

  // After a failed Generate, move to the first highlighted blank.
  useEffect(() => {
    if (attempt) formRef.current?.querySelector<HTMLElement>('.miss')?.focus();
  }, [attempt]);

  async function generate(e: Event) {
    e.preventDefault();
    dispatch({ type: 'tried' });
    if (missing.length || !receipts.length) {
      setAttempt((n) => n + 1);
      return;
    }
    setGen({ status: 'working', key });
    try {
      const { makePdf } = await import('../pdf/generate.ts');
      const blob = await makePdf(receipts);
      setGen({ status: 'ready', key, url: URL.createObjectURL(blob), filename: fileName(receipts), receipts });
    } catch (err) {
      console.error(err);
      setGen({ status: 'error', key, message: 'Something went wrong while making the PDF. Please try again; if it keeps happening, try another browser.' });
    }
  }

  // Enter moves to the next blank instead of submitting.
  function onKeyDown(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (e.key !== 'Enter' || !el.classList.contains('blank')) return;
    e.preventDefault();
    const blanks = Array.from(formRef.current?.querySelectorAll<HTMLElement>('.blank') ?? []);
    blanks[blanks.indexOf(el) + 1]?.focus();
  }

  const working = gen.status === 'working';
  // Count what the chosen months will make, even before rent is typed.
  const n = state.stays.reduce((sum, s) => sum + periodsOf(s).length, 0);

  return (
    <>
      <form class="form" ref={formRef} onSubmit={generate} onKeyDown={onKeyDown} onInput={warmPdf} noValidate>
        {state.stays.map((stay, index) => (
          <StayCard
            key={stay.id}
            stay={stay}
            index={index}
            stays={state.stays}
            tenant={state.tenant}
            tried={state.tried}
            today={today}
            years={years}
            totals={totals}
            dispatch={dispatch}
            tenantRef={index === 0 ? tenantRef : undefined}
          />
        ))}

        <p class="no-email">
          <s>Email address</s> Not needed. We don’t collect anything, so there’s nothing to send.
        </p>

        <div class="actions">
          <button type="button" class="btn btn-secondary" onClick={() => dispatch({ type: 'add' })}>
            + Add another stay
          </button>
          <button type="submit" class="btn btn-primary" disabled={working} aria-disabled={working || undefined}>
            {working ? 'Making your PDF…' : `Generate ${n} ${n === 1 ? 'receipt' : 'receipts'}`}
          </button>
        </div>

        {state.tried && missing.length > 0 && (
          <p class="alert" role="alert">Almost there. Fill in the highlighted blanks: {missing.join(', ')}.</p>
        )}
        {state.tried && noReceipts && (
          <p class="alert" role="alert">No months to make receipts for yet. Check the months in each stay.</p>
        )}
        {gen.status === 'error' && <p class="alert" role="alert">{gen.message}</p>}
      </form>

      {gen.status === 'ready' && <Results receipts={gen.receipts} url={gen.url} filename={gen.filename} />}
    </>
  );
}
