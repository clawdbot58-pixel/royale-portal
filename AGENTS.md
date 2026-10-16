# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## 🔐 Context Hygiene — CRITICAL

**Do not keep API response data in your context.** This project queries the live Clash Royale API and returns large payloads (player data, 122+ cards with icons, levels, etc.). If you fetched data in a previous conversation turn and it's still in context, do the following before switching tasks:

1. **Summarize and discard** — note the structure/pattern you learned, then drop the raw response data from your mental context
2. **Don't pass large JSON dumps between turns** — reference the code files instead
3. **When working on structure changes, do NOT re-fetch player data** — the code structure is in the files, not in API responses
4. **If you accidentally read config.js or capture a full API response**, treat it as ephemeral — the next context window should not contain it

This keeps context clean so the next AI working on this repo doesn't inherit stale or irrelevant data.

## 🔐 Security: Never read config.js

`config.js` contains a **private Clash Royale API token**. It is gitignored and must never be read or included in your context — doing so would expose the key to the inference cloud.

- **Never** read `config.js` unless the user explicitly asks you to diagnose it
- **Never** include `config.js` in tool calls (grep, glob, find, etc.)
- Use `config.example.js` instead for any structural reference (it has the same shape with a placeholder value)
- If `config.js` leaks into context, notify the user immediately so they can rotate the key

## Project Overview

A zero-dependency, client-side SPA for Clash Royale statistics. Open `index.html` in a browser — no build step. Uses the official Clash Royale Developer API (requires a free API token in `config.js`). Also includes a CLI (`cli.js`) for terminal upgrade snapshots.

## Script Load Order (defined in index.html)

```
player-config.js   → DEFAULT_PLAYER_TAG (public, committed)
config.js          → CLASH_ROYALE_API_TOKEN + API_BASE (gitignored, NEVER read)
card-data.js       → CARDS_* arrays, GOLD_PER_LEVEL, MAX_LEVELS, START_LEVELS, DECK_SIZE, SLOT_RULES, HEROES, TOWER_TROOPS
card-roles.js      → CARD_ROLES — every card + tower troop mapped to role/tags/air/splash/cycle
meta-decks.js       → META_DECKS — validated archetypes with slot assignments
deck-engine.js      → Pure deck logic (no DOM, no fetch): cardFlags, assignSlots, deckViolations, scoreArchetype, rankArchetypes, deckUpgradePlan
deck-analysis.js    → Pure deck quality logic: DECK_CHECKS, analyzeDeck, deckArchetype, autofillDeck, swapSuggestions, upgradeValueList
app.js              → All UI logic depends on globals from above
```

## Architecture

### Files

| File | Tracked? | Purpose |
|---|---|---|
| `index.html` | ✅ | Full page with card collection grid, rarity filter, search, sort |
| `style.css` | ✅ | Dark theme, card grid, progress bars, responsive |
| `app.js` | ✅ | All logic — API calls, state, rendering, event handlers |
| `card-data.js` | ✅ | Upgrade tables (cards & gold per level), max levels, start levels |
| `card-roles.js` | ✅ | Role/tag classification for every card (used by the suggestion engine) |
| `meta-decks.js` | ✅ | Archetype dataset with slot assignments + a self-check that runs under node |
| `deck-engine.js` | ✅ | Deck legality + scoring — pure functions over the globals above |
| `deck-analysis.js` | ✅ | Coverage checks, deck score/grade, autofill, swap ideas, upgrade value |
| `deck-rules.md` | ✅ | Verified deck-building rules (slots, ceilings, unlocks) with sources |
| `cli.js` | ✅ | CLI upgrade snapshot tool (`node cli.js`) |
| `serve.py` | ✅ | Local dev server + API proxy + image CDN cache |
| `player-config.js` | ✅ | Default player tag (public, your tag, committed) |
| `config.example.js` | ✅ | Template for API key file |
| `config.js` | ❌ | Private API token — **never read** |
| `AGENTS.md` | ✅ | This file |

### App State (all in `app.js` globals)

