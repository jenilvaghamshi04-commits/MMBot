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

## Paper matching and same-price order fix

Manual crossing orders now **simulate fills** instead of remaining open on the opposite side at the same price. A buy limit consumes resting sells priced at or below its limit (lowest price first); a sell consumes resting buys priced at or above its limit (highest price first). Equal prices follow creation time. Fills execute at resting maker prices. Fully filled records leave Open Orders, partial fills reduce the resting quantity, and only the unfilled incoming remainder stays open. Edits replace the prior manual record before matching so an order cannot match itself.

Trade History stores local simulated fill price, quantity, USDT value, time, incoming side and resting source (Manual, Bot or Depth). It persists with browser state. There are no actual exchange trades, balances or fees. This supersedes the earlier statement that manual crossing entries merely rest without matching. Manual price entry still has no bot DEX, gap or tick restriction.

On the first load of this version, a one-time chronological replay settles legacy crossed paper records, preserving unmatched quantities and recording the resulting simulated fills. This clears the previous equal-price buy/sell display. The migration is versioned to avoid repeated replay. Bot orders continue to follow DEX and depth rules; an active bot can refill missing liquidity on its next cycle after a paper fill.

Regression tests cover the reported same-price case, partial fills, price/time priority, input immutability, residual quantities and migration. Browser QA confirmed a manual sell consumed an existing bid, left no same-price ask, and appeared in Trade History.

## Refill normal levels near DEX

The normal-ladder budget now counts manual and normal liquidity separately from Depth walls. Previously a fully funded Depth wall could prevent missing normal levels near DEX from being restored. Missing eligible normal levels now fill first, and the wall allocation shrinks to keep the total depth target. Obsolete Depth walls are removed if manual/normal liquidity fully funds the target. This still respects per-order limits, skip rules, both tick settings, DEX limits and the central gap; a level prohibited by those rules is not filled.

Automatic starting prices now choose the nearest legal buy tick at or below DEX and a sell tick that preserves the configured empty gap. A manual paper fill while the bot is ON triggers an immediate refill cycle, rather than waiting for the next timer. Unchanged DEX quotes still run periodic refill cycles; changed DEX quotes cancel/rebuild as before. OFF disables refills. DEX price movement alone does not invent a trade: this feature places resting paper orders, while manual crossing orders generate simulated fills in Trade History.

Regression tests cover normal-level refill when total depth already meets target, nearest legal starting ticks, and removal of obsolete Depth walls without affecting manual records.

## Corrected adjacent-tick quoting

The spread setting now measures the **price difference in normal ticks**, rather than the number of empty levels. Spread 1 means adjacent buy/sell prices. Automatic sell start = DEX rounded up to a normal tick; automatic buy start = sell start minus spread × normal tick. Thus normal tick 0.0000001 and spread 1 give:

| DEX | Best automatic buy | Best automatic sell |
| --- | --- | --- |
| 0.0000220 | 0.0000219 | 0.0000220 |
| 0.0000221 | 0.0000220 | 0.0000221 |

This supersedes the earlier empty-tick gap formula. The same spread rule is used by normal and depth price guards. A fully consumed best normal order is eligible for immediate refill at its DEX-anchored price while ON. DEX changes cancel the prior bot/depth quotes and rebuild them using the new anchors. Quantities continue to use configured order values; depth totals and random divisions remain in force.

On first load of this layout version, prior bot start overrides reset to automatic and spread resets to 1, matching the requested behavior. Existing normal/depth tick settings and manual records are retained. Bot quote reference is invalidated so the next ON cycle replaces the legacy layout; the bot does not start automatically. Existing opposite manual liquidity still participates in crossing/depth guards. Regression tests explicitly cover both table rows and consumption/refill of either best side.

## Normal order size randomization correction

Normal ladder orders now use the configured Minimum small order and Maximum small order range without forcing every available level to the maximum. When there are too few ticks to fund the entire target with small orders, values are drawn independently inside the range and the remaining budget goes to the separate Depth split. When an exact normal allocation is feasible, a balanced order count avoids unnecessarily forcing every order to maximum size while retaining min/max feasibility.

A versioned migration invalidates the prior quote reference once so existing fixed-size bot quotes are rebuilt on the next ON cycle, without starting the bot or changing manual orders. Tests cover coarse and fine normal ticks, varied values inside the configured range, and maintenance of the full target including Depth orders. If minimum equals maximum, fixed sizing is expected.

