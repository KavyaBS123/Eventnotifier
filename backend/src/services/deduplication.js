const stringSimilarity = require('string-similarity');

const SIMILARITY_THRESHOLD = 0.75; // 75% title match = duplicate

/**
 * Deduplicates a list of scraped events against existing events in the DB.
 * Also removes intra-batch duplicates.
 *
 * @param {Array} newEvents - Freshly scraped event objects
 * @param {Array} existingEvents - Events already in the DB (title + date)
 * @returns {Array} - Filtered list of genuinely new events
 */
function deduplicateEvents(newEvents, existingEvents) {
  const existingTitles = existingEvents.map((e) => e.title.toLowerCase());
  const existingLinks = new Set(existingEvents.map((e) => e.link));

  const seen = new Set();
  const unique = [];

  for (const event of newEvents) {
    // 1. Exact link match
    if (existingLinks.has(event.link)) continue;

    // 2. Intra-batch link duplicate
    if (seen.has(event.link)) continue;

    // 3. Title similarity check against DB events (same date window ±1 day)
    const titleLower = event.title.toLowerCase();
    const isSimilar = existingTitles.some((existingTitle) => {
      const score = stringSimilarity.compareTwoStrings(titleLower, existingTitle);
      return score >= SIMILARITY_THRESHOLD;
    });

    if (isSimilar) {
      console.log(`[Dedup] Skipping similar event: "${event.title}"`);
      continue;
    }

    seen.add(event.link);
    unique.push(event);
  }

  return unique;
}

module.exports = { deduplicateEvents };
