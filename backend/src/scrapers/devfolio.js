const { chromium } = require('playwright');

/**
 * Scrapes upcoming hackathons from Devfolio.
 * Targets events tagged as Bangalore or online/remote.
 */
async function scrapeDevfolio() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const events = [];

  try {
    await page.goto('https://devfolio.co/hackathons', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(5000);

    // Try multiple selector patterns
    const cardSelectors = [
      '[class*="HackathonCard"]',
      '[class*="hackathon"]',
      '[class*="card"]',
      'a[href*="hackathon"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      cards = await page.$$(sel);
      if (cards.length > 0) break;
    }

    for (const card of cards) {
      try {
        const title = await card.$eval('[class*="title"], h3, h2', el => el.innerText.trim()).catch(() => null);
        if (!title) continue;

        const link = await card.$eval('a', el => el.href).catch(() => null);
        if (!link) continue;

        const description = await card.$eval('[class*="description"], p', el => el.innerText.trim()).catch(() => '');
        const dateText = await card.$eval('[class*="date"], time', el => el.innerText.trim()).catch(() => null);
        const location = await card.$eval('[class*="location"], [class*="venue"]', el => el.innerText.trim()).catch(() => 'Online');
        const imageUrl = await card.$eval('img', el => el.src).catch(() => null);

        const locationLower = (location || '').toLowerCase();
        const isBangalore = locationLower.includes('bangalore') || locationLower.includes('bengaluru') ||
          locationLower.includes('online') || locationLower.includes('remote') ||
          title.toLowerCase().includes('india');

        if (!isBangalore) continue;

        let date = dateText ? new Date(dateText) : null;
        if (!date || isNaN(date)) date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        events.push({
          title,
          description: description || null,
          date,
          location: location || 'Online',
          source: 'Devfolio',
          link,
          tags: ['hackathon'],
          imageUrl: imageUrl || null,
        });
      } catch (_) {}
    }
  } catch (err) {
    console.error('[Devfolio] Scrape error:', err.message);
  } finally {
    await browser.close();
  }

  return events;
}

module.exports = scrapeDevfolio;
