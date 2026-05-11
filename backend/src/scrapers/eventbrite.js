const { chromium } = require('playwright');

/**
 * Scrapes all types of events (tech meetups, workshops, conferences) from Eventbrite.
 */
async function scrapeEventbrite() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const events = [];
  const seenLinks = new Set();

  const searchUrls = [
    'https://www.eventbrite.com/d/india--bangalore/events/',
    'https://www.eventbrite.com/d/india--bangalore/tech/',
    'https://www.eventbrite.com/d/india--bangalore/technology/',
  ];

  for (const url of searchUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      // Try multiple card selectors
      const cardSelectors = [
        '[data-testid*="card"]',
        '[class*="event-card"]',
        '[class*="EventCard"]',
        'article',
        'li[class*="card"]',
        '[data-automation*="card"]',
      ];

      for (const sel of cardSelectors) {
        const cards = await page.$$(sel);
        for (const card of cards) {
          try {
            const titleEl = await card.$('h2, h3, [class*="title"]');
            if (!titleEl) continue;
            const title = await titleEl.innerText().catch(() => null);
            if (!title) continue;

            const linkEl = await card.$('a[href*="eventbrite"]');
            if (!linkEl) continue;
            const link = await linkEl.getAttribute('href').catch(() => null);
            if (!link || seenLinks.has(link)) continue;
            seenLinks.add(link);

            const dateText = await card.$eval('time, [class*="date"], [class*="time"]', el => el.innerText.trim()).catch(() => null);
            const location = await card.$eval('[class*="location"], [class*="venue"]', el => el.innerText.trim()).catch(() => 'Bangalore');
            const description = await card.$eval('p, [class*="desc"]', el => el.innerText.trim()).catch(() => '');
            const imageUrl = await card.$eval('img', el => el.src).catch(() => null);

            let date = dateText ? new Date(dateText) : null;
            if (!date || isNaN(date)) date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            if (date < new Date()) continue;

            events.push({
              title, description: description || null, date,
              location: location || 'Bangalore', source: 'Eventbrite', link,
              tags: ['meetup'], imageUrl: imageUrl || null,
            });
          } catch (_) {}
        }
        if (events.length > 0) break;
      }
    } catch (err) {
      console.error(`[Eventbrite] ${url} failed: ${err.message}`);
    }
  }

  await browser.close();
  if (events.length === 0) console.warn('[Eventbrite] No events found.');
  return events;
}

module.exports = scrapeEventbrite;
