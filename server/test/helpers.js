import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/app.js';

/** Config isolated to a temp directory, scheduler off, dev auth. */
export function testConfig(overrides = {}) {
  const varDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-health-'));
  return {
    ...loadConfig({}),
    authMode: 'dev',
    varDir,
    clientDist: path.join(varDir, 'no-dist'),
    webhookUrl: null,
    schedule: { enabled: false, dayOfWeek: 1, hour: 8 },
    ...overrides,
  };
}
