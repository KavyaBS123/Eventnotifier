require('dotenv').config();
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

const scrapeQueue = new Queue('scrape-events', { connection });

async function addScrapeJob(options = {}) {
  const job = await scrapeQueue.add(
    'run-scrapers',
    { triggeredAt: new Date().toISOString(), ...options },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    }
  );
  console.log(`[Queue] Scrape job added: ${job.id}`);
  return job;
}

module.exports = { scrapeQueue, addScrapeJob };
