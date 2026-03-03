import 'dotenv/config';

const API_TOKEN = process.env.BRIGHT_DATA_API_TOKEN;
const DEFAULT_ZONE = process.env.BRIGHT_DATA_UNLOCKER_ZONE || 'mcp_unlocker';
const BROWSER_ZONE = process.env.BRIGHT_DATA_BROWSER_ZONE || 'mcp_browser';

export async function fetchPage(targetUrl, options = {}) {
  const zone = options.browser ? BROWSER_ZONE : (options.zone || DEFAULT_ZONE);
  const timeout = options.timeout || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone,
        url: targetUrl,
        format: 'raw',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Bright Data API returned ${response.status}: ${body}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
