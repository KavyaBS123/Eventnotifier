const { chromium } = require('playwright');

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.lqdev.me',
  'https://twtr.bch.nk',
  'https://nitter.woodland.cafe',
  'https://nitter.freedit.eu',
];

const SEARCH_QUERIES = [
  'Bangalore tech event OR hackathon OR meetup OR workshop',
  'from:bangaloretech (hackathon OR meetup)',
];

async function scrapeTwitter() {
  const events = [];
  const seenLinks = new Set();

  for (const instance of NITTER_INSTANCES) {
    if (events.length > 0) break;
    console.log(`[Twitter] Trying Nitter instance: ${instance}`);

    for (const query of SEARCH_QUERIES) {
      if (events.length > 0) break;
      try {
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();

        const url = `${instance}/search?q=${encodeURIComponent(query)}&f=live`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);

        const tweets = await page.evaluate(() => {
          const results = [];
          const cards = document.querySelectorAll('.timeline-item, .tweet-card, article');
          for (const card of cards) {
            const textEl = card.querySelector('.tweet-content, p');
            if (!textEl) continue;
            const text = textEl.innerText.trim();
            if (!text || text.length < 30) continue;

            const linkEl = card.querySelector('a.tweet-link, a[href*="/status/"]');
            const link = linkEl ? `https://x.com${linkEl.getAttribute('href')}` : null;

            const timeEl = card.querySelector('time');
            const dateStr = timeEl ? timeEl.getAttribute('datetime') : null;

            const eventKeywords = ['hackathon', 'meetup', 'workshop', 'conference', 'summit', 'bootcamp',
              'webinar', 'tech talk', 'register', 'registration', 'apply', 'calling all',
              'announcing', 'save the date', 'join us', 'venue', 'talks', 'speakers', 'agenda'];
            const textLower = text.toLowerCase();
            if (!eventKeywords.some(k => textLower.includes(k))) continue;

            results.push({ text, link, dateStr });
          }
          return results.slice(0, 15);
        });

        for (const tweet of tweets) {
          const title = tweet.text.split('\n')[0].slice(0, 100);
          const link = tweet.link || `${instance}/search?q=${encodeURIComponent(query)}`;
          if (seenLinks.has(link)) continue;
          seenLinks.add(link);
          events.push({
            title,
            description: tweet.text.slice(0, 500),
            date: tweet.dateStr ? new Date(tweet.dateStr) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            location: 'Bangalore',
            source: 'Twitter',
            link,
            tags: ['meetup'],
            imageUrl: null,
          });
        }

        await browser.close();
        console.log(`[Twitter] ${instance}: ${tweets.length} tweets found`);
      } catch (err) {
        console.warn(`[Twitter] ${instance} failed: ${err.message}`);
      }
    }
  }

  if (events.length === 0) console.warn('[Twitter] No events found via Nitter or X.com.');
  return events;
}

module.exports = scrapeTwitter;
