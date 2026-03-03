import 'dotenv/config';
import express from 'express';
import { parseCardInput } from './src/inputParser.js';
import { getCached, setCache, makeCacheKey } from './src/cache.js';
import { scrapeAll } from './src/scrapers/index.js';
import { fetchCardImage } from './src/cardImage.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/api/prices', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q"' });
  }

  const cardInfo = parseCardInput(query);
  if (!cardInfo) {
    return res.status(400).json({
      error: 'Invalid format. Expected: Card Name NUM/TOTAL (e.g., Charizard 4/102)',
    });
  }

  const cacheKey = makeCacheKey(cardInfo);
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const [results, tcgApiImage] = await Promise.all([
      scrapeAll(cardInfo),
      fetchCardImage(cardInfo).catch(err => {
        console.error('[CardImage] Failed:', err.message);
        return null;
      }),
    ]);

    // Use TCGdex image as primary source
    const cardImage = tcgApiImage || null;

    const response = { query: cardInfo, results, cardImage, cached: false };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error('Scrape error:', err);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
