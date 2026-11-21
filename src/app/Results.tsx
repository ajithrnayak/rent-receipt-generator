import { useEffect, useRef } from 'preact/hooks';
import { formatINR } from '../lib/money.ts';
import { receiptDateOf, spanOf, spanTitle } from '../lib/months.ts';
import type { Receipt } from '../lib/receipts.ts';

interface Props {
  receipts: Receipt[];
  url: string;
  filename: string;
}

export function Results({ receipts, url, filename }: Props) {
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
      <ol class="minis">
        {receipts.map((r, i) => {
          const p = spanOf(r.from, r.till);
          return (
            <li key={`${r.no}-${url}`} class="printed" style={{ animationDelay: `${Math.min(i * 60, 900)}ms` }}>
              <div class="mini">
                <div class="mini-top">
                  <span>Rent receipt</span>
                  <span>No. {r.no}</span>
                </div>
                <div class="mini-title">{spanTitle(r.from, r.till)}</div>
                <div class="mini-amount">₹{formatINR(r.amount)}</div>
                <div class="mini-period">{p.from} – {p.to}</div>
                <div>Dated {receiptDateOf(r.till)}</div>
                <div>{r.tenant} → {r.owner}</div>
                <div class="mini-address">{r.address}</div>
                <div class="mini-stamp" aria-hidden="true">PAID</div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
