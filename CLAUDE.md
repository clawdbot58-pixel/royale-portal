# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

A zero-dependency, client-side SPA for Clash Royale statistics. Open `index.html` in a browser — no build step. Uses the official Clash Royale Developer API (requires a free API token in `config.js`).

## Script Load Order (defined in index.html)

```
player-config.js   → DEFAULT_PLAYER_TAG (public, committed)
config.js          → CLASH_ROYALE_API_TOKEN + API_BASE (gitignored, NEVER read)
app.js             → All logic depends on globals from above
```

## Architecture

### Files

| File | Tracked? | Purpose |
|---|---|---|
| `index.html` | ✅ | Full page with 4-tab layout: Dashboard, Current Deck, Card Collection, Suggested Decks |
| `style.css` | ✅ | Dark theme, tab bar, stat grids, deck cards, card collection grid, responsive |
| `app.js` | ✅ | All logic — API calls, state, rendering, event handlers |
| `player-config.js` | ✅ | Default player tag (public, your tag, committed) |
| `config.example.js` | ✅ | Template for API key file |
| `config.js` | ❌ | Private API token — **never read** |
| `CLAUDE.md` | ✅ | This file |

### App State (all in `app.js` globals)

```
allCardsDb {}       → Card database from API (name → {id, name, elixirCost, rarity, iconUrls, maxLevel})
playerCardsMap {}   → User's cards (name → {level, maxLevel, ...})
currentPlayerData   → Raw API response (used briefly to render, then discard)
currentFavCard      → Name of favourite card
currentPlayerTag    → Current tag being viewed
```

### Data Flow

```
Page load / tag submit
  │
  ├─ fetchCards()         → GET /cards (cached in allCardsDb once)
  │
  ├─ fetchPlayer(tag)     → GET /players/{tag}
  │     │
  │     ├─ renderDashboard(data)     → Profile, stats grid, season, Path of Legend
  │     ├─ renderDeckTab(data)       → 8 deck cards + support cards + elixir avg
  │     ├─ renderCardCollection(data) → All 122 cards with levels + filter/sort
  │     └─ renderSuggestedDecks()    → Scores 14 archetypes vs your cards
  │
  └─ switch to Dashboard tab
```

### Tab System (pure JS, no router)

```js
tabBtns.forEach(btn => btn.addEventListener("click", () => {
  // toggle .active on tab-btn and matching tab-panel
}));
```

Tabs: `dashboard`, `deck`, `cards`, `suggestions` — each maps to `#tab-{name}`.

### Key Functions in app.js

| Function | Lines | What it does |
|---|---|---|
| `apiFetch(path)` | ~65 | Generic GET with Bearer auth, error handling |
| `fetchCards()` | ~75 | Loads card DB from API into `allCardsDb` (runs once) |
| `fetchPlayer(tag)` | ~82 | Loads player data from API |
| `loadPlayer(tag)` | ~87 | Orchestrator: fetch → build maps → render all tabs → switch to dashboard |
| `renderDashboard(data)` | ~100 | Profile header, 12 stat cards, season/POL boxes |
| `renderDeckTab(data)` | ~180 | Deck grid with level/elixir badges, elixir average, rarity breakdown |
| `renderDeckCards(cards, container, showMeta)` | ~200 | Renders card grid items (reused for current deck, support, suggestions) |
| `renderCardCollection(data)` | ~225 | Full card grid with rarity filter & sort dropdowns |
| `renderFilteredCards(cards)` | ~230 | Filters by rarity, sorts by name/level/upgrade priority, renders progress bars |
| `calcUpgradePriority(card)` | ~275 | Lower score = higher priority (closer to max = higher priority) |
| `renderSuggestedDecks(data)` | ~285 | Scores 14 meta archetypes, shows top 6 with owned/missing/upgrade status |
| `sanitizeTag(tag)` | ~55 | Strips non-alnum, uppercases, prepends `#` |

### Deck Card Rendering

Each card in a deck grid shows:
- ⚡ Elixir cost badge (top-left)
- Level badge (top-right, colored by rarity)
- Card image (from `iconUrls.medium`, with fallback)
- Card name
- Level progress (e.g. `13/14`)

### Card Collection

122 cards displayed in a responsive grid. Each card:
- Left border colored by rarity
- Image, name, level (green if upgradable, gold if maxed)
- Elixir cost, rarity label
- Progress bar (filled % of max level)

Filters: all / common / rare / epic / legendary / champion
Sorts: name / level ↑ / level ↓ / upgrade priority

### Upgrade Priority Algorithm

```js
function calcUpgradePriority(card) {
  // Maxed cards = lowest priority (999)
  // Cards closest to max but not yet maxed = highest priority
  return (maxLv - lv) * 10;
}
```

### Suggested Decks

14 hardcoded meta archetypes scored against the player's card collection:
- +20 points if a card matches the favourite card
- +3 per owned card
- +15 if the archetype's key card is owned
- Top 6 displayed, each with owned/missing count, avg level, upgrade suggestions

## API

- **Base**: `https://api.clashroyale.com/v1`
- **Endpoints used**:
  - `GET /cards` — full card list (fetched once, cached in `allCardsDb`)
  - `GET /players/{tag}` — player profile, stats, cards, current deck, season data
- **Auth**: `Authorization: Bearer <token>`
- **Rate limit**: Developer tier (check developer.clashroyale.com)

The `/players/{tag}` response includes: `currentDeck[]`, `cards[]` (all owned cards with levels), `leagueStatistics`, `currentPathOfLegendSeasonResult`, `arena`, `badges`, `achievements`, etc. Card objects contain `name`, `id`, `level`, `maxLevel`, `elixirCost`, `rarity`, `iconUrls.medium`.

## Rarity Max Levels

| Rarity | Max Level |
|---|---|
| common | 16 |
| rare | 14 |
| epic | 11 |
| legendary | 9 |
| champion | 6 |

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
open index.html
```

Zero dependencies. Needs a valid API token in `config.js` (copy from `config.example.js`).

## Common Tasks

- **Add a new stat to Dashboard**: add `<div class="stat-card">` to `#stats-grid` in `index.html`, cache the element ID in `app.js`, add a line in `renderDashboard()`
- **Add a new archetype**: append an object to the `ARCHETYPES` array in `app.js` with `name`, `cards[8]`, and `key` card
- **Add a new tab**: add `<button class="tab-btn" data-tab="newtab">` to `#tab-bar`, add `<div class="tab-panel" id="tab-newtab">`, add handler in the tab loop
- **Change card icon source**: the API returns real CDN URLs in `iconUrls.medium` — don't override with hardcoded URLs
- **Push**: `git push origin main` (HTTPS with token auth works if SSH isn't configured)
- **Do not append `Co-Authored-By: Claude` to commit messages** — Claude-generated commits should credit the human user, not Claude.
