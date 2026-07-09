# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🔐 CRITICAL: Never read config.js

`config.js` contains a **private Clash Royale API token**. It is gitignored and must never be read or included in your context — doing so would expose the key to the inference cloud.

- **Never** read `config.js` unless the user explicitly asks you to diagnose it
- **Never** include `config.js` in tool calls (grep, glob, find, etc.)
- Use `config.example.js` instead for any structural reference (it has the same shape with a placeholder value)
- If `config.js` leaks into context, notify the user immediately so they can rotate the key

## Project Overview

A zero-dependency, client-side SPA that looks up Clash Royale players by tag and displays stats, decks, and battle history. No build step — open `index.html` in a browser to run.

## Architecture

**Script load order matters** (defined in `index.html`):
1. `config.js` — API token (gitignored, never read)
2. `app.js` — all logic depends on globals from `config.js`

### Data flow

```
User types tag → sanitizeTag() → fetchPlayer()
  → GET https://api.clashroyale.com/v1/players/{tag}
  → Authorization: Bearer ${CLASH_ROYALE_API_TOKEN}
  → renderProfile() | renderStats() | renderDeck() | renderBattles()
```

### Key modules (all in `app.js`)

| Section | Lines | What it does |
|---|---|---|
| DOM refs | 9–38 | Caches all `getElementById` lookups |
| Helpers | 40–67 | `showLoading/Error/Results()` toggle, `sanitizeTag()` strips non-alnum |
| API | 69–94 | `fetchPlayer()` — one function, hits the official CR API |
| Renderers | 96–218 | `renderProfile/Stats/Deck/Battles()` — each takes parsed API data and populates DOM |
| Deck suggestions | 220–263 | `generateSuggestedDeck()` — matches favourite card against 15 hardcoded archetypes, falls back to Hog Rider cycle |
| Main flow | 265–302 | Form submit listener orchestrates the pipeline |

### Deck suggestion logic

Uses a simple keyword match: scores each archetype by whether any of its 8 cards contains the player's `currentFavouriteCard` name. First match wins; falls back to Hog Rider cycle deck. No ML or external service.

## API

- **Base**: `https://api.clashroyale.com/v1`
- **Endpoint used**: `GET /players/{tag}` (tag encoded, with `#`)
- **Auth**: `Authorization: Bearer <token>` — token loaded from `config.js`
- **Rate limit**: Developer tier (check developer.clashroyale.com dashboard)

The API response shape includes `currentDeck[]`, `currentFavouriteCard`, `leagueStatistics.currentSeason`, `battles[]`, etc. Card objects have `name`, `id`, `iconUrls.medium`.

## Styling

Dark theme via CSS custom properties (`:root` vars in `style.css`). Key tokens:
- `--accent: #f0c43f` (gold — primary CTA)
- `--accent2: #5b7fff` (blue — links)
- `--accent3: #e04a5a` (red — errors/losses)
- `--success: #3dd68c` (green — wins)
- `--surface / --surface2 / --border` for card layering

## Running the App

```bash
# No build step — just open in browser
open index.html
```

- Zero dependencies, no npm, no build tools
- Requires a valid Clash Royale API token in `config.js`
- The API token's IP whitelist must include your current IP

## Common Tasks

- **Add a new stat**: add element ID to `index.html`, cache DOM ref in `app.js`, populate in `renderStats()`
- **Add a new archetype**: append to the `archetypes` array in `generateSuggestedDeck()`
- **Change card icon source**: update the URL template in `renderDeck()` (line ~162) and the fallback in `generateSuggestedDeck()` (line ~284)
- **Update page layout**: edit `index.html` sections and corresponding CSS in `style.css`
- **Push**: `git push origin main` (HTTPS with token auth recommended if SSH isn't configured locally)
