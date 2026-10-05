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
meta-decks.js      → META_DECKS — validated archetypes with slot assignments
deck-engine.js     → Pure deck logic (no DOM, no fetch): cardFlags, assignSlots, deckViolations, scoreArchetype, rankArchetypes, deckUpgradePlan
app.js             → All UI logic depends on globals from above
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

Tabs: `collection`, `deck`, `suggestions`, `rules` — each maps to `#tab-{name}`.

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
| `cardFlags(merged)` | deck-engine.js | champion / evo-capable / evo-unlocked / hero-capable / role / level for one card |
| `assignSlots(cards)` | deck-engine.js | Greedy slot assignment (champion → evolution → hero → wild) + overflow |
| `deckViolations(cards, tower)` | deck-engine.js | Deck size, duplicates, ceilings, unowned cards, tower troop |
| `scoreArchetype(arch, index, fav)` | deck-engine.js | Score one archetype against the player |
| `rankArchetypes(index, fav)` | deck-engine.js | Score + sort every archetype |
| `deckUpgradePlan(result, index, cardsToMax, goldToMax)` | deck-engine.js | What to upgrade to make a deck work |
| `sanitizeTag(tag)` | app.js | Strips non-alnum, uppercases, prepends `#` |

### Deck Card Rendering

Deck builder rows show: card image, name with ⚡ (evolution active) / ★ (hero-capable) marks, level + elixir, a slot selector (champion / evolution / hero / wild / normal), and a remove button. The summary line reports deck size, average elixir, the equipped tower troop, and which cards occupy which special slots. `slotViolations()` adds the two rules the count ceilings can't express: only one card per special slot, and only special cards may occupy special slots.

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

26 archetypes in `meta-decks.js`, scored against your collection: +3 per owned card, +2 per average level, +6 per unlocked evolution, +4 per hero-capable card, +3 per champion, +15 for the key card, +20 for the favourite, tier bonus S/A/B, +12 for a win condition, +6 for a spell, +6 for 2+ air answers, +4 for cycle ≤ 3.5 avg elixir, −5 per missing card, −12 per rule violation. Top 10 shown with owned/missing chips, avg level, tower troop, and the upgrade plan to close the gap.

### Deck Rules (verified — full version in `deck-rules.md`)

Deck = 8 cards + 1 tower troop. Four special slots: 1 champion, 1 evolution, 1 hero, 1 wild — the wild accepts a champion, a hero, **or** an evolution. Ceilings: 2 champions, 2 heroes, 2 evolutions, 4 special cards total; a special card in a normal slot behaves as the plain card. Slot unlocks: champion Arena 5, hero Arena 5 (moved from Arena 15 on 23 Feb 2026), evolution Arena 3 (600), wild Arena 10 (3000). Evolution unlock = 6 shards (levels 1–3); hero unlock = 200 shards; hero abilities are single-use since 4 Aug 2026. The **Rules** tab renders the same content for users. `SLOT_RULES`, `DECK_SIZE`, `HEROES`, `TOWER_TROOPS` in `card-data.js` are the machine-readable version and `deck-rules.md` is the sourced reference — update them together.

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
- **Add an archetype**: append to `META_DECKS` in `meta-decks.js`; the self-check at the bottom of that file runs under `node meta-decks.js` and throws on slot illegality
- **Add a hero**: append to `HEROES` in `card-data.js` AND the table in `deck-rules.md` — the API can't confirm hero releases, so both are hand-maintained
- **Add a tab**: add `<button class="tab-btn" data-tab="newtab">` to `#tab-bar`, add `<div class="tab-panel" id="tab-newtab">`, add a `renderNewTab()` called from `loadPlayer()`
- **Change card icon source**: the API returns real CDN URLs in `iconUrls.medium` — don't override with hardcoded URLs
- **Push**: `git push origin main` (HTTPS with token auth works if SSH isn't configured)
- **Do not append AI co-author trailers to commit messages** — commits credit the human user, not the agent.
