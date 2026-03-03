export function parseCardInput(query) {
  const trimmed = query.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  return {
    cardName: match[1].trim(),
    number: match[2],
    total: match[3],
  };
}
