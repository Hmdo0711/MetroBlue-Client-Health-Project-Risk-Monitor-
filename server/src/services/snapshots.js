import fs from 'node:fs';
import path from 'node:path';

/**
 * Stores one status snapshot per week so the weekly summary can report movement
 * (escalated / improved projects). File-backed by default; swap for a DB table.
 */
export function createSnapshotStore({ dir, baseline = () => null }) {
  const file = path.join(dir, 'snapshots.json');

  const readAll = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  };

  return {
    /** Latest snapshot strictly before the given week (ISO date of Monday). */
    previousFor(weekStartIso, now) {
      const earlier = readAll()
        .filter((s) => s.weekStart < weekStartIso)
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      return earlier[0] ?? baseline(now) ?? null;
    },

    /** Record (or overwrite) the snapshot for a week. Stores every project, unscoped. */
    save(weekStartIso, projectViews) {
      fs.mkdirSync(dir, { recursive: true });
      const all = readAll().filter((s) => s.weekStart !== weekStartIso);
      all.push({
        weekStart: weekStartIso,
        takenAt: new Date().toISOString(),
        statuses: Object.fromEntries(projectViews.map((v) => [v.id, v.status])),
      });
      fs.writeFileSync(file, JSON.stringify(all, null, 2));
    },
  };
}
