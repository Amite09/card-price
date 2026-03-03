import * as cheerio from 'cheerio';
import { fetchPage } from './brightdata.js';

export async function scrapeTcgplayer(cardInfo) {
  const { cardName, number, total } = cardInfo;
  const query = encodeURIComponent(`${cardName} ${number}/${total}`);
  const url = `https://www.tcgplayer.com/search/pokemon/product?q=${query}&view=grid`;

  // TCGPlayer is a SPA — needs browser zone for JS rendering
  const html = await fetchPage(url, { browser: true, timeout: 45000 });
  const $ = cheerio.load(html);

  const prices = {};

  // Try to find product listing prices from search results
  const results = [];
  $('[class*="product"], [class*="listing"], [class*="search-result"]').each((_, el) => {
    const name = $(el).find('[class*="name"], [class*="title"]').text().trim();
    const price = $(el).find('[class*="price"], [class*="value"]').text().trim();
    if (name && price) {
      results.push({ name, price });
    }
  });

  // Extract market price from body text
  const bodyText = $('body').text();

  const marketMatch = bodyText.match(/Market Price[\s:]*?\$?([\d,]+\.?\d*)/i);
  if (marketMatch) {
    prices.marketPrice = '$' + marketMatch[1];
  }

  const medianMatch = bodyText.match(/(?:Median|Listed Median)[\s:]*?\$?([\d,]+\.?\d*)/i);
  if (medianMatch) {
    prices.listedMedian = '$' + medianMatch[1];
  }

  const lowMatch = bodyText.match(/(?:Low|Lowest)[\s:]*?\$?([\d,]+\.?\d*)/i);
  if (lowMatch) {
    prices.low = '$' + lowMatch[1];
  }

  // Try to find any dollar amounts near relevant keywords
  const pricePattern = /\$([\d,]+\.?\d*)/g;
  const allPrices = [];
  let match;
  while ((match = pricePattern.exec(bodyText)) !== null) {
    const val = parseFloat(match[1].replace(/,/g, ''));
    if (val > 0.5 && val < 1000000) {
      allPrices.push(match[0]);
    }
  }

  // Find product URL if we landed on search results
  let productUrl = url;
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/product/') && href.includes('pokemon') && !productUrl.includes('/product/')) {
      productUrl = href.startsWith('http')
        ? href
        : `https://www.tcgplayer.com${href}`;
    }
  });

  const title = $('h1').first().text().trim() || $('title').text().trim();

  return {
    source: 'TCGPlayer',
    url: productUrl,
    title,
    prices,
    searchResults: results.slice(0, 5),
    currency: 'USD',
  };
}
