const SEARCH_API = 'https://mp-search-api.tcgplayer.com/v1/search/request';

export async function scrapeTcgplayer(cardInfo) {
  const { cardName, number, total } = cardInfo;

  // Search with card name (number format like "4/102" confuses the API)
  const query = encodeURIComponent(cardName);
  const url = `${SEARCH_API}?q=${query}&isList=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        algorithm: 'sales_exp_fields',
        from: 0,
        size: 20,
        filters: {
          term: { productLineName: ['pokemon'] },
          range: {},
          match: {},
        },
        listingSearch: {
          filters: { term: {}, range: {}, exclude: {} },
        },
        context: { shippingCountry: 'US' },
        settings: { useFuzzySearch: true },
        sort: {},
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TCGPlayer API returned ${response.status}`);
    }

    const data = await response.json();
    const allResults = data.results?.[0]?.results || [];

    // Find the best match by card number
    const targetNum = number.padStart(3, '0') + '/' + total.padStart(3, '0');
    let match = allResults.find(r => {
      const num = r.customAttributes?.number || '';
      return num === targetNum || num === `${number}/${total}`;
    });

    // Fallback: match by name and exclude shadowless/1st edition
    if (!match) {
      match = allResults.find(r =>
        r.productName?.toLowerCase() === cardName.toLowerCase() &&
        !r.setName?.toLowerCase().includes('shadowless') &&
        !r.productName?.toLowerCase().includes('1st edition')
      );
    }

    if (!match && allResults.length > 0) {
      match = allResults[0];
    }

    const prices = {};
    if (match) {
      if (match.marketPrice) prices.marketPrice = '$' + match.marketPrice.toFixed(2);
      if (match.lowestPrice) prices.lowestPrice = '$' + match.lowestPrice.toFixed(2);
      if (match.lowestPriceWithShipping) prices.lowestWithShipping = '$' + match.lowestPriceWithShipping.toFixed(2);
    }

    const productUrl = match
      ? `https://www.tcgplayer.com/product/${match.productId}`
      : `https://www.tcgplayer.com/search/pokemon/product?q=${query}`;

    return {
      source: 'TCGPlayer',
      url: productUrl,
      title: match?.productName || '',
      setName: match?.setName || '',
      prices,
      currency: 'USD',
    };
  } finally {
    clearTimeout(timer);
  }
}
