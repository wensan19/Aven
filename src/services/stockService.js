import { requireSupabase } from "./supabaseClient";

export async function fetchStockQuote(symbol) {
  const response = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load stock quote.");
  return body.quote;
}

export async function fetchStockHistory(symbol, range = "1m") {
  const response = await fetch(`/api/stocks/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load stock history.");
  return body.history;
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
