const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalise a Date / ISO string / epoch ms to the UTC midnight (ms) of that calendar day. */
export function startOfDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

export function addDays(value, days) {
  return new Date(startOfDay(value) + days * DAY_MS);
}

export function isoDate(value) {
  return new Date(startOfDay(value)).toISOString().slice(0, 10);
}

/** Monday (UTC) of the ISO week that contains `value`. */
export function weekStart(value) {
  const day = new Date(startOfDay(value));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
