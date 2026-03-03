import * as cheerio from 'cheerio';
import { fetchPage } from './brightdata.js';

export async function scrapeTrollandtoad(cardInfo) {
  const { cardName, number, total } = cardInfo;
  const query = encodeURIComponent(`${cardName} ${number}/${total}`);
  const url = `https://www.trollandtoad.com/search?search_query=${query}`;

  // TrollandToad may need browser zone for JS rendering
  const html = await fetchPage(url, { browser: true, timeout: 45000 });
  const $ = cheerio.load(html);

  const listings = [];

  // Try to find product listings
  $('[class*="product"], [class*="item"], [class*="listing"]').each((_, el) => {
    const name = $(el).find('[class*="name"], [class*="title"], a').first().text().trim();
    const priceEl = $(el).find('[class*="price"]');
    const priceText = priceEl.text().trim();

    if (name && priceText) {
      const priceMatch = priceText.match(/\$[\d,]+\.?\d*/);
      listings.push({
        name,
        price: priceMatch ? priceMatch[0] : priceText,
      });
    }
  });

  // Fallback: extract from body text
  if (listings.length === 0) {
    const bodyText = $('body').text();
    // Look for card name followed by price pattern
    const pattern = new RegExp(
      `(${cardName}[^$]*?)\\$(\\d[\\d,]*\\.?\\d*)`,
      'gi'
    );
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      listings.push({
        name: match[1].trim().substring(0, 100),
        price: '$' + match[2],
      });
    }
  }

  const title = $('title').text().trim();

  return {
    source: 'TrollandToad',
    url,
    title,
    listings: listings.slice(0, 10),
    currency: 'USD',
  };
}
