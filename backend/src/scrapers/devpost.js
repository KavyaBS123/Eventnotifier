const { chromium } = require('playwright');

/**
 * Scrapes hackathons from Devpost.
 * Filters for India-based or online hackathons.
 */
async function scrapeDevpost() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const events = [];

  try {
    // Devpost hackathons — filter by "open" status
    await page.goto('https://devpost.com/hackathons?status[]=upcoming&status[]=open', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForSelector('.hackathon-tile, [class*="challenge-listing"]', { timeout: 15000 });

    const cards = await page.$$('.hackathon-tile, [class*="challenge-listing"]');

    for (const card of cards) {
      try {
        const title = await card.$eval('h2, h3, .title', (el) => el.innerText.trim()).catch(() => null);
        if (!title) continue;

        const link = await card.$eval('a', (el) => el.href).catch(() => null);
        if (!link) continue;

        const location = await card.$eval('.info .location-label, [class*="location"]', (el) => el.innerText.trim()).catch(() => 'Online');
        const dateText = await card.$eval('.dates, time, [class*="date"]', (el) => el.innerText.trim()).catch(() => null);
        const description = await card.$eval('p', (el) => el.innerText.trim()).catch(() => '');
        const imageUrl = await card.$eval('img', (el) => el.src).catch(() => null);

        // Filter: India, Bangalore, or Online
        const locationLower = (location || '').toLowerCase();
        const isRelevant =
          locationLower.includes('india') ||
          locationLower.includes('bangalore') ||
          locationLower.includes('bengaluru') ||
          locationLower.includes('online') ||
          locationLower === '' ||
          title.toLowerCase().includes('india');

        if (!isRelevant) continue;

        // Parse date range like "May 10 - Jun 1"
        let date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // default 2 weeks
        if (dateText) {
          const parts = dateText.split(/[-–]/);
          const parsed = new Date(`${parts[0].trim()} ${new Date().getFullYear()}`);
          if (!isNaN(parsed)) date = parsed;
        }

        events.push({
          title,
          description: description || null,
          date,
          location: location || 'Online',
          source: 'Devpost',
          link,
          tags: ['hackathon'],
          imageUrl: imageUrl || null,
        });
      } catch (_) {}
    }
  } catch (err) {
    console.error('[Devpost] Scrape error:', err.message);
  } finally {
    await browser.close();
  }

  return events;
}

module.exports = scrapeDevpost;
