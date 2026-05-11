require('dotenv').config();
const Redis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const { buildEmailHtml, sendEmail } = require('./email');

const prisma = new PrismaClient();
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    });

const DIGEST_KEY = 'digest:events';

async function addEventsToDigest(events) {
  if (!events.length) return;
  const pipeline = redis.pipeline();
  for (const event of events) {
    pipeline.rpush(DIGEST_KEY, JSON.stringify(event));
  }
  await pipeline.exec();
  console.log(`[Digest] Added ${events.length} event(s) to digest queue`);
}

async function sendDigest() {
  const raw = await redis.lrange(DIGEST_KEY, 0, -1);
  if (!raw.length) {
    console.log('[Digest] No pending events to send');
    return 0;
  }

  await redis.del(DIGEST_KEY);
  const events = raw.map(r => JSON.parse(r));
  console.log(`[Digest] Sending ${events.length} event(s) to users`);

  const users = await prisma.user.findMany({
    where: {
      preferences: {
        path: ['notifyEmail'],
        equals: true,
      },
    },
  });

  if (!users.length) {
    console.log('[Digest] No subscribed users');
    return 0;
  }

  let sent = 0;
  for (const user of users) {
    try {
      const prefs = user.preferences || {};
      const userTags = prefs.tags || [];
      let relevantEvents = events;

      if (userTags.length > 0) {
        relevantEvents = relevantEvents.filter(e => e.tags.some(t => userTags.includes(t)));
      }

      if (user.city) {
        const userCity = user.city.toLowerCase();
        relevantEvents = relevantEvents.filter(
          e => e.city?.toLowerCase() === userCity || e.location?.toLowerCase().includes(userCity)
        );
      }

      if (!relevantEvents.length) continue;

      const html = buildEmailHtml(relevantEvents, user.city);
      await sendEmail({
        to: user.email,
        subject: `⚡ ${relevantEvents.length} Tech Event${relevantEvents.length > 1 ? 's' : ''} in ${user.city || 'your area'} — Event Notifier`,
        html,
      });

      sent++;
      console.log(`[Digest] Sent ${relevantEvents.length} events to ${user.email}`);
    } catch (err) {
      console.error(`[Digest] Failed to send to ${user.email}: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log(`[Digest] Done. ${sent}/${users.length} user(s) notified.`);
  return sent;
}

module.exports = { addEventsToDigest, sendDigest };
