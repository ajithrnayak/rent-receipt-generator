import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { shortLabel } from '../lib/months.ts';
import { problemOf } from '../lib/notes.ts';
import { buildReceipts, panNeeded, periodsOf, rentByFinancialYear, type Receipt } from '../lib/receipts.ts';
import { initialState, reducer, today as getToday, type Seed } from './state.ts';
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

export function App({ seed }: { seed?: Seed }) {
  const [today, setToday] = useState(getToday);
  const [state, dispatch] = useReducer(reducer(today), today, (t) => initialState(t, seed));
  const [gen, setGen] = useState<Generated>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const tenantRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The cursor starts on the first blank, without scrolling: on phones the headline must stay in view.
  // If someone was already typing into the pre-rendered form, it goes back where they were.
  useEffect(() => {
    const el = (seed?.focus && document.getElementById(seed.focus)) || tenantRef.current;
    el?.focus({ preventScroll: true });
    // Caret to the end, on text fields only (setSelectionRange throws on a checkbox).
    if (seed?.focus && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text'))) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  // A tab left open into a new month moves "today" on when it is looked at again.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      setToday((t) => {
        const next = getToday();
        return next.now === t.now ? t : next;
      });
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  const receipts = useMemo(() => buildReceipts(state.tenant, state.stays), [state.tenant, state.stays]);
  const totals = useMemo(() => rentByFinancialYear(state.stays), [state.stays]);
  const key = useMemo(() => JSON.stringify([state.tenant, state.stays]), [state.tenant, state.stays]);
  // The form as it is now, for a PDF that finishes after an edit.
  const keyRef = useRef(key);
  keyRef.current = key;
  const runRef = useRef(0);

  const missing: string[] = [];
  const notEnglish: string[] = [];
  const check = (value: string, what: string) => {
    const problem = problemOf(value);
    if (problem === 'blank') missing.push(what);
    if (problem === 'english') notEnglish.push(what);
  };
  check(state.tenant, 'your name');
  state.stays.forEach((s, i) => {
    const which = state.stays.length > 1 ? ` (stay ${i + 1})` : '';
    if (!s.rent) missing.push(`monthly rent${which}`);
    check(s.address, `address${which}`);
    check(s.owner, `owner’s name${which}`);
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

  // After removing a stay, focus goes to the stay before it (or the new first one), not the page.
  const removedAt = useRef<number | null>(null);
  useEffect(() => {
    if (removedAt.current === null) return;
    const headings = formRef.current?.querySelectorAll<HTMLElement>('.stay h2');
    headings?.[Math.max(0, removedAt.current - 1)]?.focus();
    removedAt.current = null;
  }, [state.stays.length]);

  async function generate(e: Event) {
    e.preventDefault();
    dispatch({ type: 'tried' });
    if (missing.length || notEnglish.length || !receipts.length) {
      setAttempt((n) => n + 1);
      return;
    }
    // Generating again without changes replaces the earlier PDF.
    if (gen.status === 'ready') URL.revokeObjectURL(gen.url);
    const run = ++runRef.current;
    // Only the latest run, for the form as it still is, may show its result.
    const current = () => run === runRef.current && keyRef.current === key;
    setGen({ status: 'working', key });
    try {
      const { makePdf } = await import('../pdf/generate.ts');
      const blob = await makePdf(receipts);
      if (!current()) return;
      setGen({ status: 'ready', key, url: URL.createObjectURL(blob), filename: fileName(receipts), receipts });
    } catch (err) {
      console.error(err);
      if (!current()) return;
      setGen({ status: 'error', key, message: 'Something went wrong while making the PDF. Please try again; if it keeps happening, try another browser.' });
    }
  }

  // Enter never submits from inside the form, only from the Generate button. (Not the Enter that confirms an IME composition.)
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const el = e.target as HTMLElement;
    // On a pay-mode choice, Enter picks it; on the checkbox it does nothing (Space ticks it).
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      e.preventDefault();
      if (el.type === 'radio' && !el.checked) el.click();
      return;
    }
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    // In a typed field Enter never submits. On a blank it moves to the next one; in a year box it just stays.
    e.preventDefault();
    if (!el.classList.contains('blank')) return;
    const blanks = Array.from(formRef.current?.querySelectorAll<HTMLElement>('.blank') ?? []);
    blanks[blanks.indexOf(el) + 1]?.focus();
  }

  // The PAN total is page-wide: say it once, on the first stay that needs the PAN and lacks it.
  const panNoteAt = state.stays.findIndex((s) => !s.pan && panNeeded(state.stays, s, totals).needed);

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
            totals={totals}
            dispatch={dispatch}
            onRemove={() => {
              removedAt.current = index;
              dispatch({ type: 'remove', id: stay.id });
            }}
            tenantRef={index === 0 ? tenantRef : undefined}
            showPanNote={index === panNoteAt}
          />
        ))}

        <button type="button" class="btn btn-secondary add-stay" onClick={() => dispatch({ type: 'add' })}>
          + Add another stay
        </button>

        {state.tried && missing.length > 0 && (
          <p class="alert" role="alert">Almost there. Fill in the highlighted blanks: {missing.join(', ')}.</p>
        )}
        {state.tried && notEnglish.length > 0 && (
          <p class="alert" role="alert">The PDF can only print English letters. Please retype in English: {notEnglish.join(', ')}.</p>
        )}
        {state.tried && noReceipts && (
          <p class="alert" role="alert">No months to make receipts for yet. Check the months in each stay.</p>
        )}
        {gen.status === 'error' && <p class="alert" role="alert">{gen.message}</p>}

        {/* On phones this bar sticks to the bottom of the screen while the form scrolls. */}
        <div class="go">
          <p class="trust">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
            Made on your device. Nothing is uploaded.
          </p>
          <button type="submit" class="btn btn-primary" disabled={working} aria-disabled={working || undefined}>
            {working ? 'Making your PDF…' : `Generate ${n} ${n === 1 ? 'receipt' : 'receipts'}`}
          </button>
        </div>
      </form>

      {gen.status === 'ready' && (
        <Results receipts={gen.receipts} url={gen.url} filename={gen.filename} onEdit={() => tenantRef.current?.focus()} />
      )}
    </>
  );
}
