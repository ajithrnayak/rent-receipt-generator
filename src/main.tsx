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

// "Why use this?", "How it works" and "Sample receipt" are native <dialog>s in the static
// HTML, so their text is indexable. Each [data-open] button opens the dialog with that id.
// Escape closes it natively; focus goes back to the button that opened it.
const links = document.querySelector<HTMLElement>('.intro-links');
if (links && typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype) {
  for (const opener of links.querySelectorAll<HTMLButtonElement>('[data-open]')) {
    const dialog = document.getElementById(opener.dataset.open!) as HTMLDialogElement | null;
    if (!dialog) continue;
    opener.addEventListener('click', () => dialog.showModal());
    for (const close of dialog.querySelectorAll<HTMLButtonElement>('[data-close]')) {
      close.addEventListener('click', () => dialog.close());
    }
    // Close on a click outside the card. The dialog has no padding of its own (it is on
    // .dialog-inner), so a click that lands on the dialog element itself is on the backdrop.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => opener.focus());
  }
  links.hidden = false;
}
