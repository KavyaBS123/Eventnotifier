require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { deduplicateEvents } = require('../services/deduplication');

const scrapeDevfolio = require('./devfolio');
const scrapeLuma = require('./luma');
const scrapeMeetup = require('./meetup');
const scrapeDevpost = require('./devpost');
const scrapeEventbrite = require('./eventbrite');
const scrapeTwitter = require('./twitter');

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// Normalize tags for consistent filtering
// ─────────────────────────────────────────────────────────────
const TAG_KEYWORDS = {
  hackathon: ['hackathon', 'hack', 'build'],
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'genai', 'deep learning'],
  startup: ['startup', 'entrepreneurship', 'founder', 'pitch', 'venture'],
  meetup: ['meetup', 'networking', 'community', 'talk', 'workshop'],
  web3: ['web3', 'blockchain', 'crypto', 'nft', 'defi'],
  design: ['design', 'ux', 'ui', 'product design'],
};

// Tech sources are always tech (hackathons)
const TECH_SOURCES = ['devfolio', 'devpost'];

const TECH_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'genai',
  'deep learning', 'data science', 'data engineering', 'analytics',
  'developer', 'programming', 'coding', 'software', 'engineering',
  'cloud', 'aws', 'azure', 'gcp', 'devops', 'kubernetes', 'docker',
  'api', 'microservices', 'backend', 'frontend', 'fullstack',
  'react', 'node', 'python', 'javascript', 'typescript', 'rust', 'go lang',
  'cybersecurity', 'security', 'blockchain', 'web3', 'crypto',
  'startup', 'founder', 'venture', 'entrepreneurship', 'pitch',
  'computer science', 'tech', 'technical', 'technology',
  'robotics', 'iot', 'embedded', 'hardware',
  'opensource', 'open source', 'github', 'git',
  'database', 'sql', 'nosql', 'postgresql', 'mongodb',
  'serverless', 'saas', 'platform',
  'chatbot', 'agent', 'copilot', 'prompt',
  'workshop', 'bootcamp', 'buildathon', 'hackathon',
  'innovation', 'digital', 'transformation',
  'system design', 'architecture',
  'observability', 'monitoring', 'grafana',
  'data + devops', 'agentic', 'agentcore',
];

const NON_TECH_KEYWORDS = [
  'modeling', 'modelling', 'fashion', 'makeup', 'beauty',
  'cooking', 'baking', 'food', 'pizza', '🍕',
  'dancing', 'dance', 'music concert', 'singing',
  'sports', 'fitness', 'yoga', 'workout', 'gym',
  'travel', 'photography', 'painting', 'art class',
  'pets', 'animals', 'dog', 'cat',
  'religion', 'spirituality', 'prayer', 'temple',
  'parents', 'parenting', 'family',
  'writing', 'poetry', 'literature', 'book club', 'lit fest',
  'comedy', 'standup',
  'dating', 'relationship',
  'gardening', 'crafts', 'knitting',
  'astrology', 'tarot',
  'english class', 'language learning',
  'sunday', 'weekend plan',
  'elite networking', 'high-stakes networking',
  'modeling masterclass',
];

function isTechEvent(event) {
  const source = (event.source || '').toLowerCase();
  if (TECH_SOURCES.includes(source)) return true;

  const text = `${event.title} ${event.description || ''}`.toLowerCase();

  const hasNonTech = NON_TECH_KEYWORDS.some(kw => text.includes(kw));
  if (hasNonTech) return false;

  const hasTech = TECH_KEYWORDS.some(kw => text.includes(kw));
  return hasTech;
}

function inferTags(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) tags.push(tag);
  }
  return tags.length ? tags : ['tech'];
}

function inferCity(event) {
  const text = `${event.location} ${event.title} ${event.description || ''}`.toLowerCase();
  const cities = [
    'bangalore', 'bengaluru', 'mumbai', 'pune', 'delhi', 'hyderabad',
    'chennai', 'kolkata', 'ahmedabad', 'jaipur', 'noida', 'gurgaon',
    'kochi', 'chandigarh', 'indore', 'lucknow',
  ];
  for (const city of cities) {
    if (text.includes(city)) return city === 'bengaluru' ? 'Bangalore' : city.charAt(0).toUpperCase() + city.slice(1);
  }
  if (event.location.toLowerCase().includes('online')) return 'Online';
  return null;
}

// ─────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────
async function runAllScrapers() {
  console.log('\n[Scrapers] Starting scrape run...');
  const allScraped = [];

  const scrapers = [
    { name: 'Devfolio', fn: scrapeDevfolio },
    { name: 'Luma', fn: scrapeLuma },
    { name: 'Meetup', fn: scrapeMeetup },
    { name: 'Devpost', fn: scrapeDevpost },
    { name: 'Eventbrite', fn: scrapeEventbrite },
    { name: 'Twitter', fn: scrapeTwitter },
  ];

  for (const { name, fn } of scrapers) {
    try {
      console.log(`[Scrapers] Running ${name}...`);
      const events = await fn();
      console.log(`[Scrapers] ${name}: ${events.length} events found`);
      allScraped.push(...events);
    } catch (err) {
      console.error(`[Scrapers] ${name} failed: ${err.message}`);
    }
  }

  // Enrich tags, infer city, and filter to tech events only
  const enriched = allScraped
    .map((e) => ({
      ...e,
      tags: e.tags?.length ? e.tags : inferTags(e.title, e.description),
      city: e.city || inferCity(e),
    }))
    .filter(isTechEvent);

  console.log(`[Scrapers] ${allScraped.length} total events, ${enriched.length} after tech filter`);

  // Load recent DB events for dedup comparison
  const recentDbEvents = await prisma.event.findMany({
    where: { date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    select: { title: true, link: true, date: true },
  });

  const uniqueEvents = deduplicateEvents(enriched, recentDbEvents);
  console.log(`[Scrapers] ${uniqueEvents.length} new unique event(s) to save`);

  // Batch upsert
  const saved = [];
  for (const event of uniqueEvents) {
    try {
      const created = await prisma.event.upsert({
        where: { link: event.link },
        update: {
          title: event.title,
          description: event.description,
          date: event.date,
          location: event.location,
          city: event.city,
          tags: event.tags,
          imageUrl: event.imageUrl,
        },
        create: event,
      });
      saved.push(created);
    } catch (err) {
      console.error(`[Scrapers] Failed to save "${event.title}": ${err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log(`[Scrapers] Done. ${saved.length} event(s) persisted.\n`);
  return saved;
}

// Allow running directly: node src/scrapers/index.js
if (require.main === module) {
  runAllScrapers()
    .then((events) => {
      console.log('Saved events:', events.map((e) => e.title));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runAllScrapers };
