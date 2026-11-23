import { toMonth } from '../lib/months.ts';
import { cleanPan, cleanRent, type Frequency, type Stay } from '../lib/receipts.ts';
import type { Seed } from './state.ts';

/**
 * The pre-rendered form (vite.config.ts) can be typed into before the script loads.
 * Before the live form replaces it, keep whatever was changed there. Only fields that
 * differ from their pre-rendered default count: the month menus were rendered at
 * build time, so an untouched one must not override today's months.
 */
export function readPrerendered(root: HTMLElement): Seed {
  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`);
  const typed = (id: string) => {
    const el = find<HTMLInputElement | HTMLTextAreaElement>(id);
    return el && el.value !== el.defaultValue ? el.value : undefined;
  };
  const picked = (id: string) => {
    const el = find<HTMLSelectElement>(id);
    const option = el?.selectedOptions[0];
    return el && option && !option.defaultSelected ? el.value : undefined;
  };

  const seed: Seed = {};
  const stay: Partial<Omit<Stay, 'id'>> = {};

  const tenant = typed('tenant');
  if (tenant !== undefined) seed.tenant = tenant;
  const rent = typed('rent-1');
  if (rent !== undefined) stay.rent = cleanRent(rent);
  const address = typed('addr-1');
  if (address !== undefined) stay.address = address.replace(/\s*\n\s*/g, ', ');
  const owner = typed('owner-1');
  if (owner !== undefined) stay.owner = owner;
  const pan = typed('pan-1');
  if (pan !== undefined) stay.pan = cleanPan(pan);
  const frequency = picked('freq-1');
  if (frequency !== undefined) stay.frequency = frequency as Frequency;
  for (const end of ['from', 'till'] as const) {
    if (picked(`${end}-1-m`) === undefined && picked(`${end}-1-y`) === undefined) continue;
    // Either menu changed: take both as they were on screen.
    const month = find<HTMLSelectElement>(`${end}-1-m`)!;
    const year = find<HTMLSelectElement>(`${end}-1-y`)!;
    stay[end] = toMonth(Number(year.value), Number(month.value));
  }
  const sign = find<HTMLInputElement>('sign-1');
  if (sign && sign.checked !== sign.defaultChecked) stay.sign = sign.checked;

  if (Object.keys(stay).length) seed.stay = stay;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.id && root.contains(active)) seed.focus = active.id;
  return seed;
}
