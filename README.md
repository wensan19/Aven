# Aven

Aven is a pastel-blue social money tracker with Supabase authentication, private finance tracking, public profiles, follow/unfollow, privacy-safe social summaries, targets, charts, and a secure stock watchlist proxy.

## Stack

- React + Vite frontend
- Supabase Auth, Postgres, Storage, and RLS
- Recharts for responsive charts
- Node HTTP server for secure stock API proxy
- Twelve Data for stock quotes and price history

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env` from `.env.example`.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
STOCK_API_KEY=your_twelve_data_api_key_here
PORT=3000
```

3. In Supabase SQL Editor, run:

```sql
-- paste supabase/schema.sql
```

If you already created the database before richer transaction logs were added, run the latest `supabase/schema.sql` again. It includes safe `alter table ... add column if not exists` statements for `transactions.title`, `transactions.image_url`, `transactions.source_type`, `transactions.counts_as_allowance`, `transactions.source_amount`, and `transactions.allowance_amount`, plus the `transaction-images` storage bucket policies.

4. Start the stock API backend.

```bash
npm run server
```

5. In another terminal, start the React app.

```bash
npm run dev
```

Open the Vite URL shown in the terminal. Stock quote, search, and history requests from the frontend are proxied to the Node backend, so the Twelve Data API key is never exposed in browser code.

## Production

Build the frontend and serve it through the Node server.

```bash
npm run build
npm start
```

The app will be available at `http://localhost:3000`.

## GitHub Pages

Aven is configured for GitHub Pages at `/Aven/`.

- `vite.config.js` uses `base: "/Aven/"`
- the production build output lives in `dist/`
- `.github/workflows/deploy-pages.yml` publishes `dist` to GitHub Pages

If GitHub Pages is still showing a blank page, make sure the repository Pages source is set to **GitHub Actions**, not the repository root.

## Security Notes

- Supabase RLS keeps profiles, transactions, categories, budgets, and stock watchlists scoped to the authenticated owner.
- Public users can only see public profiles and privacy-safe activity rows.
- Finance notes are stored privately and are never included in social feed summaries.
- Profile photos and category icons are uploaded into user-scoped Storage folders.
- Twelve Data calls happen only in `server.js` through `services/twelveDataProvider.js`.

## Key Files

- `src/App.jsx` - main React app and feature pages
- `src/services/supabaseClient.js` - Supabase client setup
- `src/services/dataService.js` - finance, profile, social, storage data access
- `src/services/stockService.js` - frontend stock API calls and watchlist persistence
- `server.js` - static server and secure stock API routes
- `services/twelveDataProvider.js` - stock provider adapter
- `supabase/schema.sql` - tables, storage buckets, RLS policies, and public summary view
