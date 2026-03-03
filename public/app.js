const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const resultsDiv = document.getElementById('results');
const errorBanner = document.getElementById('error-banner');
const cardHeader = document.getElementById('card-header');
const cardImageWrap = document.getElementById('card-image-wrap');
const queryInfo = document.getElementById('query-info');
const recommendedDiv = document.getElementById('recommended');

const SOURCES = ['pricecharting', 'ebay', 'tcgplayer', 'cardmarket', 'trollandtoad'];
const SOURCE_LABELS = {
  pricecharting: 'PriceCharting',
  ebay: 'eBay Sold',
  cardmarket: 'Cardmarket',
  tcgplayer: 'TCGPlayer',
  trollandtoad: 'TrollandToad',
};

// Approximate exchange rates (USD base)
const RATES = { EUR: 0.92, NIS: 3.65 };

// Try to fetch live rates on page load
(async () => {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        RATES.EUR = data.rates.EUR || RATES.EUR;
        RATES.NIS = data.rates.ILS || RATES.NIS;
      }
    }
  } catch { /* use fallback rates */ }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  errorBanner.hidden = true;
  cardHeader.hidden = true;
  recommendedDiv.hidden = true;
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

    const displayName = titleCase(json.query.cardName);
    let infoHtml = `<div class="card-name">${escapeHtml(displayName)}</div>`;
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

    // Compute and show recommended prices
    renderRecommended(json.results);
  } catch (err) {
    errorBanner.textContent = `Network error: ${err.message}`;
    errorBanner.hidden = false;
    resultsDiv.innerHTML = '';
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
});

// --- Recommended price calculation ---

function renderRecommended(results) {
  // Collect prices per category (all in USD)
  const buckets = {
    raw: [],
    grade9: [],
    grade9_5: [],
    psa10: [],
  };

  // PriceCharting — most reliable single source for graded prices
  const pc = results.pricecharting;
  if (pc?.status === 'ok' && pc.data?.prices) {
    const p = pc.data.prices;
    if (p.ungraded) push(buckets.raw, parseDollar(p.ungraded), 'PriceCharting');
    if (p.grade9) push(buckets.grade9, parseDollar(p.grade9), 'PriceCharting');
    if (p.grade9_5) push(buckets.grade9_5, parseDollar(p.grade9_5), 'PriceCharting');
    if (p.psa10) push(buckets.psa10, parseDollar(p.psa10), 'PriceCharting');
  }

  // eBay sold — only use sales with a detected PSA grade
  const eb = results.ebay;
  if (eb?.status === 'ok' && eb.data?.recentSales?.length) {
    for (const sale of eb.data.recentSales) {
      const price = parseDollar(sale.price);
      if (!price || !sale.grade) continue;
      const gradeNum = parseFloat(sale.grade.replace(/PSA\s*/i, ''));
      if (gradeNum === 10) push(buckets.psa10, price, 'eBay');
      else if (gradeNum >= 9.5) push(buckets.grade9_5, price, 'eBay');
      else if (gradeNum >= 9) push(buckets.grade9, price, 'eBay');
    }
  }

  // Cardmarket — ungraded singles market (EUR → USD)
  const cm = results.cardmarket;
  if (cm?.status === 'ok' && cm.data?.prices) {
    const eurRate = RATES.EUR || 0.92;
    // Use 30-day avg if available, otherwise price trend
    const avg30 = parseEuro(cm.data.prices.avg30day);
    const trend = parseEuro(cm.data.prices.priceTrend);
    const eurPrice = avg30 || trend;
    if (eurPrice) push(buckets.raw, eurPrice / eurRate, 'Cardmarket');
  }

  // TCGPlayer — market price (ungraded)
  const tcp = results.tcgplayer;
  if (tcp?.status === 'ok' && tcp.data?.prices) {
    const mp = parseDollar(tcp.data.prices.marketPrice);
    if (mp) push(buckets.raw, mp, 'TCGPlayer');
    const low = parseDollar(tcp.data.prices.lowestPrice);
    if (low) push(buckets.raw, low, 'TCGPlayer');
  }

  // TrollandToad excluded from recommended prices (less reliable pricing)

  // Remove outliers (values more than 3x the median) from each bucket
  for (const key of Object.keys(buckets)) {
    buckets[key] = removeOutliers(buckets[key]);
  }

  const categories = [
    { key: 'raw', label: 'Raw / Ungraded' },
    { key: 'grade9', label: 'PSA 9' },
    { key: 'grade9_5', label: 'PSA 9.5' },
    { key: 'psa10', label: 'PSA 10' },
  ];

  const hasData = categories.some(c => buckets[c.key].length > 0);
  if (!hasData) {
    recommendedDiv.hidden = true;
    return;
  }

  let totalPoints = 0;
  let html = `<h3>Recommended Price</h3><div class="rec-grid">`;

  for (const cat of categories) {
    const items = buckets[cat.key];
    if (items.length === 0) continue;
    const prices = items.map(i => i.value);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sources = [...new Set(items.map(i => i.source))].join(', ');
    totalPoints += items.length;
    html += renderRecCard(cat.label, avg, items.length, sources);
  }

  html += `</div>`;
  html += `<div class="rec-note">Based on ${totalPoints} data points across sources</div>`;

  recommendedDiv.innerHTML = html;
  recommendedDiv.hidden = false;
}

