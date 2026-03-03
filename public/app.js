const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsDiv = document.getElementById('results');
const errorBanner = document.getElementById('error-banner');
const cardHeader = document.getElementById('card-header');
const cardImageWrap = document.getElementById('card-image-wrap');
const queryInfo = document.getElementById('query-info');

const SOURCES = ['pricecharting', 'ebay', 'cardmarket', 'tcgplayer', 'trollandtoad'];
const SOURCE_LABELS = {
  pricecharting: 'PriceCharting',
  ebay: 'eBay Sold',
  cardmarket: 'Cardmarket',
  tcgplayer: 'TCGPlayer',
  trollandtoad: 'TrollandToad',
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  errorBanner.hidden = true;
  cardHeader.hidden = true;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching...';

  // Show loading skeletons
  resultsDiv.innerHTML = SOURCES.map(s => renderCard(s, 'loading')).join('');

  try {
    const res = await fetch(`/api/prices?q=${encodeURIComponent(query)}`);
    const json = await res.json();

    if (!res.ok) {
      errorBanner.textContent = json.error || 'Search failed';
      errorBanner.hidden = false;
      resultsDiv.innerHTML = '';
      return;
    }

    // Show card header with image
    const ci = json.cardImage;
    if (ci && ci.imageLarge) {
      cardImageWrap.innerHTML = `<a href="${ci.imageLarge}" target="_blank"><img src="${ci.imageLarge}" alt="${escapeHtml(ci.name)}" /></a>`;
    } else {
      cardImageWrap.innerHTML = '';
    }

    let infoHtml = `<div class="card-name">${escapeHtml(json.query.cardName)}</div>`;
    if (ci && ci.set) {
      infoHtml += `<div class="card-set">${escapeHtml(ci.set)}</div>`;
    }
    infoHtml += `<div class="card-number">#${json.query.number}/${json.query.total}</div>`;
    if (json.cached) {
      infoHtml += `<div style="color:#556677;font-size:0.8rem;margin-top:0.3rem">(cached)</div>`;
    }
    queryInfo.innerHTML = infoHtml;
    cardHeader.hidden = false;

    // Update each source card
    SOURCES.forEach(s => {
      const sourceData = json.results[s];
      const cardEl = document.getElementById(`card-${s}`);
      if (!cardEl) return;

      if (sourceData && sourceData.status === 'ok') {
        cardEl.outerHTML = renderCard(s, 'ok', sourceData.data);
      } else {
        cardEl.outerHTML = renderCard(s, 'error', null, sourceData?.error);
      }
    });
  } catch (err) {
    errorBanner.textContent = `Network error: ${err.message}`;
    errorBanner.hidden = false;
    resultsDiv.innerHTML = '';
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
});

function renderCard(source, state, data, error) {
  const label = SOURCE_LABELS[source] || source;
  const cls = `source-card source-card--${source}`;

  if (state === 'loading') {
    return `
      <div class="${cls}" id="card-${source}">
        <div class="source-card__header">
          ${label}
          <span class="badge">Loading</span>
        </div>
        <div class="source-card__body skeleton">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>`;
  }

  if (state === 'error') {
    return `
      <div class="${cls} source-card--error" id="card-${source}">
        <div class="source-card__header">
          ${label}
          <span class="badge" style="background:#cc4444;color:#fff">Error</span>
        </div>
        <div class="source-card__body">
          ${error || 'Failed to fetch prices'}
        </div>
      </div>`;
  }

  let body = '';
  let footer = '';

  if (data?.url) {
    footer = `<div class="source-card__footer"><a href="${data.url}" target="_blank" rel="noopener">View on ${label} &rarr;</a></div>`;
  }

  if (source === 'pricecharting') {
    body = renderPricecharting(data);
  } else if (source === 'ebay') {
    body = renderEbay(data);
  } else if (source === 'cardmarket') {
    body = renderCardmarket(data);
  } else if (source === 'tcgplayer') {
    body = renderTcgplayer(data);
  } else if (source === 'trollandtoad') {
    body = renderTrollandtoad(data);
  }

  return `
    <div class="${cls}" id="card-${source}">
      <div class="source-card__header">
        ${label}
        <span class="badge">OK</span>
      </div>
      <div class="source-card__body">${body || '<p class="no-data">No price data found</p>'}</div>
      ${footer}
    </div>`;
}

function renderPricecharting(data) {
  if (!data?.prices || Object.keys(data.prices).length === 0) return '';

  const gradeLabels = {
    ungraded: 'Ungraded',
    grade7: 'Grade 7',
    grade8: 'Grade 8',
    grade9: 'Grade 9',
    grade9_5: 'Grade 9.5',
    psa10: 'PSA 10',
    bgs10: 'BGS 10',
    cgc10: 'CGC 10',
  };

  const rows = Object.entries(data.prices)
    .filter(([key]) => gradeLabels[key])
    .map(([key, val]) => `<tr><td>${gradeLabels[key]}</td><td>${val}</td></tr>`)
    .join('');

  if (!rows) return '';
  return `<table class="price-table">${rows}</table>`;
}

function renderEbay(data) {
  if (!data?.recentSales?.length) return '';

  return data.recentSales.slice(0, 8).map(sale => `
    <div class="sale-item">
      <div class="sale-item__title" title="${escapeHtml(sale.title)}">${escapeHtml(sale.title)}</div>
      <div class="sale-item__meta">
        <span class="sale-item__price">${sale.price}</span>
        ${sale.grade ? `<span class="sale-item__grade">${sale.grade}</span>` : ''}
        ${sale.soldDate ? `<span class="sale-item__date">${sale.soldDate}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderCardmarket(data) {
  if (!data?.prices || Object.keys(data.prices).length === 0) return '';

  const labels = {
    priceTrend: 'Price Trend',
    avg30day: '30-Day Avg',
    avg7day: '7-Day Avg',
    avg1day: '1-Day Avg',
    lowestListing: 'Lowest Listing',
  };

  const rows = Object.entries(data.prices)
    .filter(([key]) => labels[key])
    .map(([key, val]) => `<tr><td>${labels[key]}</td><td>${val}</td></tr>`)
    .join('');

  let extra = '';
  if (data.prices.availableItems) {
    extra = `<tr><td>Available</td><td>${data.prices.availableItems} items</td></tr>`;
  }

  return `<table class="price-table">${rows}${extra}</table>`;
}

function renderTcgplayer(data) {
  if (!data?.prices || Object.keys(data.prices).length === 0) {
    // Try search results
    if (data?.searchResults?.length) {
      return data.searchResults.slice(0, 5).map(r => `
        <div class="sale-item">
          <div class="sale-item__title">${escapeHtml(r.name)}</div>
          <div class="sale-item__meta"><span class="sale-item__price">${r.price}</span></div>
        </div>
      `).join('');
    }
    return '';
  }

  const labels = {
    marketPrice: 'Market Price',
    listedMedian: 'Listed Median',
    low: 'Lowest',
  };

  const rows = Object.entries(data.prices)
    .filter(([key]) => labels[key])
    .map(([key, val]) => `<tr><td>${labels[key]}</td><td>${val}</td></tr>`)
    .join('');

  return `<table class="price-table">${rows}</table>`;
}

function renderTrollandtoad(data) {
  if (!data?.listings?.length) return '';

  return data.listings.slice(0, 8).map(item => `
    <div class="sale-item">
      <div class="sale-item__title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div class="sale-item__meta"><span class="sale-item__price">${item.price}</span></div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
