require('dotenv').config();
const { Worker, QueueScheduler } = require('bullmq');
const { runAllScrapers } = require('../scrapers/index');
const { addEventsToDigest } = require('../services/digest');
const { startDigestScheduler } = require('./digestScheduler');

const connection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    };

const SCRAPE_INTERVAL = parseInt(process.env.SCRAPE_INTERVAL_MINUTES) || 30;

// ─────────────────────────────────────────────────────────────
// Worker: processes scrape jobs from the queue
// ─────────────────────────────────────────────────────────────
const worker = new Worker(
  'scrape-events',
  async (job) => {
    console.log(`\n[Worker] Processing job ${job.id} — triggered at ${job.data.triggeredAt}`);
    try {
      const newEvents = await runAllScrapers();
      console.log(`[Worker] Scrape complete. ${newEvents.length} new event(s) saved.`);

      if (newEvents.length > 0) {
        await addEventsToDigest(newEvents);
        console.log(`[Worker] Added ${newEvents.length} event(s) to digest queue`);
      }

      return { saved: newEvents.length };
    } catch (err) {
      console.error('[Worker] Scrape job failed:', err.message);
      throw err;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on('completed', (job, result) => {
  console.log(`[Worker] Job ${job.id} completed — ${result.saved} new events.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed: ${err.message}`);
});

// ─────────────────────────────────────────────────────────────
// Scheduler: re-queues a scrape job every N minutes using
// the BullMQ repeatable job pattern
// ─────────────────────────────────────────────────────────────
async function scheduleRepeatingJob() {
  const { scrapeQueue } = require('./producer');

  const repeatables = await scrapeQueue.getRepeatableJobs();
  for (const job of repeatables) {
    await scrapeQueue.removeRepeatableByKey(job.key);
  }

  await scrapeQueue.add(
    'run-scrapers',
    { triggeredAt: new Date().toISOString(), scheduled: true },
    {
      repeat: { every: SCRAPE_INTERVAL * 60 * 1000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  console.log(`[Scheduler] Scrape job scheduled every ${SCRAPE_INTERVAL} minutes.`);

  const { addScrapeJob } = require('./producer');
  await addScrapeJob({ reason: 'startup' });
  console.log('[Scheduler] Initial scrape job queued.');
}

scheduleRepeatingJob().catch(console.error);
startDigestScheduler();

console.log('\n🔧 Event Notifier Worker started.');
console.log(`   Scrape interval: every ${SCRAPE_INTERVAL} minutes`);
console.log(`   Digest schedule: 9AM, 12PM, 6PM, 10PM IST\n`);
