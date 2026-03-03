const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';

export async function fetchCardImage(cardInfo) {
  const { cardName, number, total } = cardInfo;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    // Search by card name
    const searchUrl = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(cardName)}`;
    console.log('[CardImage] Fetching:', searchUrl);
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log('[CardImage] Search failed:', response.status);
      return null;
    }

    const cards = await response.json();
    if (!Array.isArray(cards) || cards.length === 0) {
      console.log('[CardImage] No cards found');
      return null;
    }

    console.log(`[CardImage] Found ${cards.length} cards, looking for number=${number}`);

    // Filter to cards matching the number
    const numberMatches = cards.filter(c => c.localId === number);
    if (numberMatches.length === 0) {
      // No number match — use first result as fallback
      const baseImage = cards[0].image || '';
      return makeResult(cards[0], baseImage);
    }

    // Prefer exact name match (not "Charizard δ" when searching "Charizard")
    const exactName = numberMatches.filter(
      c => c.name.toLowerCase() === cardName.toLowerCase()
    );
    const candidates = exactName.length > 0 ? exactName : numberMatches;

    if (candidates.length === 1) {
      console.log(`[CardImage] Single match: ${candidates[0].id}`);
      return makeResult(candidates[0], candidates[0].image || '');
    }

    // Multiple matches — fetch details to find the one from the correct set (by total card count)
    for (const candidate of candidates) {
      try {
        const detailRes = await fetch(`${TCGDEX_BASE}/cards/${candidate.id}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        const setTotal = detail.set?.cardCount?.official || detail.set?.cardCount?.total;
        if (String(setTotal) === String(total)) {
          console.log(`[CardImage] Set match: ${detail.id} (${detail.set?.name})`);
          return {
            id: detail.id,
            name: detail.name,
            number: detail.localId,
            set: detail.set?.name || '',
            imageSmall: detail.image ? `${detail.image}/low.png` : '',
            imageLarge: detail.image ? `${detail.image}/high.png` : '',
          };
        }
      } catch {
        continue;
      }
    }

    // No set match found — use the first candidate
    console.log(`[CardImage] No set match, using first: ${candidates[0].id}`);
    return makeResult(candidates[0], candidates[0].image || '');
  } catch (err) {
    console.error('[CardImage] Error:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function makeResult(card, baseImage) {
  return {
    id: card.id,
    name: card.name,
    number: card.localId,
    set: '',
    imageSmall: baseImage ? `${baseImage}/low.png` : '',
    imageLarge: baseImage ? `${baseImage}/high.png` : '',
  };
}
