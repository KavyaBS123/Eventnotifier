const { chromium } = require('playwright');

async function scrapeMeetup() {
  const events = [];
  const seenLinks = new Set();

  console.log('[Meetup] Scraping with Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const urls = [
    'https://www.meetup.com/find/?location=Bangalore%2C+IN&source=EVENTS',
    'https://www.meetup.com/find/?location=Bangalore%2C+IN&source=EVENTS&eventType=inPerson',
  ];

  for (const url of urls) {
    if (events.length > 0) break;
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      console.log(`[Meetup] Page status: ${resp?.status()}`);
      await page.waitForTimeout(5000);

      const cards = await page.$$('[data-testid*="event"]');
      console.log(`[Meetup] Found ${cards.length} event cards`);

      for (const card of cards) {
        try {
          const title = await card.$eval('h2, h3, [class*="title"]', el => el.innerText.trim()).catch(() => null);
          if (!title) continue;

          const linkEl = await card.$('a[href*="meetup"]');
          if (!linkEl) continue;
          const link = await linkEl.getAttribute('href').catch(() => null);
          if (!link || seenLinks.has(link)) continue;
          seenLinks.add(link);

          const dateText = await card.$eval('time', el => el.getAttribute('datetime') || el.innerText).catch(() => null);
          const location = await card.$eval('[class*="venue"], [class*="location"]', el => el.innerText.trim()).catch(() => 'Bangalore');
          const description = await card.$eval('p, [class*="desc"]', el => el.innerText.trim()).catch(() => '');
          const imageUrl = await card.$eval('img', el => el.src).catch(() => null);

          let date = dateText ? new Date(dateText) : null;
          if (!date || isNaN(date)) date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          if (date < new Date()) continue;

          events.push({
            title, description: description || null, date,
            location: location || 'Bangalore', source: 'Meetup', link,
            tags: ['meetup'], imageUrl: imageUrl || null,
          });
        } catch (_) {}
      }
    } catch (err) {
      console.error(`[Meetup] Playwright error on ${url}:`, err.message);
    }
  }

  await browser.close();

  if (events.length === 0) {
    console.warn('[Meetup] No events found.');
  } else {
    console.log(`[Meetup] ${events.length} events found`);
  }

  return events;
}

module.exports = scrapeMeetup;
