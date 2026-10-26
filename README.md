# LF Market Maker Terminal

First-phase LF/USDT market-making workspace. Includes a responsive exchange-style simulated order book, paper limit orders with individual/bulk cancellation, saved bot configuration, and an optional real DEX reference feed.

## Run

Requires Node.js 22 or newer. No dependencies or API keys required.

```sh
npm start
```

Open http://localhost:3000. To deploy on Render, create a Node web service from this repository, use `npm install` as the build command and `npm start` as the start command. The server uses Render's PORT environment variable. `/api/health` is available for health checks.

## Configure

Select the intended exchange and save the demo reference price, size, spread, levels, and interval. Enter a blockchain ID (such as `ethereum` or `bsc`) and the **pool address**, not the token contract. Save, then refresh the DEX feed. The pool must have LF as base token and USDT as quote token; the app uses `priceNative` as the direct USDT quote rather than substituting a USD price. Confirm the actual token contracts yourself: symbols alone cannot establish token identity. No LF pool has been preselected.

DEX data comes from the documented DEX Screener pairs endpoint: https://docs.dexscreener.com/api/reference. Data is provider-indexed, not a direct on-chain execution quote. Polling has a minimum interval of 10 seconds and only runs while the page is open. Errors clear the displayed price. The displayed timestamp is fetch time, not blockchain update time.

## Current scope

- The order book and reference price are explicitly demo data.
- Manual orders are local paper records. They do not fill automatically or reach an exchange.
- Configuration and orders are stored in localStorage for this browser and origin. They are not shared between users/devices.
- Bot configuration is saved for the next implementation phase; it does not start automated trading or generate orders. No strategy is assumed.
- No exchange account, balances, credentials, authentication, or live order execution is connected. Do not enter API credentials in the source or public configuration.

## Next phase

Provide the exchange, verified LF DEX pool, and desired quoting/repricing/cancellation rules. Add authenticated server-side account access and order execution, secure environment-managed API keys, exchange precision/minimum checks, inventory limits, stale-price handling, and a kill switch before live use.

## Checks

```sh
npm test
node --check server.mjs
node --check public/app.js
```
