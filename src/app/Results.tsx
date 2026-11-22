import { useEffect, useRef } from 'preact/hooks';
import type { Receipt } from '../lib/receipts.ts';
import { FIXED, wordingOf } from '../lib/wording.ts';

interface Props {
  receipts: Receipt[];
  url: string;
  filename: string;
  /** Back to the form to change something. */
  onEdit: () => void;
}

/** The receipts as they appear in the PDF: one sheet, receipts in rows, a dashed cut line between them. */
export function Results({ receipts, url, filename, onEdit }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the result so keyboard and screen-reader users land on the download.
  useEffect(() => heading.current?.focus(), [url]);
  const n = receipts.length;

  return (
    <section class="results" aria-labelledby="results-title">
      <div class="results-head">
        <h2 id="results-title" tabIndex={-1} ref={heading}>
          {n} {n === 1 ? 'receipt' : 'receipts'}, ready as one PDF
        </h2>
        <a class="btn btn-dark" href={url} download={filename}>
          Download PDF
        </a>
      </div>
      <ol class="sheet" aria-label="Preview of the receipts in the PDF">
        {receipts.map((r, i) => {
          const w = wordingOf(r);
          return (
            <li key={`${r.no}-${url}`} class="slip printed" style={{ animationDelay: `${Math.min(i * 60, 900)}ms` }}>
              <div class="slip-top">
                <span class="kicker">{FIXED.kicker}</span>
                <span>{w.no}</span>
              </div>
              <div class="slip-head">
                <h3 class="slip-title">{w.title}</h3>
                <span>{w.date}</span>
              </div>
              <p class="slip-sentence">
                {w.sentence.map((run) => (run.font === 'regular' ? run.text : <strong>{run.text}</strong>))}
              </p>
              <dl class="slip-rows">
                {w.rows.map(([label, value]) => (
                  <div>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {w.sign && (
                <div class="slip-sign" aria-hidden="true">
                  <div class="slip-sign-line">
                    <div />
                    <span>{FIXED.signature}</span>
                  </div>
                  <div class="slip-stamp">
                    <div>{FIXED.stamp}</div>
                    <span>{FIXED.stampCaption}</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div class="results-foot">
        <button type="button" class="link-btn" onClick={onEdit}>
          Edit details
        </button>
        <a class="btn btn-dark" href={url} download={filename}>
          Download PDF
        </a>
      </div>
    </section>
  );
}
