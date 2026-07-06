/**
 * Morning Brief — Market intel aggregator
 * 
 * Fetches live data from free APIs for a daily market briefing.
 * Runs on Railway (always online), accessible via GET /api/v1/brief
 * 
 * Sources:
 * - Frankfurter API — EUR/USD, GBP/USD, etc.
 * - alternative.me — Fear & Greed Index
 * - CoinGecko — Crypto prices
 * - Google News RSS — Top market headlines
 * - ForexFactory (scrape) — Economic calendar (may be blocked)
 * 
 * @author Cloud99p
 */

const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const FNG = 'https://api.alternative.me/fng/?limit=1';
const COINGECKO_SIMPLE = 'https://api.coingecko.com/api/v3/simple/price';
const NEWS_RSS = 'https://news.google.com/rss/search';

export interface BriefData {
  date: string;
  timestamp: string;
  prices: Record<string, number>;
  fearAndGreed: { value: number; label: string } | null;
  crypto: Record<string, number>;
  news: Array<{ title: string; source: string; link?: string }>;
  calendar: Array<{ time: string; currency: string; event: string; forecast?: string; previous?: string }>;
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseFxRate(usdRates: Record<string, number> | null): Record<string, number> {
  if (!usdRates) return {};
  const fx: Record<string, number> = {};
  // Direct quotes (USD as base)
  if (usdRates.JPY) fx['USD/JPY'] = usdRates.JPY;
  if (usdRates.CHF) fx['USD/CHF'] = usdRates.CHF;
  if (usdRates.CAD) fx['USD/CAD'] = usdRates.CAD;
  // Inverted quotes (USD as quote)
  if (usdRates.EUR) fx['EUR/USD'] = parseFloat((1 / usdRates.EUR).toFixed(5));
  if (usdRates.GBP) fx['GBP/USD'] = parseFloat((1 / usdRates.GBP).toFixed(5));
  if (usdRates.AUD) fx['AUD/USD'] = parseFloat((1 / usdRates.AUD).toFixed(5));
  return fx;
}

async function fetchPrices(): Promise<Record<string, number>> {
  const data = await fetchJson(`${FRANKFURTER}/latest?from=USD&to=EUR,GBP,CHF,JPY,CAD,AUD`);
  if (data && data.rates) return parseFxRate(data.rates);
  return {};
}

async function fetchFearAndGreed(): Promise<{ value: number; label: string } | null> {
  const data = await fetchJson(FNG);
  if (data && data.data && data.data[0]) {
    const entry = data.data[0];
    return { value: parseInt(entry.value || '0'), label: entry.value_classification || 'Unknown' };
  }
  return null;
}

async function fetchCrypto(): Promise<Record<string, number>> {
  const data = await fetchJson(
    `${COINGECKO_SIMPLE}?ids=bitcoin,ethereum,solana&vs_currencies=usd`
  );
  if (!data) return {};
  return {
    BTC: data.bitcoin?.usd || 0,
    ETH: data.ethereum?.usd || 0,
    SOL: data.solana?.usd || 0,
  };
}

async function fetchNews(): Promise<Array<{ title: string; source: string; link?: string }>> {
  try {
    const rss = await fetchText(
      `${NEWS_RSS}?q=forex+markets+economy+July+2026&hl=en-US&gl=US&ceid=US:en`
    );
    if (!rss) return [];

    const headlines: Array<{ title: string; source: string; link?: string }> = [];
    // Simple XML parse — extract <title> and <source> from <item> elements
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = itemRegex.exec(rss)) !== null && count < 8) {
      const item = match[1];
      const titleMatch = item.match(/<title>(.*?)<\/title>/);
      const sourceMatch = item.match(/<source>(.*?)<\/source>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);

      if (titleMatch && titleMatch[1] && !titleMatch[1].startsWith('Google News')) {
        headlines.push({
          title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
          source: sourceMatch ? sourceMatch[1] : 'Google News',
          link: linkMatch ? linkMatch[1] : undefined,
        });
        count++;
      }
    }

    return headlines;
  } catch {
    return [];
  }
}

async function fetchCalendar(): Promise<Array<{ time: string; currency: string; event: string; forecast?: string; previous?: string }>> {
  // ForexFactory blocks scraping from most IPs. Try a simple scraper first.
  try {
    const html = await fetchText('https://www.forexfactory.com/calendar?day=today', 4000);
    if (html && html.length > 200) {
      // Try to extract calendar data
      const events: Array<{ time: string; currency: string; event: string; forecast?: string; previous?: string }> = [];
      // This is fragile — ForexFactory uses JS-rendered tables
      // If it fails silently, return empty — the brief still works with prices + news
      return events;
    }
  } catch {
    // Expected — ForexFactory blocks scrapers
  }
  return [];
}

/**
 * Build the full morning brief.
 * Tries all sources, returns whatever succeeds.
 */
export async function buildBrief(): Promise<BriefData> {
  const [prices, fng, crypto, news] = await Promise.all([
    fetchPrices(),
    fetchFearAndGreed(),
    fetchCrypto(),
    fetchNews(),
  ]);

  const now = new Date();

  return {
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    prices,
    fearAndGreed: fng,
    crypto,
    news,
    calendar: [], // ForexFactory blocked; manual entry by user
  };
}
