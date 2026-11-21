import { render } from 'preact';
import { App } from './app/App.tsx';
import './styles.css';

const tool = document.getElementById('tool');
if (tool) {
  tool.textContent = '';
  render(<App />, tool);
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
  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => opener.focus());
}
