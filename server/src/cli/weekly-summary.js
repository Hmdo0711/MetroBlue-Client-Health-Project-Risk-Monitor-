#!/usr/bin/env node
/**
 * Generate the weekly summary from the command line.
 *
 *   npm run summary                       # deliver to every entitled recipient + snapshot the week
 *   npm run summary -- --user u-dm1       # print one user's summary (markdown) to stdout
 *   npm run summary -- --user u-dm1 --format csv
 *
 * Suitable for an external scheduler (cron, Windows Task Scheduler, CI) when you'd rather not
 * rely on the in-process scheduler.
 */
import { createApp } from '../app.js';
import { summaryToCSV, summaryToHTML, summaryToMarkdown } from '../services/summary.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const app = createApp();
const userId = opt('user');

if (userId) {
  const user = app.repo.getUser(userId);
  if (!user) {
    console.error(`Unknown user: ${userId}`);
    process.exit(1);
  }
  const summary = app.summaryFor(user);
  const format = opt('format') ?? 'md';
  const out = { md: summaryToMarkdown, csv: summaryToCSV, html: summaryToHTML, json: (s) => JSON.stringify(s, null, 2) }[format];
  if (!out) {
    console.error('format must be md, csv, html or json');
    process.exit(1);
  }
  process.stdout.write(out(summary));
} else {
  const results = await app.distributeWeekly();
  for (const r of results) console.log(`${r.userId}: ${r.files.join(', ')}${r.webhook ? ` · webhook ${JSON.stringify(r.webhook)}` : ''}`);
  console.log(`Delivered ${results.length} summary(ies).`);
}
