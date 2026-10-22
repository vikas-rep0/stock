// Marketboard - Zero-dependency Node.js 18+ Server
// Uses only built-in http, url, fs, path, and global fetch

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Symbol validation regex (allows standard tickers, Yahoo suffixes like .NS, .BO, indices with ^, etc.)
const SYMBOL_REGEX = /^[A-Za-z0-9\.\-\=\^]{1,15}$/;

// In-memory caches with TTL
// History cache: 5 minutes (300,000 ms)
const historyCache = new Map();
const HISTORY_TTL = 5 * 60 * 1000;

// Quotes cache: 10 seconds (10,000 ms)
const quotesCache = new Map();
const QUOTES_TTL = 10 * 1000;

// Concurrency limiter helper (max 4 concurrent Yahoo fetches)
const CONCURRENCY_LIMIT = 4;
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        results[i] = { error: err.message, symbol: items[i] };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// Map user ranges to Yahoo Finance range & interval parameters
function mapRangeAndInterval(range) {
  const r = (range || '1m').toLowerCase();
  switch (r) {
    case '5d':
      return { range: '5d', interval: '15m' };
    case '1m':
    case '1mo':
      return { range: '1mo', interval: '1d' };
    case '3m':
    case '3mo':
      return { range: '3mo', interval: '1d' };
    case '6m':
    case '6mo':
      return { range: '6mo', interval: '1d' };
    case '1y':
      return { range: '1y', interval: '1d' };
    case '5y':
      return { range: '5y', interval: '1wk' };
    default:
      return { range: '1mo', interval: '1d' };
  }
}

