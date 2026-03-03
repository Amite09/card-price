import * as cheerio from 'cheerio';
import { fetchPage } from './brightdata.js';

export async function scrapeCardmarket(cardInfo) {
  const { cardName, number, total } = cardInfo;

  // Include card number in search to narrow results
  const query = encodeURIComponent(`${cardName} ${number}`);
  const searchUrl = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${query}&mode=gallery`;

  const searchHtml = await fetchPage(searchUrl);
  const $search = cheerio.load(searchHtml);

  // Find product links from search results, prefer one matching our exact card number
  const candidates = [];

  $search('a').each((_, el) => {
    const href = $search(el).attr('href') || '';
    const text = $search(el).text().trim();
    if (!href.includes('/Products/Singles/')) return;

    let fullUrl = href.startsWith('http')
      ? href
      : `https://www.cardmarket.com${href}`;

    // Ensure English URL
    fullUrl = fullUrl.replace(/cardmarket\.com\/(fr|de|es|it|pt|nl)\//, 'cardmarket.com/en/');

    // Skip duplicates
    if (candidates.some(c => c.url === fullUrl)) return;

    // Score how well this matches our target card
    let score = 0;

    // Check for exact number/total in text (e.g., "271/264")
    if (text.includes(`${number}/${total}`)) score += 10;

    // Check for "#271" in text
    if (text.includes(`#${number}`)) score += 5;

    // Check URL ends with the number (e.g., "FSST271", "BS4")
    if (href.match(new RegExp(`[^\\d]${number}$`)) || href.endsWith(`-${number}`)) score += 5;

    // Check card name appears in text
    if (text.toLowerCase().includes(cardName.toLowerCase())) score += 3;

    candidates.push({ url: fullUrl, text, score });
  });

  // Sort by score descending, pick best match
  candidates.sort((a, b) => b.score - a.score);
  let productUrl = candidates.length > 0 ? candidates[0].url : null;

  if (!productUrl) {
    const bodyText = $search('body').text();
    if (bodyText.includes('no matches') || bodyText.includes('0 Results')) {
      return {
        source: 'Cardmarket',
        url: searchUrl,
        prices: {},
        currency: 'EUR',
      };
    }
    return {
      source: 'Cardmarket',
      url: searchUrl,
      prices: {},
      currency: 'EUR',
    };
  }

  // Ensure English product page
  productUrl = productUrl.replace(/cardmarket\.com\/(fr|de|es|it|pt|nl)\//, 'cardmarket.com/en/');

  const productHtml = await fetchPage(productUrl);
  const $ = cheerio.load(productHtml);

  const prices = {};
  const bodyText = $('body').text();

  // Extract price trend
  const trendMatch = bodyText.match(/Price Trend[\s:]*?([\d.,]+)\s*(?:€|EUR)/i);
  if (trendMatch) {
    prices.priceTrend = trendMatch[1] + ' €';
  }

  // Extract 30-day average
  const avg30Match = bodyText.match(/30-days? average[\s\w]*?[\s:]*?([\d.,]+)\s*(?:€|EUR)/i);
  if (avg30Match) {
    prices.avg30day = avg30Match[1] + ' €';
  }

  // Extract 7-day average
  const avg7Match = bodyText.match(/7-days? average[\s\w]*?[\s:]*?([\d.,]+)\s*(?:€|EUR)/i);
  if (avg7Match) {
    prices.avg7day = avg7Match[1] + ' €';
  }

  // Extract 1-day average
  const avg1Match = bodyText.match(/1-day average[\s\w]*?[\s:]*?([\d.,]+)\s*(?:€|EUR)/i);
  if (avg1Match) {
    prices.avg1day = avg1Match[1] + ' €';
  }

  // Extract "From" / lowest price
  const fromMatch = bodyText.match(/From[\s:]*?([\d.,]+)\s*(?:€|EUR)/i);
  if (fromMatch) {
    prices.lowestListing = fromMatch[1] + ' €';
  }

  // Extract available items count
  const availMatch = bodyText.match(/Available items[\s:]*?([\d,]+)/i);
  if (availMatch) {
    prices.availableItems = parseInt(availMatch[1].replace(/,/g, ''));
  }

  const title = $('h1').first().text().trim() || $('title').text().trim();

  return {
    source: 'Cardmarket',
    url: productUrl,
    title,
    prices,
    currency: 'EUR',
  };
}
