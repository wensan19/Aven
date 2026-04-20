export const FINANCE_TYPES = {
  allowance: "Allowance",
  income: "Income",
  spending: "Spending",
  savings: "Savings",
  stocks: "Stocks",
  banking: "Banking",
};

export function normalizeFinanceType(type, fallback = "spending") {
  const key = String(type || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    allowance: "allowance",
    earned: "income",
    earning: "income",
    income: "income",
    spent: "spending",
    spend: "spending",
    spending: "spending",
    saved: "savings",
    saving: "savings",
    savings: "savings",
    stock: "stocks",
    stocks: "stocks",
    investment: "stocks",
    investments: "stocks",
    investing: "stocks",
    bank: "banking",
    banking: "banking",
    bankaccount: "banking",
    checking: "banking",
    debit: "banking",
  };
  return aliases[key] || fallback;
}

export const CHART_COLORS = ["#78aee4", "#b8c9ff", "#8fd8c2", "#f5a9bd", "#f2d48d", "#a7d7f7"];

export function money(value, currency = "USD") {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function monthKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

export function monthStart(key = monthKey()) {
  return `${key}-01`;
}

export function nextMonthStart(key = monthKey()) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function pct(value, target) {
  if (!target) return 0;
  return Math.round((Number(value || 0) / Number(target)) * 100);
}

export function byType(rows, type) {
  const normalizedType = normalizeFinanceType(type);
  return rows.filter((row) => normalizeFinanceType(row.type) === normalizedType).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

export function groupByCategory(transactions, categories, type) {
  const normalizedType = normalizeFinanceType(type);
  return categories
    .filter((category) => normalizeFinanceType(category.type) === normalizedType)
    .map((category) => ({
      name: category.name,
      value: transactions
        .filter((entry) => entry.category_id === category.id && normalizeFinanceType(entry.type) === normalizedType)
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    }))
    .filter((item) => item.value > 0);
}