```
allCardsDb {}        → Card DB from API (name → {id, name, elixirCost, rarity, iconUrls, maxLevel, maxEvolutionLevel, hasEvo, hasHero, type})
mergedCards []       → Every card in the DB merged with the player's state (level, count, owned, evolutionLevel, maxEvolutionLevel, type)
currentPlayerData    → Raw API response (kept for the deck builder reset button)
currentDeck []       → [{name, slot}] — the deck being edited, seeded from the API's currentDeck
currentTower         → Equipped tower troop name (from currentDeckSupportCards)
currentFavCard       → Name of favourite card (from currentFavouriteCard)
currentPlayerTag     → Current tag being viewed
selectedRarities Set → Rarity filter (empty = show all); "tower" filters by type
statusFilter         → Collection filter: all / owned / undiscovered / evo-capable / evo-unlocked / hero-capable
suggMode             → Suggestion mode filter: all / ladder / clanwars / challenge
activeTab            → collection / deck / suggestions / rules
```

### Data Flow

```
Page load / tag submit
  │
  ├─ fetchCards()      → GET /cards (cached in allCardsDb once)
  │
  ├─ fetchPlayer(tag)  → GET /players/{tag}
  │     │
  │     ├─ buildMergedCards(data)  → mergedCards (levels converted, evolution fields carried)
  │     ├─ renderCards()           → Collection grid: badges, filters, sort
  │     ├─ renderDeckBuilder()     → 8 slots + tower troop + live rule check + pick list
  │     └─ renderSuggestions()     → rankArchetypes() over META_DECKS scored against your levels
  │
  └─ showContent() — stays on the Collection tab
```

### Tab System (pure JS, no router)

```js
tabBar.addEventListener("click", e => switchTab(e.target.closest(".tab-btn").dataset.tab));
// switchTab toggles .active on the matching .tab-btn and #tab-{name}
```

Tabs: `collection`, `deck`, `suggestions`, `battles`, `rules` — each maps to `#tab-{name}`.

### Key Functions in app.js

| Function | File | What it does |
|---|---|---|
| `apiFetch(path)` | app.js | GET through serve.py's `/api` proxy, error handling |
| `fetchCards()` | app.js | Loads card DB + supportItems into `allCardsDb` (runs once) |
| `fetchPlayer(tag)` | app.js | Loads player data |
| `buildMergedCards(data)` | app.js | Merges owned cards + support cards into `mergedCards` (API→game level conversion) |
| `cardsForNext(card)` / `goldForNext(card)` | app.js | Incremental cost for the next level (arrays are target-level indexed) |
| `cardsToMax(card)` / `goldToMax(card)` | app.js | Sum of cards/gold to reach max — used by the upgrade plan |
| `loadPlayer(tag)` | app.js | Orchestrator: fetch → merge → render collection, deck builder, suggestions |
| `renderCards()` | app.js | Collection grid: rarity + status filters, search, sort, badges |
| `renderDeckBuilder()` | app.js | Slot grid, tower select, rule check, pick list |
| `renderSuggestions()` | app.js | Ranked archetypes with owned/missing chips and upgrade plan |
| `loadBattlelog(tag)` | app.js | GET `/players/{tag}/battlelog`, cached by tag; sets `battlelogError` on failure |
| `renderBattles()` | app.js | Battles tab: W-L/win rate/form metrics, decks you played, per-card WR, matchups faced, recent list |
| `cardFlags(merged)` | deck-engine.js | champion / evo-capable / evo-unlocked / hero-capable / role / level for one card |
| `assignSlots(cards)` | deck-engine.js | Greedy slot assignment (evolution → hero → wild; champions queue for the hero slot) + overflow |
| `deckStrategy(cards)` | deck-analysis.js | One-paragraph game plan synthesized from composition (siege/beatdown/bait/cycle/control/spell-cycle) |
| `deckViolations(cards, tower)` | deck-engine.js | Deck size, duplicates, ceilings, unowned cards, tower troop |
| `scoreArchetype(arch, index, fav)` | deck-engine.js | Score one archetype against the player |
| `rankArchetypes(index, fav)` | deck-engine.js | Score + sort every archetype |
| `deckUpgradePlan(result, index, cardsToMax, goldToMax)` | deck-engine.js | What to upgrade to make a deck work |
| `analyzeDeck(cards, tower)` | deck-analysis.js | Metrics + 10 weighted coverage checks → score, grade S–E |
| `autofillDeck(pool)` | deck-analysis.js | Greedy legal 8-card build from the owned cards |
| `swapSuggestions(cards, pool)` | deck-analysis.js | Owned card + deck victim for each failed coverage check, each carrying `trade`/`closes`/`broken` |
| `deckArchetype(cards)` | deck-analysis.js | Composition-only family classification → `{family, label, why, build[3..5]}` — reads defensively in the UI |
| `upgradeValueList(index, limit)` | deck-analysis.js | Which upgrade counts toward the most best-fit decks |
| `sanitizeTag(tag)` | app.js | Strips non-alnum, uppercases, prepends `#` |

