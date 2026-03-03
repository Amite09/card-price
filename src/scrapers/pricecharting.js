import * as cheerio from 'cheerio';
import { fetchPage } from './brightdata.js';

export async function scrapePricecharting(cardInfo) {
  const { cardName, number, total } = cardInfo;
  const searchQuery = encodeURIComponent(`pokemon ${cardName} ${number}/${total}`);
  const searchUrl = `https://www.pricecharting.com/search-products?q=${searchQuery}&type=prices`;

  const searchHtml = await fetchPage(searchUrl);
  const $search = cheerio.load(searchHtml);

  // Collect all matching product links — only English URLs (no /de/, /fr/, /es/ etc.)
  const candidates = [];
  $search('a').each((_, el) => {
    const href = $search(el).attr('href') || '';
    const text = $search(el).text().trim().toLowerCase();

    // Skip non-English locale links
    if (href.match(/\/(de|fr|es|nl|pt|ru|it|ja|ko|zh)\//)) return;

    if (href.includes('/game/') && href.includes('pokemon')) {
      const fullUrl = href.startsWith('http')
        ? href
        : `https://www.pricecharting.com${href}`;

      // Avoid duplicates
      if (!candidates.some(c => c.url === fullUrl)) {
        candidates.push({ url: fullUrl, text });
      }
    }
  });

  // Prefer non-1st-edition, non-shadowless results (base set unlimited)
  let productUrl = null;
  for (const c of candidates) {
    if (!c.text.includes('1st edition') && !c.text.includes('shadowless')) {
      productUrl = c.url;
      break;
    }
  }
  if (!productUrl && candidates.length > 0) {
    productUrl = candidates[0].url;
  }
  if (!productUrl) {
    const slug = cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    productUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${number}`;
  }

  // Ensure we fetch the English version
  productUrl = productUrl.replace(/pricecharting\.com\/(de|fr|es|nl|pt|ru|it|ja|ko|zh)\//, 'pricecharting.com/');

  const productHtml = await fetchPage(productUrl);
  const $ = cheerio.load(productHtml);
  const bodyText = $('body').text();
  const prices = {};

  // PriceCharting shows grades in a row, then prices below.
  // The HTML has lots of whitespace between prices, so we need a large window.
  // Find "Ungraded" header row, then extract all $ amounts after it.
  const gradeHeaderMatch = bodyText.match(
    /Ungraded\s+(?:Grade 7\s+)?(?:Grade 8\s+)?Grade 9\s+Grade 9\.5\s+PSA 10/i
  );

  if (gradeHeaderMatch) {
    const afterHeaders = bodyText.substring(
      gradeHeaderMatch.index + gradeHeaderMatch[0].length
    );

    // Large window to capture all prices (lots of whitespace between them)
    const priceBlock = afterHeaders.substring(0, 3000);
    const allPrices = [...priceBlock.matchAll(/\$([\d,]+\.?\d*)/g)].map(m => '$' + m[1]);

    const hasGrade7 = gradeHeaderMatch[0].includes('Grade 7');
    const hasGrade8 = gradeHeaderMatch[0].includes('Grade 8');

    const gradeKeys = ['ungraded'];
    if (hasGrade7) gradeKeys.push('grade7');
    if (hasGrade8) gradeKeys.push('grade8');
    gradeKeys.push('grade9', 'grade9_5', 'psa10');

    // Prices come in pairs: main price + change amount (e.g. "$711.50 +$4.43")
    let gradeIdx = 0;
    for (let i = 0; i < allPrices.length && gradeIdx < gradeKeys.length; i += 2) {
      prices[gradeKeys[gradeIdx]] = allPrices[i];
      gradeIdx++;
    }
  }

  // Fallback: try direct regex for each grade
  if (Object.keys(prices).length <= 1) {
    const directPatterns = [
      { pattern: /Ungraded[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'ungraded' },
      { pattern: /Grade 7[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'grade7' },
      { pattern: /Grade 8[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'grade8' },
      { pattern: /Grade 9(?![.\d])[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'grade9' },
      { pattern: /Grade 9\.5[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'grade9_5' },
      { pattern: /PSA 10[\s\S]{0,30}?\$([\d,]+\.?\d*)/i, key: 'psa10' },
    ];
    for (const { pattern, key } of directPatterns) {
      if (prices[key]) continue;
      const match = bodyText.match(pattern);
      if (match) prices[key] = '$' + match[1];
    }
  }

  const title = $('h1').first().text().trim() || $('title').text().trim();

  // Extract card image from PriceCharting
  let cardImage = null;
  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src.includes('storage.googleapis.com/images.pricecharting.com') && !cardImage) {
      // Use the larger version
      cardImage = src.replace(/\/\d+\.jpg$/, '/350.jpg');
    }
  });

  return {
    source: 'PriceCharting',
    url: productUrl,
    title,
    prices,
    cardImage,
    currency: 'USD',
  };
}
