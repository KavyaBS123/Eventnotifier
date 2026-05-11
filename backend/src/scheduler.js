require('dotenv').config();
const cron = require('node-cron');
const { runAllScrapers } = require('./scrapers/index');
const { addEventsToDigest, sendDigest } = require('./services/digest');

const SCRAPE_INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_MINUTES) || 30;

function startScheduler() {
  console.log(`[Scheduler] Starting — scrape every ${SCRAPE_INTERVAL} min, digest at 9AM/12PM/6PM/10PM IST`);

  // Scrape every N minutes
  cron.schedule(`*/${SCRAPE_INTERVAL} * * * *`, async () => {
    console.log(`[Scheduler] Running scrapers...`);
    try {
      const newEvents = await runAllScrapers();
      if (newEvents.length > 0) {
        await addEventsToDigest(newEvents);
        console.log(`[Scheduler] ${newEvents.length} event(s) added to digest`);
      }
    } catch (err) {
      console.error('[Scheduler] Scrape run failed:', err.message);
    }
  });

  // Also run once on startup
  setTimeout(async () => {
    console.log(`[Scheduler] Initial scrape run...`);
    try {
      const newEvents = await runAllScrapers();
      if (newEvents.length > 0) {
        await addEventsToDigest(newEvents);
      }
    } catch (err) {
      console.error('[Scheduler] Initial scrape failed:', err.message);
    }
  }, 5000);

  // Digest sends at 9AM, 12PM, 6PM, 10PM IST
  const digestSlots = [
    { cron: '30 3 * * *', label: '9:00 AM IST' },
    { cron: '30 6 * * *', label: '12:00 PM IST' },
    { cron: '30 12 * * *', label: '6:00 PM IST' },
    { cron: '30 16 * * *', label: '10:00 PM IST' },
  ];

  for (const { cron: expr, label } of digestSlots) {
    cron.schedule(expr, async () => {
      console.log(`[Scheduler] ⏰ ${label} — sending digest...`);
      try {
        const sent = await sendDigest();
        console.log(`[Scheduler] ${label} digest done — ${sent} user(s) notified`);
      } catch (err) {
        console.error(`[Scheduler] ${label} digest failed:`, err.message);
      }
    });
  }

  console.log('[Scheduler] Ready.');
}

module.exports = { startScheduler };
