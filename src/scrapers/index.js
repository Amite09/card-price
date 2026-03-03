import { scrapePricecharting } from './pricecharting.js';
import { scrapeEbay } from './ebay.js';
import { scrapeCardmarket } from './cardmarket.js';
import { scrapeTcgplayer } from './tcgplayer.js';
import { scrapeTrollandtoad } from './trollandtoad.js';

const scrapers = {
  pricecharting: scrapePricecharting,
  ebay: scrapeEbay,
  cardmarket: scrapeCardmarket,
  tcgplayer: scrapeTcgplayer,
  trollandtoad: scrapeTrollandtoad,
};

export async function scrapeAll(cardInfo) {
  const entries = Object.entries(scrapers);

  const settled = await Promise.allSettled(
    entries.map(([name, fn]) =>
      fn(cardInfo).then(data => ({
        source: name,
        status: 'ok',
        data,
        scrapedAt: new Date().toISOString(),
      }))
    )
  );

  const results = {};
  settled.forEach((result, i) => {
    const name = entries[i][0];
    if (result.status === 'fulfilled') {
      results[name] = result.value;
    } else {
      results[name] = {
        source: name,
        status: 'error',
        error: result.reason?.message || 'Unknown error',
        scrapedAt: new Date().toISOString(),
      };
    }
  });

  return results;
}
