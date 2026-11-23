import { render } from 'preact';
import { App } from './app/App.tsx';
import { readPrerendered } from './app/seed.ts';
import './styles.css';

const tool = document.getElementById('tool');
if (tool) {
  // Keep anything typed into the pre-rendered form, then swap in the live one.
  const seed = readPrerendered(tool);
  tool.textContent = '';
  render(<App seed={seed} />, tool);
}

// "Why use this?" is a native <dialog> in the static HTML, so its text is indexable.
// Escape closes it natively; focus goes back to the button that opened it.
const dialog = document.getElementById('why') as HTMLDialogElement | null;
const opener = document.getElementById('why-open') as HTMLButtonElement | null;
if (dialog && opener && typeof dialog.showModal === 'function') {
  opener.hidden = false;
  opener.addEventListener('click', () => dialog.showModal());
  for (const close of dialog.querySelectorAll<HTMLButtonElement>('[data-close]')) {
    close.addEventListener('click', () => dialog.close());
  }
  // Close on a click outside the card. The dialog has no padding of its own (it is on
  // .why-inner), so a click that lands on the dialog element itself is on the backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => opener.focus());
}
