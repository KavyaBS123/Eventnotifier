require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// GET /api/events
// Query params: page, limit, tags (csv), source, search, upcoming, city
// ─────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      tags,
      source,
      search,
      city,
      upcoming = 'true',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (upcoming === 'true') {
      where.date = { gte: new Date() };
    }

    if (source) {
      where.source = { equals: source, mode: 'insensitive' };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim());
      where.tags = { hasSome: tagList };
    }

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { date: 'asc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.event.count({ where }),
    ]);

    res.json({
      data: events,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('GET /api/events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/events/new
// Query param: since (ISO timestamp, required), city (optional)
// Used by the Chrome Extension to poll for new events
// ─────────────────────────────────────────────────────────────
app.get('/api/events/new', async (req, res) => {
  try {
    const { since, city } = req.query;
    if (!since) {
      return res.status(400).json({ error: '`since` query param is required (ISO timestamp)' });
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate)) {
      return res.status(400).json({ error: 'Invalid `since` date format' });
    }

    const where = {
      createdAt: { gt: sinceDate },
      date: { gte: new Date() },
    };

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: events, count: events.length });
  } catch (err) {
    console.error('GET /api/events/new error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/subscribe
// Body: { email, city, preferences? }
// ─────────────────────────────────────────────────────────────
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, city, preferences } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: { city: city || undefined, preferences: preferences || undefined },
      create: {
        email,
        city: city || null,
        preferences: preferences || { notifyEmail: true, tags: [] },
      },
    });

    // Send welcome email in background (don't block response)
    const { sendWelcomeEmail } = require('./services/email');
    sendWelcomeEmail(email, city).catch(() => {});

    res.json({ message: 'Subscribed successfully', user });
  } catch (err) {
    console.error('POST /api/subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/scrape/trigger
// Manually trigger a scrape run (useful in dev)
// ─────────────────────────────────────────────────────────────
app.post('/api/scrape/trigger', async (req, res) => {
  try {
    const { addScrapeJob } = require('./queue/producer');
    await addScrapeJob();
    res.json({ message: 'Scrape job queued successfully' });
  } catch (err) {
    console.error('POST /api/scrape/trigger error:', err);
    res.status(500).json({ error: 'Failed to queue scrape job' });
  }
});

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Event Notifier API running at http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /api/events`);
  console.log(`   GET  /api/events/new?since=<ISO>`);
  console.log(`   POST /api/subscribe`);
  console.log(`   GET  /api/health`);
  console.log(`   POST /api/scrape/trigger\n`);
});

module.exports = app;