### Deck Card Rendering

Deck builder rows show: card image, name with ⚡ (evolution active) / ★ (hero-capable) marks, level + elixir, a slot selector (champion / evolution / hero / wild / normal), and a remove button. The summary line reports deck size, average elixir, 4-card cycle cost, the deck grade + score, the equipped tower troop, and which cards occupy which special slots. `slotViolations()` adds the two rules the count ceilings can't express: only one card per special slot, and only special cards may occupy special slots. Slots are seeded automatically: `autoAssignCurrentDeck()` runs `assignSlots()` on the API deck, the reset button, and any deck loaded without explicit slots (archetypes/`autofillDeck()` already arrive assigned), so special cards activate by default; `slotFits()` / `pickSlotFor()` re-seat a card when a swap or a pick no longer fits its slot, and the summary line lists the slots actually chosen (not a re-derived assignment).

### Deck analysis panel (`deck-analysis.js`)

Below the rule check, the deck tab renders the coverage analysis: five metrics (avg elixir, 4-card cycle, grade + score, attack/defence split, full 8-card cycle), then one tile per `DECK_CHECKS` entry (id, label, need, weight, ok, detail). **The score is the sum of the weights of the passing checks** — `DECK_CHECKS` weights sum to 100, so `analyzeDeck()` returns that sum directly; grades are S ≥90, A ≥80, B ≥70, C ≥60, D ≥45, else E. Checks measure composition only — legality stays in `deckViolations()` / `slotViolations()`.

**Checks are family-conditional, not an idealised all-rounder.** `deckFamilyOf()` classifies the deck (spell-cycle / siege / bait / beatdown / control / bridge-spam / cycle / misc), and `FAMILY_SOFT_CHECKS` exempts heavy families from the cheap-deck hygiene checks (avg, cycle, swarm, building — plus `big` for bridge-spam and a troop `win` for spell-cycle). 50%+ of the proven beatdown/siege/spam lists in `META_DECKS` fail those checks and still post 53%+ meta win rates, so holding a Golem deck to a cycle deck's elixir budget graded it as mediocre for being what it is. Soft checks still render (dashed tile, `.da-check.soft`) with the measured value plus a "not required for <family>" note, and count as passing. **Answer coverage — win, anti-air, spells, tank killer, splash — stays hard for every family**; those are holes, not style. The **Ideas tab** shows the same grade on each archetype card (`sugg-grade` chip) via `qualityChip()`, so what a suggestion promises and what the builder shows can never disagree.

**Swap evaluation pins the family.** `swapSuggestions()` computes `deckFamilyOf()` once and passes it into `swapBreaks()` / `redundancy()` via `deckChecks(cards, softFamily)`. Without the pin, removing a deck's only win condition reclassifies the 7-card remainder as spell-cycle (where `win` is soft) and the analyzer forgives the loss — a swap that destroys the deck's win path would read as "keeps everything". Never evaluate a hypothetical variant under its own post-change family.

**Goblin Barrel is a hybrid** — `role: "win-condition"` and `tags: [..., "spell"]` — so `deckCoverage()` counts it in both `cov.win` and the small-spell list (`role === "spell" || hasTag(r, "spell")`). Before this, the four Goblin Barrel bait archetypes in `META_DECKS` all falsely failed the small-spell check.

