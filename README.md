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

## Depth divisions and manual order editing

Settings now include **Buy depth divisions** and **Sell depth divisions** (1–100; existing users default to 1). The remaining depth budget, after manual and small-order liquidity, is divided equally across the requested number of Depth orders. $500 missing depth with 5 divisions produces five $100 orders; $480 missing produces five $96 orders. Existing depth walls are resized equally when the target changes.

Prices start at the inward-rounded outer 2% boundary and move inward one configured tick per division: buys increase in price, sells decrease. Every price must remain inside the opposite-order 2% band, the DEX side limit and the configured empty gap. If there are not enough valid ticks for all divisions, no partial or out-of-range split is placed; Bot Log explains that fewer divisions or a smaller tick is required. Repeated cycles preserve the correct split without duplicates. Changing the division count removes the old bot-owned layout before rebuilding it on an active cycle. The preview lists division count and approximate per-order value.

The Manual Buy / Sell LF ticket accepts price and LF quantity or USDT amount. Manual entries appear as Manual in Open Orders and now have Edit and Cancel controls. Editing updates the existing record rather than creating a duplicate. Manual orders remain independent of the bot and are included in depth totals. Manual crossing prices are accepted; this paper workspace does not execute matches against your own orders or place live exchange trades. Browser QA verified manual buy placement, editing quantity, sell entry, and both new division controls. Automated checks cover equal division values, distinct ticks, repeated cycles, changed layouts and insufficient valid ticks.

## Independent normal and depth ticks

Settings now expose **Normal order tick size** (`tick`, existing saved value retained) and **Depth order tick size** (`depthTick`, default `0.00000001`). Normal tick controls the small-order ladder, automatic starting prices and the central empty-level gap. Depth tick independently controls inward boundary rounding and spacing between depth divisions. For example, normal tick `0.0000001` can coexist with depth tick `0.00000001` and five distinct depth divisions.

The normal tick-fitting helper changes only the normal tick. Depth tick changes cause affected Depth orders to be rebuilt on active cycles; manual records and valid normal ladder orders remain intact. Legacy engine callers without depthTick fall back to the normal tick. The interface displays both tick inputs in decimal notation. Independent spacing, cleanup and validation are covered by regression tests.


## Random depth sizing and unrestricted manual prices

Depth divisions now receive random positive weights (0.5–1.5), normalized to the required depth budget. When practical, amounts are allocated in cents with the exact remainder in the last order so the combined notional matches the required total. Very small budgets retain fractional amounts to avoid zero-size orders. Existing manual and small ladder depth is accounted for before the budget is split. This supersedes the previous equal-value division behavior.

Random weights are persisted with Depth records; routine refreshes do not reroll them. Target changes scale the allocation to the new required budget. Legacy equal-sized Depth orders receive random weights once on the next active cycle. Changing the depth layout produces a fresh allocation. Tick, DEX and 2% price rules for the bot remain in force.

Manual entry and editing accept any finite positive price and quantity, including a buy above the lowest sell or a sell below the highest buy. No bot DEX, gap, tick-alignment or crossing rule restricts manual records. Only basic numeric validation applies. These remain paper order records; entering a crossing price does not execute or simulate a trade against another order. Browser QA confirmed acceptance in both directions. Automated tests cover randomized totals, stable refreshes, legacy migration, changed targets, and positive amounts for small split budgets.

## Follow DEX: cancel and replace

While ON, every successful DEX refresh also runs an order cycle. If the reference changed, **all Bot and Depth records are cancelled and replaced** with a fresh plan at the updated DEX reference. Both increases and decreases are handled. New normal prices align to the normal tick; depth prices and divisions align to the depth tick and current opposite first order. Existing DEX side limits, gap, depth targets and random amount rules still apply. Replacements receive fresh IDs/timestamps and randomized depth sizing. Unchanged references retain existing order sizes and IDs. Manual records remain fixed and are never automatically cancelled or moved.

Explicit bot starting prices follow the DEX delta from their saved reference and round to the normal tick. The original settings and saved quote reference persist so the bot can reprice after the user turns it ON following a reload or price movement while OFF. Legacy bot records without a saved reference are rebuilt on the next active cycle. Saving settings stops execution and resets the quoting baseline. Invalid/missing/stale DEX data cannot create orders. Cancellation/replacement is planned before state is committed; an invalid plan leaves the input records unchanged and stops the bot.

The Bot Log reports old/new DEX prices, cancellation count and replacement count. This is polling-based, with the configured interval (minimum 10 seconds), and runs only while the tab is open and bot ON. No background exchange worker or real trading is connected.

A native SVG favicon (lime M and cyan upward arrow on black) is served at `/favicon.svg`; the page includes icon and theme-color metadata.
