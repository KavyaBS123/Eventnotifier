const { chromium } = require('playwright');

const NAV_TERMS = ['discover', 'pricing', 'get the app', 'log in', 'sign up', 'calendar', 'search', 'settings', 'profile', 'help', 'about', 'blog', 'terms', 'privacy', 'contact'];

async function scrapeLuma() {
  const events = [];
  const seenLinks = new Set();

  for (const attempt of [1, 2]) {
    try {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
          '--disable-web-security',
          '--disable-features=BlockInsecurePrivateNetworkRequests',
        ],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'en-IN',
      });

      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      });

      const urls = attempt === 1
        ? ['https://lu.ma/discover?loc=Bangalore', 'https://lu.ma/bangalore', 'https://lu.ma/explore?loc=Bangalore']
        : ['https://lu.ma/calendar/Bangalore', 'https://lu.ma/search?q=Bangalore+tech+events'];

      for (const url of urls) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(4000);
        } catch {
          continue;
        }

        // Try multiple strategies to find events
        let found = false;

        // Strategy A: Look for Luma event links (short codes like /abc123)
        const eventLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .filter(a => {
              const m = a.href.match(/lu\.ma\/([a-zA-Z0-9]{4,})$/);
              return m && !a.href.includes('#');
            })
            .map(a => ({ href: a.href, text: (a.innerText || a.title || '').trim() }))
            .filter(a => a.text.length > 5);
        });

        for (const el of eventLinks) {
          if (seenLinks.has(el.href)) continue;
          const textLower = el.text.toLowerCase();
          if (NAV_TERMS.some(t => textLower.includes(t))) continue;
          seenLinks.add(el.href);
          events.push({
            title: el.text,
            description: null,
            date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            location: 'Bangalore',
            source: 'Luma',
            link: el.href,
            tags: ['meetup'],
            imageUrl: null,
          });
          found = true;
        }

        // Strategy B: Look for structured data / JSON-LD
        if (!found) {
          const jsonld = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            return Array.from(scripts).map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).filter(Boolean);
          });
          for (const data of jsonld) {
            const items = data.itemListElement || [data];
            for (const item of items) {
              const e = item.item || item;
              if (!e.name) continue;
              const link = e.url || e.sameAs;
              if (!link || seenLinks.has(link)) continue;
              seenLinks.add(link);
              events.push({
                title: e.name, description: e.description || null,
                date: e.startDate ? new Date(e.startDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                location: e.location?.name || 'Bangalore', source: 'Luma', link,
                tags: ['meetup'], imageUrl: Array.isArray(e.image) ? e.image[0] : (e.image || null),
              });
            }
          }
        }

        if (events.length > 0) break;
      }

      await browser.close();
      if (events.length > 0) break;
    } catch (err) {
      console.error(`[Luma] Attempt ${attempt} failed:`, err.message);
    }
  }

  if (events.length === 0) console.warn('[Luma] No events found. Luma blocks automated access.');
  return events;
}

module.exports = scrapeLuma;
