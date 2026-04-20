const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { getQuote, getHistory } = require("./services/twelveDataProvider");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DIST_ROOT = path.join(ROOT, "dist");
const WATCHLIST_FILE = path.join(ROOT, "data", "watchlist.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  let file = "";
  try {
    file = require("fs").readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  file
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) return;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9.:-]{1,15}$/.test(symbol);
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = error.statusCode || 500;
  sendJson(response, status, {
    error: status === 500 ? "Something went wrong while fetching stock data." : error.message,
  });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readWatchlist() {
  try {
    const raw = await fs.readFile(WATCHLIST_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.symbols) ? parsed.symbols : [];
  } catch {
    return [];
  }
}

async function writeWatchlist(symbols) {
  await fs.mkdir(path.dirname(WATCHLIST_FILE), { recursive: true });
  await fs.writeFile(WATCHLIST_FILE, JSON.stringify({ symbols }, null, 2));
}

async function handleApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/stocks/quote") {
      const symbol = normalizeSymbol(url.searchParams.get("symbol"));
      if (!isValidSymbol(symbol)) return sendJson(response, 400, { error: "Enter a valid stock symbol." });
      return sendJson(response, 200, { quote: await getQuote(symbol) });
    }

    if (request.method === "GET" && url.pathname === "/api/stocks/history") {
      const symbol = normalizeSymbol(url.searchParams.get("symbol"));
      const range = url.searchParams.get("range") || "1m";
      if (!isValidSymbol(symbol)) return sendJson(response, 400, { error: "Enter a valid stock symbol." });
      if (!["1d", "1w", "1m", "6m", "1y"].includes(range)) return sendJson(response, 400, { error: "Unsupported chart range." });
      return sendJson(response, 200, { history: await getHistory(symbol, range) });
    }

    if (request.method === "GET" && url.pathname === "/api/stocks/watchlist") {
      return sendJson(response, 200, { symbols: await readWatchlist() });
    }

    if (request.method === "POST" && url.pathname === "/api/stocks/watchlist") {
      const body = await readBody(request);
      const symbol = normalizeSymbol(body.symbol);
      if (!isValidSymbol(symbol)) return sendJson(response, 400, { error: "Enter a valid stock symbol." });
      const symbols = await readWatchlist();
      const next = Array.from(new Set([...symbols, symbol])).sort();
      await writeWatchlist(next);
      return sendJson(response, 201, { symbols: next });
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/stocks/watchlist/")) {
      const symbol = normalizeSymbol(decodeURIComponent(url.pathname.split("/").pop()));
      if (!isValidSymbol(symbol)) return sendJson(response, 400, { error: "Enter a valid stock symbol." });
      const next = (await readWatchlist()).filter((item) => item !== symbol);
      await writeWatchlist(next);
      return sendJson(response, 200, { symbols: next });
    }

    return sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    return sendError(response, error);
  }
}

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const baseRoot = await exists(DIST_ROOT) ? DIST_ROOT : ROOT;
  const filePath = path.normalize(path.join(baseRoot, requestedPath));
  if (!filePath.startsWith(baseRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }
  serveStatic(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Aven is running at http://localhost:${PORT}`);
});
