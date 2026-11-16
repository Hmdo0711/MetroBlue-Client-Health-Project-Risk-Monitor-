import { createApp, loadConfig } from './app.js';
import { createServer } from './http/server.js';
import { createWeeklyScheduler } from './services/notifications.js';

const config = loadConfig();
const app = createApp({ config });
const server = createServer(app);

server.listen(config.port, () => {
  console.log(`MetroBlue Health Monitor running at http://localhost:${config.port}`);
  console.log(`  auth mode: ${config.authMode}${config.asOf ? ` · as-of date frozen at ${config.asOf}` : ''}`);
});

if (config.schedule.enabled) {
  const scheduler = createWeeklyScheduler({
    dayOfWeek: config.schedule.dayOfWeek,
    hour: config.schedule.hour,
    stateDir: config.varDir,
    run: async (now) => {
      const results = await app.distributeWeekly(now);
      console.log(`[scheduler] weekly summary delivered to ${results.length} recipient(s)`);
    },
  });
  scheduler.start();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  console.log(`  weekly summary: ${days[config.schedule.dayOfWeek]} from ${String(config.schedule.hour).padStart(2, '0')}:00 server time`);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