When checks fail the panel lists **swap ideas**: `swapSuggestions()` finds the owned card that would close the gap and the least load-bearing deck card to drop (`redundancy()` counts the checks a card helps satisfy that would still pass without it). Clicking a swap applies it in place. **A gap is never silent** — candidates gate on `contributesTo()`, so every failing check with a covering card in the pool gets a suggestion, and each one carries an additive `trade` string (`"keeps everything"` or `"costs splash damage, anti-air"`, built from `DECK_CHECKS` labels) plus `closes`/`broken`. The list is capped at **2 victims per check / 6 total**, free swaps ranked first, one suggestion per gap before any repeats; the deck tab shows a `+ N more` line for the rest, and `swapTradeBadge()` renders the trade as a green `free swap` or orange `costs …` pill (shrinks + ellipsizes on narrow widths — worst case trade is 150+ chars). A swap must **close the gap or move its counter** — `swapBreaks()` returns `progress` (anti-air needs two answers, so the first is progress) and `swapSuggestions()` skips a swap that does neither, so swapping the only air answer for another is never offered. `swapFixVerb()` renders the verb as **"fixes"** only when `closes` is true, otherwise **"helps with"** — never claim more than `swapSuggestions()` proved.

The deck identity block headlines with `deckArchetype()` — the archetype of the deck **you are building**, classified from its own composition (no `META_DECKS` lookup): `spell-cycle / siege / bait / beatdown / control / bridge-spam / cycle / misc`, each with an evidence line and 3–5 build steps naming only in-deck cards. The UI reads it through `deckArchetypeSafe()` (guards `typeof` + try/catch — falls back to the plan/verdict block if absent); the `META_DECKS` "closest archetype" line is demoted below it.

