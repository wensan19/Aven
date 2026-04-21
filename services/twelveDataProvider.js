const BASE_URL = "https://api.twelvedata.com";

const RANGE_CONFIG = {
  "1d": { interval: "5min", outputsize: 78 },
  "1w": { interval: "1day", outputsize: 7 },
  "1m": { interval: "1day", outputsize: 30 },
  "6m": { interval: "1day", outputsize: 126 },
  "1y": { interval: "1week", outputsize: 52 },
};
const ALLOWED_INTERVALS = new Set(["1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month"]);
const SEARCH_FALLBACKS = {
  DBS: [
    {
      symbol: "D05:SGX",
      name: "DBS Group Holdings Ltd",
      exchange: "SGX",
      currency: "SGD",
      country: "Singapore",
      type: "Common Stock",
    },
  ],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireKey() {
  if (!process.env.STOCK_API_KEY?.trim()) {
    const error = new Error("Missing STOCK_API_KEY. Add it to your environment or .env file.");
    error.statusCode = 503;
    throw error;
  }
}

function parseJsonSafely(rawText) {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const parseError = new Error("Stock provider returned invalid JSON.");
    parseError.statusCode = 502;
    parseError.details = error.message;
    throw parseError;
  }
}

function extractSearchRows(body) {
  if (!body || typeof body !== "object") return [];
  const candidates = [body.data, body.results, body.result, body.values, body.items];
  const arrayCandidate = candidates.find(Array.isArray);
  if (Array.isArray(arrayCandidate)) return arrayCandidate;
  return [];
}

function normalizeSearchItem(item) {
  if (!item || typeof item !== "object") return null;
  const symbol = String(item.symbol || item.ticker || item.code || "").trim().toUpperCase();
  if (!symbol) return null;
  return {
    symbol,
    name: String(item.instrument_name || item.company_name || item.name || ""),
    exchange: String(item.exchange || item.exchange_code || item.mic_code || ""),
    currency: String(item.currency || ""),
    country: String(item.country || item.country_name || ""),
    type: String(item.instrument_type || item.assetType || item.type || ""),
  };
}

function fallbackSearchResults(query) {
  const normalized = String(query || "").trim().toUpperCase();
  if (!normalized) return [];
  if (SEARCH_FALLBACKS[normalized]) return SEARCH_FALLBACKS[normalized];
  if (/^[A-Z][A-Z0-9.:-]{0,14}$/.test(normalized)) {
    return [
      {
        symbol: normalized,
        name: "",
        exchange: "",
        currency: "",
        country: "",
        type: "",
      },
    ];
  }
  return [];
}

async function request(endpoint, params) {
  requireKey();
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries({ ...params, apikey: process.env.STOCK_API_KEY.trim() }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const publicUrl = new URL(url);
  publicUrl.searchParams.set("apikey", "[redacted]");
  console.log(`Twelve Data request: ${endpoint}`, {
    query: params,
    url: publicUrl.toString(),
  });

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    const networkError = new Error("Could not reach the stock provider.");
    networkError.statusCode = 502;
    networkError.details = error.message;
    throw networkError;
  }

  const rawText = await response.text().catch(() => "");
  console.log(`Twelve Data response: ${endpoint}`, {
    status: response.status,
    ok: response.ok,
    hasBody: Boolean(rawText),
    rawPreview: rawText.slice(0, 200),
  });

  const body = parseJsonSafely(rawText);

  if (!response.ok || body.status === "error") {
    const error = new Error(body.message || "Stock provider returned an error.");
    error.statusCode = response.ok ? 502 : response.status;
    error.details = body;
    throw error;
  }

  return body;
}

async function getQuote(symbol) {
  const body = await request("/quote", { symbol, interval: "1day" });
  const currentPrice = toNumber(body.close);
  const fiftyTwoWeekLow = toNumber(body.fifty_two_week?.low);
  const fiftyTwoWeekHigh = toNumber(body.fifty_two_week?.high);

  return {
    symbol: body.symbol || symbol,
    name: body.name || "",
    exchange: body.exchange || "",
    currency: body.currency || "USD",
    currentPrice,
    dailyHigh: toNumber(body.high),
    dailyLow: toNumber(body.low),
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    change: toNumber(body.change),
    percentChange: toNumber(body.percent_change),
    previousClose: toNumber(body.previous_close),
    isMarketOpen: Boolean(body.is_market_open),
    fiftyTwoWeekPosition:
      currentPrice !== null && fiftyTwoWeekLow !== null && fiftyTwoWeekHigh !== null && fiftyTwoWeekHigh > fiftyTwoWeekLow
        ? Math.round(((currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100)
        : null,
    lastUpdated: body.datetime || new Date().toISOString(),
  };
}

async function getHistory(symbol, range = "1m") {
  const config = typeof range === "object" ? range : RANGE_CONFIG[range] || RANGE_CONFIG["1m"];
  const interval = ALLOWED_INTERVALS.has(config.interval) ? config.interval : "1day";
  const outputsize = Math.min(Math.max(Number(config.outputsize || 30), 1), 5000);
  const body = await request("/time_series", {
    symbol,
    interval,
    outputsize,
    order: "asc",
  });

  const values = Array.isArray(body.values) ? body.values : [];
  return {
    symbol: body.meta?.symbol || symbol,
    range: typeof range === "string" ? range : "",
    interval: body.meta?.interval || interval,
    points: values
      .map((point) => ({
        datetime: point.datetime,
        close: toNumber(point.close),
        high: toNumber(point.high),
        low: toNumber(point.low),
        open: toNumber(point.open),
      }))
      .filter((point) => point.close !== null),
  };
}

async function searchSymbols(query) {
  console.log(`Searching Twelve Data symbols for: "${query}"`);
  try {
    const body = await request("/symbol_search", { symbol: query, outputsize: 8 });
    const rows = extractSearchRows(body);
    console.log("Twelve Data symbol search body shape:", {
      topLevelKeys: body && typeof body === "object" ? Object.keys(body) : [],
      rowsIsArray: Array.isArray(rows),
      rowCount: rows.length,
    });
    const mapped = rows.map(normalizeSearchItem).filter(Boolean);
    console.log("Twelve Data symbol search mapped results:", {
      count: mapped.length,
      sample: mapped[0] || null,
    });
    return mapped.length ? mapped : fallbackSearchResults(query);
  } catch (error) {
    console.error("Twelve Data symbol search failed:", {
      query,
      message: error.message,
      details: error.details || null,
    });
    const fallback = fallbackSearchResults(query);
    if (fallback.length) {
      console.log("Using stock search fallback results:", {
        query,
        count: fallback.length,
        sample: fallback[0],
      });
      return fallback;
    }
    throw error;
  }
}

module.exports = {
  getQuote,
  getHistory,
  searchSymbols,
};
