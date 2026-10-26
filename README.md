# LF BOOK_BOTS terminal

Browser-local LF paper market-making workspace: depth profile, open orders/log, aggregated book, manual paper order entry and bot controls. No exchange account is connected and no real orders are placed. Runs only while the page is open; use one tab. State is stored under `lf.mm.v2` in localStorage. Page reload and settings save always stop the bot.

## Run and deploy

Node.js 22+; no dependencies required. Run `npm start` and open http://localhost:3000. Render build command: `npm install`; start command: `npm start`; health check: `/api/health`. PORT is read from the environment. `render.yaml` supports creating a new service. Connected existing services deploy main only if auto-deploy is enabled.

## Live DEX reference

Preconfigured Ethereum Uniswap LF/WETH pool:
https://dexscreener.com/ethereum/0xb37361ebebfe7e0f0d98300f0a8ae777daa1cc12

LF base contract: `0x957c7fa189a408e78543113412f6ae1a9b4022c4`.

The DEX Screener API supplies `priceUsd` for LF/WETH. The interface labels the USD reference and the assumption 1 USDT = $1. Direct LF/USDT pools use `priceNative`. The supplied pool validates the LF base contract. DEX data is provider-indexed, not a direct executable chain quote. Displayed timestamp is fetch time. API: https://docs.dexscreener.com/api/reference

Manual reference has been removed; saved legacy manual-mode settings are ignored. The current fresh price remains available during pending refreshes, fixing a race where a bot cycle could stop during each DEX refresh. Failed requests clear the reference and stop execution. Stale/missing quotes cannot generate orders. Freshness is limited to max(60 seconds, twice the refresh interval). Changing the pool clears the old reference.

## Order rules

- **Buy depth:** sum buy USDT notionals from lowest sell × 0.98 up to (but excluding) the lowest sell.
- **Sell depth:** sum sell USDT notionals above the highest buy through highest buy × 1.02.
- **Buy generation:** prices must be at least lowest sell × 0.98 and at most the DEX price, while respecting the empty-tick gap below the lowest sell.
- **Sell generation:** prices must be at least the DEX price and at most highest buy × 1.02, while respecting the empty-tick gap above the highest buy.
- DEX is the buy ceiling and sell floor. There is no independent DEX ±2% intersection; the opposite first order defines the 2% depth band.
- If no opposite order exists, configured/automatic opposite starts seed the first cycle. Measured depth needs actual orders on both sides. Automatic starts straddle DEX and leave the configured empty tick gap.
- One empty tick requires best sell − best buy ≥ 2 × tick. Starting prices of 0 are automatic. Explicit buy starts above DEX or sell starts below DEX are rejected with an actionable message.
- Existing manual and bot orders count toward targets. Each eligible price receives at most one bot order. Prices with existing total value ≥ the skip threshold (default $5) are skipped; smaller manual levels may receive one bot addition.
- Orders obey minimum/maximum USDT value. A feasible count is chosen before sizing, allowing exact targets whenever eligible levels and min/max constraints permit. A remainder smaller than minimum stays unfilled.
- Each side examines at most 2,000 price levels per cycle. The capacity summary explains shortages and disjoint DEX/depth bands. Check depth targets and Fit tick to targets are at the top of Settings. The latter proposes a smaller tick and automatic starts; Save and ON are required to apply.
- ON runs a cycle immediately and then at the configured interval (minimum 10 seconds). Each active cycle first removes bot-owned orders outside the current DEX side limits or opposite-order 2% bands, then fills missing depth. Manual orders are not automatically cancelled. OFF, settings save, and bulk cancellation stop generation. OFF does not cancel existing orders.
- No automatic fills, balances, external order-book liquidity, or volume bot are simulated. To place exchange orders, a separate secure authenticated server-side exchange integration and durable worker are required.

## Example

DEX = 0.0000200, lowest sell = 0.0000201, highest buy = 0.0000199:

- Buy depth band begins at 0.000019698; new buys cannot exceed DEX 0.0000200 or violate the gap to the first sell.
- Sell depth band ends at 0.000020298; new sells cannot fall below DEX 0.0000200 or violate the gap to the first buy.

The min/max values and tick size still limit reachable depth. The bot reports capacity rather than exceeding the boundaries.

## Checks

`npm test` covers depth anchors, exact targets, empty-side counting, DEX limits, non-overlapping bands, stale reference protection, repricing cleanup, gap, order sizes, duplicate prevention, $5 skip, tick fitting, token/quote validation and HTTP routes. `node --check public/app.js` checks browser script syntax.

## Separate outer-boundary depth orders

Depth shortfalls now use a separate **Depth** order at the outer 2% boundary, after accounting for existing orders and any new small ladder orders. Buy wall = lowest sell × 0.98, rounded up to the tick. Sell wall = highest buy × 1.02, rounded down to the tick. This keeps walls inside the 2% band. Buys remain ≤ DEX, sells ≥ DEX, and the empty-tick gap is enforced.

The small-order minimum, maximum, occupied-price skip and available ladder capacity do **not** cap the separate depth wall. Thus current buy depth $12.47 with a $500 target can receive a $487.53 Depth top-up at the boundary. A wall can share a level with a manual or small ladder order. Repeated cycles do not duplicate a completed wall; increased targets update the existing wall at the same boundary. Invalid or shifted bot-owned walls are removed and regenerated on active cycles. Cancel Bot includes both Bot and Depth sources; Cancel Manual preserves them. This supersedes the earlier small-order-only capacity limitation for depth targets.

The UI now previews missing depth and boundary prices instead of claiming that lack of eligible ladder slots prevents placing depth. Fit small-order tick is optional for the ladder; it is not needed to increase wall size. All execution remains browser-local paper trading.
