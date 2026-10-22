# Marketboard — Stock Market Dashboard

A fast, professional, and responsive stock market dashboard covering **US**, **NSE (India)**, and **BSE (India)** markets. Built with clean zero-dependency Node.js and a single-file, highly-responsive web frontend featuring Chart.js candlesticks, real-time indicators, peer comparisons, and an investment compounding calculator.

---

## Features

- **Multi-Market Support**: Seamlessly switch between US, NSE (National Stock Exchange of India), and BSE (Bombay Stock Exchange). Market choices and light/dark theme preference are persisted in `localStorage`.
- **Top Index Strip**: Real-time tiles for Nifty 50 (`^NSEI`), Sensex (`^BSESN`), and S&P 500 (`^GSPC`) with 30-day sparklines, market session open/closed badges based on official market hours (`09:15–15:30 IST` and `09:30–16:00 ET`), plus a live market breadth ratio tile.
- **Main Interactive Chart**:
  - Pure Chart.js 4.4.1 Candlestick engine built with core floating bars (open, high, low, close) and volume bars on a secondary axis.
  - One-click toggle between Candlestick and Line modes.
  - Multi-timeframe controls: `5D`, `1M`, `3M`, `6M`, `1Y`, `5Y`.
  - Comprehensive Quote summary card (price, day range, 52-week range, volume, change).
- **Dashboard Analytics**:
  - **Top Gainers** and **Top Losers** with mini trend sparklines and instant chart drill-down.
  - **52-Week High Watchlist** displaying proximity to annual peaks.
  - **Technical Trends**: Real-time 20-Day SMA, 50-Day SMA, 14-Day RSI, and automated Bullish / Bearish / Neutral trend classification.
- **Comparison Engine**:
  - Normalized % return comparison chart and metrics table for 2–4 stocks.
  - Mutual funds performance comparison (US index funds and Indian funds).
  - *Note*: Indian mutual fund NAVs and prices are simulated example historical benchmarks for comparative illustration.
- **Investment Calculator**:
  - Compounding calculator supporting both Monthly SIP (Systematic Investment Plan) and Lump-sum investments.
  - Real wealth modeling: nominal future value, inflation-adjusted (real purchasing power) value, and net post-tax returns.
  - Interactive multi-layer growth chart across the chosen tenure.
- **Real-Time Engine & Graceful Fallback**:
  - Auto-refreshes data every 1 second without full DOM rebuilds. Flashes green/red when prices move by $\ge 0.03\%$.
  - Instant fallback to realistic simulated demo mode if the backend or upstream data provider is unreachable.

---

## Deliverables & Architecture

The project consists of 4 focused files:
1. `index.html` — Complete standalone frontend (HTML, Tailwind-inspired CSS design system with CSS variables, Chart.js 4.4.1, IBM Plex Sans / Mono typography, responsive layouts).
2. `server.js` — Zero-dependency Node.js 18+ server using built-in `http`, `url`, `fs`, `path`, and global `fetch`.
3. `package.json` — Configuration with `"name": "marketboard"`, `"start": "node server.js"`, and `"engines": { "node": ">=18" }`.
4. `README.md` — Complete documentation, local run instructions, and deployment guide.

---

## API Routes

The backend exposes the following REST endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Serves the single-file frontend `index.html`. |
| `/api/health` | `GET` | Server health check; returns `{"ok":true,"timestamp":17...}`. |
| `/api/history?symbol={SYM}&range={5d\|1m\|3m\|6m\|1y\|5y}` | `GET` | Fetches historical OHLCV chart bars. Validates symbols via regex. Cached for **5 minutes**. |
| `/api/quotes?symbols={SYM1,SYM2,...}` | `GET` | Fetches summary quotes, day range, 52W range, and sparklines. Rate-limited concurrency. Cached for **10 seconds**. |

> **Upstream Data Notice**: Data is retrieved from Yahoo Finance's public chart endpoints. Yahoo Finance data is unofficial, may be delayed by 15 minutes during market hours, and public cloud providers or shared container IPs may occasionally be rate-limited or blocked by Yahoo. When upstream calls are blocked or the backend is offline, Marketboard automatically activates its realistic local Demo Mode so the dashboard remains fully functional.

---

## Running Locally

### Prerequisites
- Node.js version 18 or higher (`node -v`).

### Steps
1. Clone or download the repository into a directory:
   ```bash
   cd marketboard
   ```
2. Start the server (zero external dependencies required):
   ```bash
   npm start
   # or: node server.js
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

To run with a custom port:
```bash
PORT=8080 node server.js
```

---

## Deploying on Render

To deploy Marketboard on [Render](https://render.com):

1. Push your repository to GitHub or GitLab.
2. In the Render Dashboard, click **New +** and select **Web Service**.
3. Connect your repository.
4. Configure the Web Service settings:
   - **Name**: `marketboard`
   - **Environment**: `Node`
   - **Build Command**: *(leave empty)*
   - **Start Command**: `node server.js`
   - **Plan**: Free (or higher)
5. Click **Create Web Service**. Render will bind to `process.env.PORT` on `0.0.0.0` and deploy your live dashboard.