// Fetch chart data from Yahoo Finance
async function fetchYahooChart(symbol, range = '1m', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%7Csplit`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout per request

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`Yahoo Finance responded with status ${res.status}`);
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error(data?.chart?.error?.description || 'No data found for symbol');
    }
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Parse chart response into clean format
function parseYahooResult(result) {
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  // Filter out null or missing data points
  const cleanData = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const c = closes[i];
    if (t !== undefined && c !== null && c !== undefined && !isNaN(c)) {
      cleanData.push({
        time: t * 1000,
        open: opens[i] != null && !isNaN(opens[i]) ? Number(opens[i].toFixed(2)) : Number(c.toFixed(2)),
        high: highs[i] != null && !isNaN(highs[i]) ? Number(highs[i].toFixed(2)) : Number(c.toFixed(2)),
        low: lows[i] != null && !isNaN(lows[i]) ? Number(lows[i].toFixed(2)) : Number(c.toFixed(2)),
        close: Number(c.toFixed(2)),
        volume: volumes[i] != null && !isNaN(volumes[i]) ? volumes[i] : 0,
      });
    }
  }

  const currentPrice = meta.regularMarketPrice ?? (cleanData.length > 0 ? cleanData[cleanData.length - 1].close : 0);
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? (cleanData.length > 1 ? cleanData[cleanData.length - 2].close : currentPrice);
  const change = currentPrice - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    currency: meta.currency || (meta.symbol?.endsWith('.NS') || meta.symbol?.endsWith('.BO') ? 'INR' : 'USD'),
    shortName: meta.shortName || meta.symbol,
    regularMarketPrice: Number(currentPrice.toFixed(2)),
    previousClose: Number(prevClose.toFixed(2)),
    regularMarketChange: Number(change.toFixed(2)),
    regularMarketChangePercent: Number(changePercent.toFixed(2)),
    regularMarketDayHigh: meta.regularMarketDayHigh ? Number(meta.regularMarketDayHigh.toFixed(2)) : Math.max(...cleanData.map(d => d.high), currentPrice),
    regularMarketDayLow: meta.regularMarketDayLow ? Number(meta.regularMarketDayLow.toFixed(2)) : Math.min(...cleanData.map(d => d.low), currentPrice),
    regularMarketVolume: meta.regularMarketVolume || cleanData.reduce((acc, d) => acc + d.volume, 0),
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ? Number(meta.fiftyTwoWeekHigh.toFixed(2)) : null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ? Number(meta.fiftyTwoWeekLow.toFixed(2)) : null,
    history: cleanData,
  };
}

// Set CORS and JSON headers
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

// HTTP Request Handler
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // GET /api/health
  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, timestamp: Date.now() });
  }

  // GET /api/history?symbol=...&range=...
  if (pathname === '/api/history') {
    const symbol = (parsedUrl.searchParams.get('symbol') || '').trim().toUpperCase();
    const rangeParam = (parsedUrl.searchParams.get('range') || '1m').trim().toLowerCase();

    if (!symbol || !SYMBOL_REGEX.test(symbol)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid or missing symbol parameter' });
    }

    const { range, interval } = mapRangeAndInterval(rangeParam);
    const cacheKey = `${symbol}:${range}:${interval}`;

    // Check history cache (5 min TTL)
    const cached = historyCache.get(cacheKey);
    if (cached && Date.now() < cached.expireAt) {
      return sendJson(res, 200, { ok: true, cached: true, data: cached.data });
    }

    try {
      const yahooResult = await fetchYahooChart(symbol, range, interval);
      const parsed = parseYahooResult(yahooResult);
      historyCache.set(cacheKey, { data: parsed, expireAt: Date.now() + HISTORY_TTL });
      return sendJson(res, 200, { ok: true, cached: false, data: parsed });
    } catch (err) {
      // If we have stale cache, serve it
      if (cached) {
        return sendJson(res, 200, { ok: true, cached: true, stale: true, data: cached.data });
      }
      return sendJson(res, 502, { ok: false, error: err.message, symbol });
    }
  }

  // GET /api/quotes?symbols=a,b,c
  if (pathname === '/api/quotes') {
    const rawSymbols = (parsedUrl.searchParams.get('symbols') || '').split(',');
    const symbols = rawSymbols
      .map(s => s.trim().toUpperCase())
      .filter(s => s && SYMBOL_REGEX.test(s))
      .slice(0, 45); // Max 45 symbols per call

    if (symbols.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'Invalid or missing symbols parameter' });
    }

    const now = Date.now();
    const uncachedSymbols = [];
    const results = {};

    for (const sym of symbols) {
      const cached = quotesCache.get(sym);
      if (cached && now < cached.expireAt) {
        results[sym] = cached.data;
      } else {
        uncachedSymbols.push(sym);
      }
    }

    if (uncachedSymbols.length > 0) {
      const fetched = await mapConcurrent(uncachedSymbols, CONCURRENCY_LIMIT, async (sym) => {
        try {
          const yahooResult = await fetchYahooChart(sym, '5d', '1d');
          const parsed = parseYahooResult(yahooResult);
          
          // Generate 10-point sparkline from historical closes
          const sparkline = (parsed.history || []).slice(-15).map(h => h.close);
          
          const quote = {
            symbol: parsed.symbol,
            currency: parsed.currency,
            shortName: parsed.shortName,
            regularMarketPrice: parsed.regularMarketPrice,
            regularMarketChange: parsed.regularMarketChange,
            regularMarketChangePercent: parsed.regularMarketChangePercent,
            regularMarketDayHigh: parsed.regularMarketDayHigh,
            regularMarketDayLow: parsed.regularMarketDayLow,
            regularMarketVolume: parsed.regularMarketVolume,
            fiftyTwoWeekHigh: parsed.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: parsed.fiftyTwoWeekLow,
            previousClose: parsed.previousClose,
            sparkline,
          };
          
          quotesCache.set(sym, { data: quote, expireAt: now + QUOTES_TTL });
          return quote;
        } catch (err) {
          // If previous cache exists, keep it
          const old = quotesCache.get(sym);
          if (old) return old.data;
          return { symbol: sym, error: err.message };
        }
      });

      for (const item of fetched) {
        if (item && item.symbol) {
          results[item.symbol] = item;
        }
      }
    }

    const quotesList = symbols.map(sym => results[sym] || { symbol: sym, unavailable: true });
    return sendJson(res, 200, { ok: true, quotes: quotesList });
  }

  // Serve index.html for root and SPA routes
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Error loading index.html: ' + err.message);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Default 404 for unknown endpoints
  sendJson(res, 404, { ok: false, error: 'Not Found' });
});

// Start listening on HOST and PORT
server.listen(PORT, HOST, () => {
  console.log(`Marketboard server listening on http://${HOST}:${PORT}`);
});
