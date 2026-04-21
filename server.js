const http = require("http");
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const { getQuote, getHistory, searchSymbols } = require("./services/twelveDataProvider");

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
      const trimmed = line.replace(/^\uFEFF/, "").trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) return;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = parseEnvValue(trimmed.slice(equalsIndex + 1));
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
}

function parseEnvValue(rawValue) {
  let value = String(rawValue || "").trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  return value;
}

function assertStockApiKey() {
  if (!process.env.STOCK_API_KEY) {
    console.error("Missing STOCK_API_KEY. Add STOCK_API_KEY=your_twelve_data_api_key_here to .env and restart the backend server.");
    return;
  }
  console.log("STOCK_API_KEY loaded: yes");
}

function isValidSymbol(symbol) {
  return /^[A-Z0-9.:-]{1,15}$/.test(symbol);
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidInterval(interval) {
  return /^(1min|5min|15min|30min|45min|1h|2h|4h|1day|1week|1month)$/.test(interval);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function logRequest(request, url) {
  console.log("Request hit:", {
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  });
}

function sendError(response, error) {
  const status = error.statusCode || 500;
  console.error("Stock API backend error:", {
    status,
    message: error.message,
    details: error.details || null,
    stack: error.stack?.split("\n").slice(0, 3).join("\n"),
  });
  sendJson(response, status, {
    error: status === 500 ? "Stock search failed on the server." : error.message,
    details: error.details || error.message,
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
      const interval = url.searchParams.get("interval");
      const outputsize = url.searchParams.get("outputsize");
      if (!isValidSymbol(symbol)) return sendJson(response, 400, { error: "Enter a valid stock symbol." });
      if (!["1d", "1w", "1m", "6m", "1y"].includes(range)) return sendJson(response, 400, { error: "Unsupported chart range." });
      if (interval && !isValidInterval(interval)) return sendJson(response, 400, { error: "Unsupported chart interval." });
      const size = outputsize ? Number(outputsize) : null;
      if (outputsize && (!Number.isInteger(size) || size < 1 || size > 5000)) return sendJson(response, 400, { error: "Output size must be between 1 and 5000." });
      return sendJson(response, 200, { history: await getHistory(symbol, interval || outputsize ? { interval: interval || "1day", outputsize: size || 30 } : range) });
    }

    if (request.method === "GET" && url.pathname === "/api/stocks/search") {
      const query = String(url.searchParams.get("query") || "").trim();
      if (query.length < 2) return sendJson(response, 400, { error: "Enter at least 2 characters to search stocks." });
      console.log(`Stock search route hit: "${query}"`);
      try {
        console.log("Stock search provider request sent");
        const providerResults = await searchSymbols(query);
        const results = Array.isArray(providerResults) ? providerResults : [];
        console.log("Stock search route response shape:", {
          isArray: Array.isArray(providerResults),
          count: results.length,
          sample: results[0] || null,
        });
        return sendJson(response, 200, { results });
      } catch (error) {
        console.error("Stock search route failed:", {
          query,
          message: error.message,
          details: error.details || null,
          stack: error.stack?.split("\n").slice(0, 4).join("\n"),
        });
        return sendJson(response, 200, {
          results: [],
          error: "Stock search failed",
          details: error.message,
        });
      }
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
  logRequest(request, url);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url).catch((error) => {
      console.error("Unhandled API request failure:", {
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 4).join("\n"),
      });
      if (!response.headersSent) sendError(response, error);
      else response.end();
    });
    return;
  }
  serveStatic(request, response, url).catch((error) => {
    console.error("Unhandled static request failure:", {
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 4).join("\n"),
    });
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Server error");
      return;
    }
    response.end();
  });
});

server.on("listening", () => {
  console.log("Server listening event fired");
});

server.on("close", () => {
  console.log("Server close event fired");
});

server.on("error", (error) => {
  console.error("Server error event:", {
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 4).join("\n"),
  });
});

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", {
    message: error.message,
    stack: error.stack?.split("\n").slice(0, 6).join("\n"),
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

process.on("exit", (code) => {
  console.log(`Process exiting with code ${code}`);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down server");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down server");
  server.close(() => process.exit(0));
});

console.log("Server startup beginning");

server.listen(PORT, "0.0.0.0", () => {
  console.log("Listen callback hit");
  console.log(`Aven is running at http://127.0.0.1:${PORT}`);
  assertStockApiKey();
});