function push(arr, value, source) {
  if (value != null && value > 0) arr.push({ value, source });
}

function removeOutliers(items) {
  if (items.length < 3) return items;
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const mid = sorted[Math.floor(sorted.length / 2)].value;
  return items.filter(i => i.value >= mid / 3 && i.value <= mid * 3);
}

function renderRecCard(label, usdPrice, count, sources) {
  const eur = usdPrice * (RATES.EUR || 0.92);
  const nis = usdPrice * (RATES.NIS || 3.65);

  return `
    <div class="rec-card">
      <div class="rec-card__label">${label}</div>
      <div class="rec-card__price">$${formatPrice(usdPrice)}</div>
      <div class="rec-card__conversions">
        ${formatPrice(eur)} EUR &nbsp;|&nbsp; ${formatPrice(nis)} ILS
      </div>
      <div class="rec-card__note">${sources}</div>
    </div>`;
}

function formatPrice(val) {
  if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return val.toFixed(2);
}

function parseDollar(str) {
  if (!str) return null;
  const match = String(str).match(/\$?([\d,]+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(val) || val === 0 ? null : val;
}

function parseEuro(str) {
  if (!str) return null;
  const match = String(str).match(/([\d.,]+)\s*€?/);
  if (!match) return null;
  // European format: 1.234,56 or 1234.56
  let raw = match[1];
  if (raw.includes(',') && raw.indexOf(',') > raw.indexOf('.')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    raw = raw.replace(/,/g, '');
  }
  const val = parseFloat(raw);
  return isNaN(val) || val === 0 ? null : val;
}

function average(arr) {
  const valid = arr.filter(v => v != null && v > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function titleCase(str) {
  return str.replace(/\b\w+/g, w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).replace(/\bVmax\b/gi, 'VMAX')
   .replace(/\bVstar\b/gi, 'VSTAR')
   .replace(/\bEx\b/g, 'ex')
   .replace(/\bGx\b/gi, 'GX')
   .replace(/\bV\b/g, 'V');
}

// --- Source card renderers ---

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
  if (!data?.prices || Object.keys(data.prices).length === 0) return '';

  const labels = {
    marketPrice: 'Market Price',
    lowestPrice: 'Lowest',
    lowestWithShipping: 'Low + Shipping',
  };

  const rows = Object.entries(data.prices)
    .filter(([key]) => labels[key])
    .map(([key, val]) => `<tr><td>${labels[key]}</td><td>${val}</td></tr>`)
    .join('');

  if (!rows) return '';
  let html = `<table class="price-table">${rows}</table>`;
  if (data.setName) {
    html += `<div style="color:#556677;font-size:0.75rem;margin-top:0.4rem">${escapeHtml(data.setName)}</div>`;
  }
  return html;
}

function renderTrollandtoad(data) {
  if (!data?.listings?.length) return '';

  return data.listings.slice(0, 8).map(item => `
    <div class="sale-item">
      <div class="sale-item__title" title="${escapeHtml(item.name)}">${escapeHtml(item.condition || item.name)}</div>
      <div class="sale-item__meta"><span class="sale-item__price">${item.price}</span></div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
