const cache = new Map();
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data, ttl = DEFAULT_TTL) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

export function makeCacheKey(cardInfo) {
  return `${cardInfo.cardName.toLowerCase()}-${cardInfo.number}-${cardInfo.total}`;
}
