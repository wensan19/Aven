import { requireSupabase } from "./supabaseClient";

function stockUrl(path, params) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `/api${path}${search}`;
  console.debug("Stock request URL:", url);
  return url;
}

async function parseResponseBody(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Stock response JSON parse failed:", {
      status: response.status,
      bodyPreview: text.slice(0, 200),
      error: error.message,
    });
    return { error: "Stock search failed on the server.", details: text.slice(0, 200) };
  }
}

async function readJsonResponse(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (!text) return { error: `Stock request failed (${response.status}).` };
    try {
      return JSON.parse(text);
    } catch {
      return { error: "Stock search failed on the server.", details: text.slice(0, 200) };
    }
  }
  return parseResponseBody(response);
}

export async function fetchStockQuote(symbol) {
  const response = await fetch(stockUrl("/stocks/quote", { symbol }));
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(body.error || "Could not load stock quote.");
  return body.quote;
}

export async function fetchStockHistory(symbol, range = "1m") {
  const params = { symbol };
  if (typeof range === "object") {
    if (range.interval) params.interval = range.interval;
    if (range.outputsize) params.outputsize = String(range.outputsize);
  } else {
    params.range = range;
  }
  const response = await fetch(stockUrl("/stocks/history", params));
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(body.error || "Could not load stock history.");
  return body.history;
}

export async function searchStocks(query) {
  const url = stockUrl("/stocks/search", { query });
  const response = await fetch(url);
  const body = await readJsonResponse(response);
  console.debug("Stock search response:", {
    ok: response.ok,
    status: response.status,
    resultCount: Array.isArray(body.results) ? body.results.length : 0,
    hasError: Boolean(body.error),
    details: body.details || null,
  });
  if (!response.ok) throw new Error(body.error || `Stock search failed on the server (${response.status}).`);
  return Array.isArray(body.results) ? body.results : [];
}

export async function addStock(userId, symbol) {
  const normalized = symbol.trim().toUpperCase();
  const { data, error } = await requireSupabase()
    .from("stock_watchlists")
    .upsert({ user_id: userId, symbol: normalized }, { onConflict: "user_id,symbol" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeStock(userId, symbol) {
  const { error } = await requireSupabase().from("stock_watchlists").delete().eq("user_id", userId).eq("symbol", symbol);
  if (error) throw error;
}