# Gate live terminal: /live

The demo remains at `/` with its original browser-local settings, orders, matching and fills. Top **Demo / Live** buttons switch pages. The new `/live` page uses Gate's real LF_USDT public order book, ticker and market trades through server-side APIv4 requests. Demo fills never enter the live page. Gate live settings use a separate browser-storage key. Live account orders and balances come from Gate, not browser records.

## Render activation

Deploy the latest main commit using the same `npm start` command. Add these variables in Render Environment:

| Variable | Value |
| --- | --- |
| `LIVE_ADMIN_TOKEN` | A private random operator token of at least 16 characters; choose a unique strong value. |
| `LIVE_TRADING_ENABLED` | `false` for public feeds/account preview only; explicitly set `true` when ready to submit real orders. |
| `GATE_BOT_TAG` | `lfmm` by default; stable ownership tag, 1–10 letters/numbers/underscore/hyphen. |

Use HTTPS for the deployed terminal. Open `/live`, click **Connect API**, enter the operator token plus your Gate API Key and Secret Key. Use Gate spot read/write permissions, no withdrawals, and restrict the API IP allowlist to your server's egress IPs. The server validates the connection with a read-only account request. Keys/secrets are never put in the repository, browser storage, URLs or logs; they are held in server memory only. The operator token stays in page memory. Use **Resume operator session** with just the token after navigation/reload to reconnect the controls to an already connected server account.

Settings → Save → Preview algorithm → review planned orders → **Start LIVE bot**. The live bot never starts merely from switching pages, connecting credentials, deploying or restarting. Public market data requires no API key. Account/preview/start/stop/manual endpoints require the operator token. Real writes also require `LIVE_TRADING_ENABLED=true`.

## Live execution behavior

- Reuses the same `engine.js` for DEX-anchored quotes, one-tick spread, normal/depth ticks, randomized min/max normal values, random depth divisions and 2% opposite-side bands.
- Public LF/WETH DEX USD reference is fetched server-side for every live cycle, using the configured LF pool and the labeled 1 USDT = $1 assumption. No stale/browser-supplied execution price is trusted.
- Public-book liquidity is included in depth and occupied-price checks. Bot-owned open quantity is subtracted from aggregate market levels before private bot orders are included, to avoid counting that quantity twice. The visible book is a 100-level snapshot, not a full historical stream.
- Reads actual Gate open orders and remaining quantity each cycle. Fills reduce/remove exchange orders and the next cycle refills eligible levels. No paper fills or fake exchange trades are generated.
- Changed DEX references cancel and rebuild tagged bot orders. Same-reference cycles refill missing levels and update the random depth amounts where needed. Public Gate liquidity can prevent an exact DEX-level quote under post-only and crossing rules; the worker stops on an exchange rejection instead of forcing a taker order.
- Bot orders use post-only (`poc`) spot limits. No leverage, margin, borrowing, wallet transfers or withdrawals are used. Manual live limit orders use GTC and may execute immediately at a crossing price; the bot must be OFF for manual entry.
- Exchange pair metadata controls price/quantity precision, minimum/maximum order sizes and tradability. As observed during implementation, LF_USDT returned 8 price decimals, 0 LF quantity decimals and a $3 minimum quote notional. Metadata is loaded again rather than hardcoded. Tick sizes must be integer multiples of the exchange price tick. LF quantities round down; rejected or sub-minimum plans are reported rather than silently increased. Rounding means actual totals may be slightly below strategy targets.
- A maximum of 100 order writes per cycle is enforced. Available LF/USDT balances are checked after planned cancellations; a 0.3% quote reserve is used for buys. These checks do not eliminate exchange execution races; exchange responses remain authoritative.
- The ownership prefix is `t-<GATE_BOT_TAG>-`. Only that prefix is cancelled/repriced by the bot. Manual and other-tag exchange orders remain untouched. Use one running instance per account/tag. Do not run multiple live workers sharing a tag.
- **Stop bot · keep orders** stops generation while retaining existing exchange orders. **Stop & cancel bot orders** cancels only tagged bot orders. **Disconnect** stops, cancels tagged orders, and then removes the in-memory credentials. Errors can leave resting orders; inspect My Open Exchange Orders and use cancellation controls.

## Runtime and verification limits

