const SUGGEST_API = 'https://www.trollandtoad.com/search/suggest.json';
const PRODUCT_API = 'https://www.trollandtoad.com/products';

export async function scrapeTrollandtoad(cardInfo) {
  const { cardName, number, total } = cardInfo;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    // Step 1: Search for the card (include number and total separately — "/" works fine)
    const query = encodeURIComponent(`${cardName} ${number} ${total}`);
    const searchUrl = `${SUGGEST_API}?q=${query}&resources[type]=product&resources[limit]=10&currency=USD`;

    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });

    if (!searchRes.ok) {
      throw new Error(`TrollandToad search returned ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const products = searchData.resources?.results?.products || [];

    // Find the best match by card number, preferring the standard version
    const numberPattern = `${number}/${total}`;
    const withNumber = products.filter(p => p.title?.includes(numberPattern));
    const skipPatterns = ['1st edition', 'shadowless', 'gold metal', 'classic collection'];

    // Prefer: has the number, no special variant keywords
    let match = withNumber.find(p => {
      const t = p.title?.toLowerCase() || '';
      return !skipPatterns.some(s => t.includes(s));
    });

    // Fallback: any with the number
    if (!match && withNumber.length > 0) {
      match = withNumber[0];
    }

    // Fallback: first result
    if (!match && products.length > 0) {
      match = products[0];
    }

    if (!match) {
      return {
        source: 'TrollandToad',
        url: `https://www.trollandtoad.com/search?q=${query}&type=product`,
        title: '',
        listings: [],
        currency: 'USD',
      };
    }

    // Step 2: Fetch product detail for per-condition prices
    const detailUrl = `${PRODUCT_API}/${match.handle}.json?currency=USD`;
    const detailRes = await fetch(detailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });

    const listings = [];

    if (detailRes.ok) {
      const detailData = await detailRes.json();
      const variants = detailData.product?.variants || [];

      for (const v of variants) {
        if (v.price && parseFloat(v.price) > 0) {
          listings.push({
            name: `${match.title} - ${v.title}`,
            condition: v.title,
            price: '$' + parseFloat(v.price).toFixed(2),
          });
        }
      }
    }

    // Fallback: use the search result price if no variants
    if (listings.length === 0 && match.price) {
      listings.push({
        name: match.title,
        condition: 'Listed Price',
        price: '$' + parseFloat(match.price).toFixed(2),
      });
    }

    const productUrl = match.url
      ? `https://www.trollandtoad.com${match.url.split('?')[0]}`
      : `https://www.trollandtoad.com/products/${match.handle}`;

    return {
      source: 'TrollandToad',
      url: productUrl,
      title: match.title || '',
      listings,
      currency: 'USD',
    };
  } finally {
    clearTimeout(timer);
  }
}
