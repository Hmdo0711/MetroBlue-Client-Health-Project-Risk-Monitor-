import fs from 'node:fs';
import path from 'node:path';
import { summaryToHTML, summaryToMarkdown } from './summary.js';
import { weekStart, isoDate } from '../engine/dates.js';

/**
 * Deliver one user's summary.
 *  - Always writes an email-ready HTML file and a Markdown file to the outbox
 *    (pick these up with your mail relay, or open them directly).
 *  - If a webhook URL is configured (Teams / Slack / internal notifier), POSTs a JSON payload.
 */
export async function deliverSummary({ summary, user, outboxDir, webhookUrl, fetchImpl = globalThis.fetch }) {
  const dir = path.join(outboxDir, summary.periodStart);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, user.id);
  const markdown = summaryToMarkdown(summary);
  fs.writeFileSync(`${base}.html`, summaryToHTML(summary));
  fs.writeFileSync(`${base}.md`, markdown);

  const result = { userId: user.id, files: [`${base}.html`, `${base}.md`], webhook: null };
  if (webhookUrl) {
    try {
      const res = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: `Weekly delivery health — week of ${summary.periodStart}`,
          to: user.email,
          text: markdown,
          totals: summary.totals,
        }),
      });
      result.webhook = { ok: res.ok, status: res.status };
    } catch (err) {
      result.webhook = { ok: false, error: err.message };
    }
  }
  return result;
}

/**
 * Fires `run(now)` once per week, on `dayOfWeek` (0 = Sunday … 6 = Saturday, server local time)
 * at or after `hour`. The last run week is persisted so restarts don't double-send.
 */
export function createWeeklyScheduler({ run, dayOfWeek = 1, hour = 8, stateDir, intervalMs = 60_000, clock = () => new Date(), logger = console }) {
  const stateFile = stateDir ? path.join(stateDir, 'scheduler-state.json') : null;
  let lastRunWeek = null;
  if (stateFile) {
    try {
      lastRunWeek = JSON.parse(fs.readFileSync(stateFile, 'utf8')).lastRunWeek ?? null;
    } catch {
      /* first run */
    }
  }
  let timer = null;
  let running = false;

  async function tick() {
    const now = clock();
    const thisWeek = isoDate(weekStart(now));
    if (running || lastRunWeek === thisWeek) return false;
    if (now.getDay() !== dayOfWeek || now.getHours() < hour) return false;
    running = true;
    try {
      await run(now);
      lastRunWeek = thisWeek;
      if (stateFile) {
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify({ lastRunWeek }));
      }
      return true;
    } catch (err) {
      logger.error('[scheduler] weekly summary failed:', err);
      return false;
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      timer = setInterval(tick, intervalMs);
      timer.unref?.();
      tick();
    },
    stop() {
      clearInterval(timer);
    },
    get lastRunWeek() {
      return lastRunWeek;
    },
  };
}
