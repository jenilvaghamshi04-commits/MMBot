# LF BOOK_BOTS terminal

LF/USDT paper market-making workspace with a dark four-column layout: actual local depth profile, open orders/log, aggregated order book, and manual buy/sell ticket. Settings are in the top bar.

## Run / Render

Node.js 22+; no dependencies or API keys required.

```sh
npm start
```

Open http://localhost:3000. Render: build command `npm install`; start command `npm start`; health check `/api/health`. PORT is read from the environment. Pushes to main deploy only if your Render service is connected to this repository with auto-deploy enabled. A render.yaml blueprint is included for a new service; existing services retain their dashboard configuration.

## Execution scope

**All orders are paper records in this browser. No exchange API/account is connected.** Runs only while this tab is open. No balances, real fills, or volume bot are simulated. Never enter API secrets in the source. Refresh always starts OFF. Same-origin tabs are not a shared execution engine; use one tab for paper operation. State is saved under `lf.mm.v2` in localStorage; the previous demo workspace is intentionally not imported. A fresh workspace has no orders and no fabricated book levels. Existing v2 orders persist across reloads.

## Settings and algorithm

- Reference: manual USDT price or a verified LF-base DEX pool. The supplied Ethereum Uniswap LF/WETH pool `0xb37361ebebfe7e0f0d98300f0a8ae777daa1cc12` is preconfigured and selected by default. Previously unconfigured workspaces migrate to this feed; existing custom pool settings are retained. For LF/WETH, the app uses DEX Screener `priceUsd` and clearly labels the USD reference and the assumption 1 USDT = $1. Direct LF/USDT pools use `priceNative`. The supplied pool also validates the LF base contract `0x957c7fa189a408e78543113412f6ae1a9b4022c4`. API: https://docs.dexscreener.com/api/reference
- Fill range: reference −2% to reference +2%, intersected with the depth ranges below.
- Sell depth: total USDT of sells above the highest buy and at or below highest buy × 1.02.
- Buy depth: total USDT of buys below the lowest sell and at or above lowest sell × 0.98.
- Manual and bot orders both count toward each depth target. An absent opposite side uses the configured/planned opposite starting price to seed generation; measured depth shows zero until an actual opposite order exists.
- Tick size defines the price ladder. Buy start walks down; sell start walks up. Zero starts select automatic values around the reference.
- Gap is the number of **empty tick levels** between the nearest buy and sell. One empty level requires best sell − best buy ≥ 2 × tick. A sell at 0.0000220 with a buy at 0.0000219 has zero empty levels when tick = 0.0000001; for one empty level use buy ≤ 0.0000218.
- Each generated order uses a random value between minimum and maximum USDT; a final order can be reduced to the remaining target only if it remains at least the minimum. A remainder below minimum stays unfilled.
- A price is skipped if existing total value there is at least the configured threshold (default $5), if a bot order already exists there, or if it would overlap/cross the other side. Manual orders below the threshold can receive one bot addition.
- The bot does not cancel/reprice existing orders automatically. It adds eligible missing levels up to the targets. No duplicate bot orders per price. If too few eligible levels exist, it reports the shortfall in Bot Log rather than putting orders outside the range or exceeding size limits.
- Each side is limited to 2,000 examined levels per cycle. Reference changes never cause an order outside current bounds to be automatically removed.
- ON runs a cycle immediately, then every configured interval (minimum 10 seconds). OFF stops new bot orders and retains existing orders. Save settings stops the bot. Bulk cancellation stops it too, so cancelled orders are not immediately replaced.
- A missing, failing, or stale DEX reference stops the bot in DEX mode. Price data is provider-indexed, not a direct executable chain quote. Timestamp is fetch time.

### Price example

At reference **0.0000200**, the 2% range is **0.0000196–0.0000204**. Prices 0.0000219 and 0.0000220 are outside this band and will be rejected as starting prices. To use those levels, select a suitable reference; all configured starts must still satisfy the gap and tick rules.

## Validation

`npm test` covers opposite-side depth anchors, 2% bounds, gap, size constraints, duplicate prevention, $5 skip, completed targets, sub-minimum remainders, non-crossing behavior, and HTTP routes. `node --check public/app.js` checks browser script syntax.

For live trading, the next step requires an identified exchange, authenticated server-side execution, secure environment-managed API keys, current public/private order-book reconciliation, balance/precision/minimum checks, stale-price handling, and a durable single-worker lifecycle. The browser paper toggle does not place real exchange orders.

## DEX pool and palette update

Configured pool: https://dexscreener.com/ethereum/0xb37361ebebfe7e0f0d98300f0a8ae777daa1cc12. Click the cyan DEX badge to inspect it. The terminal palette follows the supplied BOOK_BOTS screenshot: black background, charcoal panel headers, bright green bids, red asks and cyan DEX highlights. No bot is started by this update. Tests include LF/WETH USD conversion, direct USDT quoting, missing prices, and pinned-token verification.

## Depth target correction

The planner now selects a feasible order count before sizing orders. When enough eligible levels exist and the target can be represented by the min/max order values, it reaches the exact remaining target rather than leaving a random small remainder. Existing same-side orders count even before the opposite side is seeded. The panel shows target progress and available capacity. Settings → Check depth targets reports eligible levels and maximum reachable total; Fit tick to targets proposes a finer tick and automatic starting prices, which apply only after Save and ON. A coarse tick cannot fit arbitrary dollar depth under a strict per-order maximum and one bot order per price. The helper preserves those limits instead of silently increasing order values. Regression tests cover exact targets and the fit helper.
