import * as cheerio from 'cheerio';
import { fetchPage } from './brightdata.js';

export async function scrapeEbay(cardInfo) {
  const { cardName, number, total } = cardInfo;
  const query = encodeURIComponent(`pokemon ${cardName} ${number}/${total} PSA`);
  const url = `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Complete=1&LH_Sold=1&_sop=13`;

  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const recentSales = [];

  // eBay sold listings are in .s-item containers
  $('.s-item').each((_, el) => {
    const titleEl = $(el).find('.s-item__title');
    const priceEl = $(el).find('.s-item__price');
    const dateEl = $(el).find('.s-item__title--tag, .s-item__ended-date, .POSITIVE');

    const title = titleEl.text().trim();
    const priceText = priceEl.text().trim();

    // Skip "Shop on eBay" sponsored items and empty items
    if (!title || title === 'Shop on eBay' || !priceText) return;

    // Extract PSA grade from title
    const gradeMatch = title.match(/PSA\s*(\d+\.?\d*)/i);
    const grade = gradeMatch ? `PSA ${gradeMatch[1]}` : null;

    // Extract price value
    const priceMatch = priceText.match(/\$[\d,]+\.?\d*/);
    const price = priceMatch ? priceMatch[0] : priceText;

    // Extract sold date
    let soldDate = '';
    const dateText = dateEl.text().trim();
    const soldMatch = dateText.match(/Sold\s+(.+)/i);
    if (soldMatch) {
      soldDate = soldMatch[1].trim();
    }

    recentSales.push({
      title,
      price,
      grade,
      soldDate,
    });
  });

  // Also try extracting from the full body text as fallback
  if (recentSales.length === 0) {
    const bodyText = $('body').text();
    // Match pattern: "Sold  <date><title>...<price>"
    const salePattern = /Sold\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,?\s*\d*)([\s\S]*?)\$([\d,]+\.?\d*)/g;
    let match;
    while ((match = salePattern.exec(bodyText)) !== null) {
      const soldDate = match[1].trim();
      const titleText = match[2].trim().replace(/Opens in[\s\S]*$/, '').trim();
      const price = '$' + match[3];
      const gradeMatch = titleText.match(/PSA\s*(\d+\.?\d*)/i);

      // Skip sponsored/irrelevant items
      if (titleText.includes('Shop on eBay')) continue;

      recentSales.push({
        title: titleText.substring(0, 120),
        price,
        grade: gradeMatch ? `PSA ${gradeMatch[1]}` : null,
        soldDate,
      });
    }
  }

  return {
    source: 'eBay',
    url,
    recentSales: recentSales.slice(0, 15),
    currency: 'USD',
  };
}
