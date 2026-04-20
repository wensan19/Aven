const BASE_URL = "https://api.twelvedata.com";

const RANGE_CONFIG = {
  "1d": { interval: "5min", outputsize: 78 },
  "1w": { interval: "1day", outputsize: 7 },
  "1m": { interval: "1day", outputsize: 30 },
  "6m": { interval: "1day", outputsize: 126 },
  "1y": { interval: "1week", outputsize: 52 },
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireKey() {
  if (!process.env.STOCK_API_KEY) {
    const error = new Error("Missing STOCK_API_KEY. Add it to your environment or .env file.");
    error.statusCode = 503;
    throw error;
  }
}

async function request(endpoint, params) {
  requireKey();
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries({ ...params, apikey: process.env.STOCK_API_KEY }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.status === "error") {
    const error = new Error(body.message || "Stock provider returned an error.");
    error.statusCode = response.ok ? 502 : response.status;
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
  const config = RANGE_CONFIG[range] || RANGE_CONFIG["1m"];
  const body = await request("/time_series", {
    symbol,
    interval: config.interval,
    outputsize: config.outputsize,
    order: "asc",
  });

  const values = Array.isArray(body.values) ? body.values : [];
  return {
    symbol: body.meta?.symbol || symbol,
    range,
    interval: body.meta?.interval || config.interval,
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

module.exports = {
  getQuote,
  getHistory,
};