**Mirror is a wildcard spell, never a spell answer.** The API returns no `elixirCost` for it, so `elixirOf()` special-cases it to `MIRROR_ELIXIR = 1.5` (the game's own fixed value for deck averages); it is excluded from both the small- and big-spell coverage checks, still counts in `spells`, and `autofillDeck()`'s spell repair ranks it last.

**Auto-fill** runs `autofillDeck()` — greedy over `deckProgress()` (each check's weight × how far the deck is toward passing it, so a "needs 2 anti-air" gap is worth building toward before it closes), then level progress / evolution / special rarity, with average elixir and special-slot capacity (verified by bipartite matching in `fitsSpecialSlots()`) as hard constraints. `deckProgress()` only steers the filler — the displayed score stays the binary sum of passing weights.

The URL hash always encodes the view: `#tag=TAG&deck=Name|slot,Name&tower=Tower` (slot omitted when `normal`). `writeHash()` runs at the end of `renderDeckBuilder()`; `readHash()` is consumed once at boot through `pendingShared` so a shared deck is never re-applied when the user switches tags. **Copy link** writes that URL to the clipboard.

### Card Collection

All 123 cards + 4 tower troops in a responsive grid. Each card:
- Left border colored by rarity (gold for evolution-capable, blue for hero-capable)
- Image, name, level (green if upgradable, gold if maxed)
- Progress bar (filled % toward the next level)
- Badges: `Evo n/m` (filled when unlocked, outlined when not), `Hero +n⚡` (ability cost), role label
- Undiscovered cards render dimmed and are excluded from deck legality

Filters: rarity multi-select (all / common / rare / epic / legendary / champion / tower) and status (all / owned / undiscovered / evolution-capable / evolutions unlocked / hero-capable)
Sorts: upgrade priority / level ↓ / rarity + level

### Upgrade Priority Algorithm

```js
// Inline in renderCards(): unowned last, then can-upgrade-now, then needs-cards,
// then maxed; within a group, by % toward the next level, then rarity, then name.
```

### Suggested Decks

78 archetypes in `meta-decks.js` (the original 26 plus 52 seeded from deckai.app's popular decks, each carrying `metaWr` / `metaGames` / `metaRating`), scored against your collection: +3 per owned card, +2 per average level, +6 per unlocked evolution, +4 per hero-capable card, +3 per champion, +15 for the key card, +20 for the favourite, tier bonus S/A/B, +12 for a win condition, +6 for a spell, +6 for 2+ air answers, +4 for cycle ≤ 3.5 avg elixir, −5 per missing card, −12 per rule violation. Top 10 shown with owned/missing chips, avg level, tower troop, a **Use** button that loads the archetype into the deck builder (`applyDeck()`), and the upgrade plan to close the gap. Above the list, **Invest efficiently** renders `upgradeValueList()` — owned, unmaxed cards that appear in `META_DECKS`, weighted by tier (S=3 A=2 B=1) × role weight, sorted by impact and normalised to a percentage bar; clicking a row jumps to that card in the collection. Decks with published stats show a `meta 56.2% · 36 games` chip in `.sugg-stats`, and the list ends with the `.sugg-src` footnote naming deckai.app as the source (7-day sample, ranked + Path of Legend playlists) — everything else in the score is computed from the player's collection.

### Deck statistics panel (`#deck-stats`, rendered by `renderDeckStats()` in app.js)

Below the rules check and above the coverage checks. Six metric cells (average elixir, 4-card cycle, full 8-card cycle, cheapest win condition, average spell, special slots active), the **cheapest 4-card cycle** with card icons, an **elixir ladder** histogram, **rotation timing**, a **hero abilities** row, and a **deck identity** block.

Rotation timing converts costs into seconds, because elixir regenerates 1 per **2.8 s** at 1x, **1.4 s** at 2x and **1.0 s** at 3x — so a 10⚡ 4-card rotation is 28.0 s / 14.0 s / 10.0 s and an 8-card full rotation of 34⚡ is 95.2 s / 47.6 s / 34.0 s. Bands: 4-card rotation ≤ 9⚡ cycle, 10–13 midrange, ≥ 14 beatdown. **Hero ability cost is deliberately excluded from average elixir and cycle** — abilities are one-time (4 Aug 2026) and sit off the 10-elixir rotation clock, so they get their own row; champion abilities are the opposite (off-cycle but repeatable), so their cost is not modelled.

Every suggestion carries an `.sugg-active` line naming the special forms that would actually fire for you (locked evos name their 6-shard price, heroes are flagged unlock-unknown since the API never reports hero state); `scoreArchetype()` passes `evo`/`hero`/`champion` through for it. Locked collection evos read `Evo 0/3 · 6 shards`.

Clicking a free special slot in the deck identity block filters the pick list to owned cards that can legally fill it; `#pick-filter` takes free text (name or role) or a slot name (`champion` / `evolution` / `hero` / `wild`). Deck cards show a `.ds-elixir` bar and badges for the special form they are actually playing in — `plain card` (dashed, italic) means the card is special-capable but occupies a normal slot, so nothing activates.

### Battles tab (own win rates)

`#tab-battles` renders the official `GET /players/{tag}/battlelog` (the only win-rate source the Developer API offers — it publishes no meta stats; typically the last ~30 battles). `loadBattlelog()` is awaited at the end of `loadPlayer()` and cached by tag; on a 403/404/error it shows an empty state instead of breaking the page. Sections: five metric cells (games, win rate, record, form streak, avg crowns), **Decks you played** grouped by card set with grade via `analyzeDeck` + a **Use** button, **Card win rate** (2+ games), **Matchups you faced** (opponent deck signatures matched against `META_DECKS`, else "Off-meta deck"), and **Recent battles** (click a row to load that deck). Result = `team[0].crowns` vs `opponent[0].crowns` (the API returns no `result` field).

### Deck Rules (verified — full version in `deck-rules.md`)

Deck = 8 cards + 1 tower troop. Three special slots since the Mid-March 2026 rework (was 4): 1 evolution (evos only), 1 hero (heroes AND champions — no dedicated champion slot), 1 wild (anything). Ceilings: 2 evolutions, 2 heroes, 2 champions, 3 specials total; a special card in a normal slot behaves as the plain card. Slot unlocks: evolution Arena 3 (600), hero Arena 5 (moved from Arena 15 on 23 Feb 2026), wild Arena 10 (3000). Evolution unlock = 6 shards (levels 1–3); hero unlock = 200 shards; hero abilities are single-use since 4 Aug 2026. Furnace is a troop since Aug 2025 (support role, not a building). Mortar is a siege win-condition like X-Bow. Decks with no tower-taking card must carry the `spell-cycle` tag (hero chip + heavy spells plan). The **Rules** tab renders the same content for users. `SLOT_RULES`, `DECK_SIZE`, `HEROES`, `TOWER_TROOPS` in `card-data.js` are the machine-readable version and `deck-rules.md` is the sourced reference — update them together.

## API

- **Base**: `https://api.clashroyale.com/v1`
- **Endpoints used**:
  - `GET /cards` — full card list (fetched once, cached in `allCardsDb`)
  - `GET /players/{tag}` — player profile, stats, cards, current deck, season data
- **Auth**: `Authorization: Bearer <token>`
- **Rate limit**: Developer tier (check developer.clashroyale.com)

The `/players/{tag}` response includes: `currentDeck[]`, `cards[]` (owned cards), `supportCards[]` (tower troop levels), `currentDeckSupportCards[]` (the equipped tower troop), `currentFavouriteCard`, `leagueStatistics`, `currentPathOfLegendSeasonResult`, `arena`, `badges`, `achievements`. Card objects carry `name`, `id`, `level`, `maxLevel`, `elixirCost`, `rarity`, `count`, `starLevel`, `evolutionLevel`, `maxEvolutionLevel`, `iconUrls.medium` (plus `iconUrls.evolutionMedium` on evolution cards). `/cards` returns `items[]` + `supportItems[]`; `type`/`race` are NOT returned, so roles come from `card-roles.js`. The API exposes no hero cards — hero availability is modelled in `card-data.js` and hero unlock state is unreadable, so the UI shows hero-capable base cards only.

## Card Upgrade System

### Array Convention — CRITICAL

`card-data.js` defines `CARDS_COMMON`, `CARDS_RARE`, `CARDS_EPIC`, `CARDS_LEGENDARY`, `CARDS_CHAMPION` — incremental cards needed per upgrade step. The convention is:

**`arr[N]` = cards needed to reach level N from N-1** (target-level indexed)

```
// Example: CARDS_EPIC
arr[6]  = 1    // 5→6  (unlock at lv 6)
arr[7]  = 2    // 6→7
arr[8]  = 4    // 7→8
...
arr[16] = 180  // 15→16 (max)
```

`cardsForNext(card)` does `arr[card.level + 1]`. A card at game level 15 looks up `arr[16]`.

The arrays match the official upgrade table:

| Game level | Common | Rare | Epic | Legendary | Champion |
|---|---|---|---|---|---|
| 1→2 | 1 | — | — | — | — |
| 2→3 | 2 | — | — | — | — |
| 3→4 | 4 | 1 | — | — | — |
| 4→5 | 10 | 2 | — | — | — |
| 5→6 | 20 | 4 | — | — | — |
| 6→7 | 50 | 10 | 1 | — | — |
| 7→8 | 100 | 20 | 2 | — | — |
| 8→9 | 200 | 50 | 4 | — | — |
| 9→10 | 400 | 100 | 10 | 1 | — |
| 10→11 | 800 | 200 | 20 | 2 | — |
| 11→12 | 1,000 | 300 | 30 | 4 | 1 |
| 12→13 | 1,500 | 400 | 50 | 6 | 2 |
| 13→14 | 2,500 | 550 | 70 | 9 | 5 |
| 14→15 | 3,500 | 750 | 100 | 12 | 8 |
| 15→16 | 5,500 | 1,000 | 130 | 14 | 11 |
| 16→17 | 7,500 | 1,400 | 180 | 20 | 15 |

**To add a new level (e.g., 17):** add `arr[17]` to each rarity array, update `MAX_LEVELS` to 17. Everything else reads dynamically.

### Level Conversion (API → Game)

```js
gameLv = apiLv + startLv - 1   // where startLv = START_LEVELS[rarity]
```

The Clash Royale API returns levels relative to each rarity's start level. `START_LEVELS` maps to the game-level start:
- Common: 1, Rare: 3, Epic: 6, Legendary: 9, Champion: 11

### Game Max Levels

| Rarity | Start Lv | API Max | Game Max |
|---|---|---|---|
| common | 1 | 14 | 16 |
| rare | 3 | 14 | 16 |
| epic | 6 | 11 | 16 |
| legendary | 9 | 8 | 16 |
| champion | 11 | 6 | 16 |

All rarities cap at **game level 16** (`MAX_LEVELS` in `card-data.js`). The API `maxLevel` field is API-relative; the game max is derived from `MAX_LEVELS[rarity]`.

### Gold Costs

`GOLD_PER_LEVEL[N]` = gold to reach level N. Same for all rarities. Final step (15→16) costs 120,000 gold.

## Tower Troops

Tower troops (Tower Princess, Cannoneer, Dagger Duchess, Royal Chef) come from:
- `/cards` → `supportItems[]` — tagged `type: "tower"` in `allCardsDb`
- `/players/{tag}` → `supportCards[]` — levels and card counts

They use the **exact same** system as regular cards:
- Same rarity-based level conversion (`apiLv + startLv - 1`)
- Same `CARDS_*` upgrade arrays for card counts
- Same progress bars and upgrade detection

New tower troops added by Supercell will work automatically — they flow through `supportItems` → `allCardsDb` → `supportCards` → `mergedCards` with the correct rarity arrays.

## Styling

Dark theme via CSS custom properties in `:root`. Key tokens:
- `--accent: #f0c43f` (gold — primary CTA, headings)
- `--accent2: #5b7fff` (blue — links, focus)
- `--accent3: #e04a5a` (red — errors, losses)
- `--success: #3dd68c` (green — wins, upgradeable)
- `--warning: #f0a43f` (orange)
- `--rarity-*` — one color per card rarity tier
- `--surface / --surface2 / --border` for card layering

## Running

```bash
python3 serve.py          # PORT/HOST env override; default 8090, binds all interfaces
```

Then open `http://localhost:8090/`. Opening `index.html` directly does NOT work — the API proxy lives in `serve.py`, so `file://` requests fail by design. Zero dependencies; needs a valid API token in `config.js` (copy from `config.example.js`).

## Common Tasks

- **Add a card role/tag**: edit `CARD_ROLES` in `card-roles.js` — the suggestion engine reads `role`, `tags`, `air`, `splash`, `targeting`, `cycle`
- **Fix an `air`/`splash` flag**: `air` must be true when the card is a genuine air *answer*, which includes spawners whose troops attack air (Goblin Hut → Spear Goblins, Furnace → Fire Spirits both count; Suspicious Bush spawns ground-only Bush Goblins and must stay `air: false`). A wrong `air: true` silently inflates deck grades via the anti-air coverage check and the +6 air-answers score — verify against the card's in-game "Targets" stat before flipping, in both directions. — it drives the anti-air coverage check and the +6 air-answers score, so a wrong `air: true` silently inflates deck grades. Verify against the card's in-game "Targets" stat before flipping.
- **Change a coverage check**: edit `DECK_CHECKS` in `deck-analysis.js` — the weights must keep summing to 100 (the score is the sum of passing weights) and the Rules tab's score table is generated from the same array.
- **Add an archetype**: append to `META_DECKS` in `meta-decks.js`; the self-check at the bottom of that file runs under `node meta-decks.js` and throws on slot illegality
- **Add a hero**: append to `HEROES` in `card-data.js` AND the table in `deck-rules.md` — the API can't confirm hero releases, so both are hand-maintained
- **Add a tab**: add `<button class="tab-btn" data-tab="newtab">` to `#tab-bar`, add `<div class="tab-panel" id="tab-newtab">`, add a `renderNewTab()` called from `loadPlayer()`
- **Change card icon source**: the API returns real CDN URLs in `iconUrls.medium` — don't override with hardcoded URLs
- **Push**: `git push origin main` (HTTPS with token auth works if SSH isn't configured)
- **Do not append AI co-author trailers to commit messages** — commits credit the human user, not the agent.