The live worker runs in the Node server and can continue after switching to Demo or closing the browser. It requires an always-running server. Restart/redeploy loses credentials and worker settings and starts OFF; existing exchange orders can remain and must be reviewed. After reconnecting, matching-tag orders are recognized and rebuilt only when you explicitly start. No live credentials, private account calls or real orders were used during development. Tests use mocked exchange responses; signing matches Gate's published signature vector. Public LF_USDT metadata was verified against the Gate API. Live authenticated behavior must be checked with your account before unattended use.

Official references:
- https://www.gate.com/docs/developers/apiv4/en/
- https://www.gate.com/docs/developers/apiv4/en/spot/
- https://www.gate.com/trade/LF_USDT

## Compact live page and balances

The live page is now a focused single-column view based on the supplied manual-order panel: compact live controls, Real Manual Limit Order, **LF/USDT balance cards directly below the form**, then Bot Log. Market Trades is removed from the page and the Gate public market request no longer fetches trades. Public book snapshots are still read by the live strategy on the server; they are not displayed in this compact view.

Balance cards show available funds, locked amounts and their sum for both LF and USDT. They are read from the connected Gate spot account on the existing refresh cycle. Disconnected or failed account reads show placeholders, not fabricated balances. My Open Exchange Orders and Algorithm Preview remain accessible in dialogs, preserving account visibility and pre-start review without expanding the main page. Demo page layout/behavior is unchanged by this compact-live update.

## Live dashboard restored to demo-style layout

The live page now uses the demo terminal's four-column dashboard: reference/public depth profile and bot controls; open Gate account orders with Bot Log tab; live Gate order book; manual order ticket with LF/USDT balance cards beneath. Market Trades remains absent. Open orders are visible inline instead of in a dialog; the balance-area account-orders button jumps to that panel. Algorithm preview, settings and credential connection retain their dialogs. Book rows can populate the manual price field without submitting an order.

The public depth profile and displayed book use real Gate snapshots. Failed feed reads clear displayed market values and account errors clear unavailable private rows. Account controls, authorization, bot execution and demo behavior are unchanged. Browser QA verified the restored column layout and tab switching; the existing 62-test suite passes.

### Explicit live pool conversion
Demo and Gate live now share the same DEX feed: LF/WETH pool `priceNative` (WETH per LF) × ETH/USD from Ethereum WETH/USDC pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`, using DEX Screener. The LF pool's precomputed `priceUsd` is not used for this conversion. Reversed WETH/LF token order is inverted first. Token contracts are checked; missing or invalid ETH/USD stops reference updates instead of falling back. Both dashboards show the ratio and ETH/USD inputs. USD is still treated as approximately USDT for LF_USDT quoting. These are provider snapshots, not direct on-chain RPC prices.

### Price jump protection and performance
Bot settings offer a jump limit (%) and rolling window in seconds. The limit is disabled at 0 by default; set a positive threshold to enable it. Each fresh DEX observation is compared against recent observations in the window. A move above the limit stops the bot before the next order changes; existing orders remain open. Review and manually restart to reset the observation window. Protection can detect only sampled prices (at the configured refresh/cycle interval), not movements between samples. Demo history resets on page reload; the live worker keeps its recent observations in memory while running.

The Performance button shows the last hour, 24 hours, 7 days or 30 days. Live loads LF/USDT private account fills from Gate; the bot filter includes only fills whose Gate `text` has this instance's bot tag. Untagged fills cannot be reliably attributed. Gate's time filtering uses order completion time and may omit fills for open orders. Results are bounded to 20,000 records and fail clearly if more are available; totals use all returned fills while the table displays the newest 100. The displayed LF inventory and USDT cash changes include traded amounts and fees charged in those currencies, but exclude deposits, transfers, and other activity. Fee currencies and Gate GT/point discount fields are shown separately; they are not converted to USDT. This is not P&L. Demo uses simulated fills (all-fill view uses the incoming order's side; bot view uses the bot's side) with no simulated fees.

### Faster live order book
The live page subscribes directly in the browser to Gate's public `spot.order_book` WebSocket for 100-level LF/USDT snapshots at the requested 100 ms interval. Only public book data uses this connection; API credentials are never sent to it. The display reconnects automatically and uses slower REST snapshots as a labelled fallback. The indicator shows the source and age of the latest received snapshot. Gate delivery, network conditions, browser rendering and exchange activity affect actual timing. The bot's server-side trading cycle, account updates and DEX reference refresh remain separate.
