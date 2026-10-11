# 🏆 Royale Portal

**Clash Royale statistics & deck suggestion tool.**  
Enter your player tag and get detailed stats, your current deck, suggested meta decks, and recent battle history.

![Screenshot placeholder](https://cdn.royaleapi.com/static/img/brand/clash-royale-banner.png)

---

## Features

- **Player Lookup** — search any Clash Royale player by tag
- **Collection** — all 123 cards + 4 tower troops with level, progress, evolution/hero badges, rarity multi-select, status filters, search, upgrade-priority sort
- **Deck Builder** — 8 slots with champion / evolution / hero / wild rules, tower troop selection, live legality check, average elixir
- **Deck check** — 10 weighted coverage checks (win condition, anti-air, small/big spell, tank killer, splash, building, swarm, avg elixir, cycle) scored to 100 with an S–E grade, plus attack/defence balance, 4-card cycle cost and full-cycle cost
- **Swap ideas** — for every failed check, the owned card that fixes it and the deck card it should replace; tap to apply
- **Auto-fill** — builds a legal 8-card deck from your own collection, greedy over coverage gaps, levels, elixir and special-slot capacity
- **Shareable links** — the URL always encodes tag + deck + tower (`#tag=…&deck=…&tower=…`), so **Copy link** gives a deck someone else can open
- **Deck statistics** — average elixir, 4-card and full rotation costs, cheapest win condition, an elixir ladder, rotation time in seconds at 1x/2x/3x elixir (elixir regenerates 1 per 2.8 s), hero ability costs kept separate from the cycle, and an auto-detected deck archetype + tempo verdict
- **Deck Suggestions** — 78 meta archetypes scored against your actual levels, each with a **Use** button that loads it into the builder and the upgrade plan to close the gap; decks with published stats show their meta win rate (source: deckai.app popular decks)
- **Battles** — your own win rates from the official battle log: overall record + form, each deck you've played with its grade and record, per-card win rates, which archetypes you've faced, and a clickable recent-battles list
- **Invest efficiently** — the upgrades that count toward the most of your best-fit decks, with the cards/gold for the next level; click a row to jump to that card
- **Deck Rules** — the verified slot rules, ceilings, unlock thresholds and the scoring weights, in-app
- **CLI** — `node cli.js` prints an upgrade snapshot in the terminal

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/clawdbot58-pixel/royale-portal.git
cd royale-portal
```

### 2. Run the server

The app is client-side but the Clash Royale API needs CORS + auth, so requests go through `serve.py`:

```bash
python3 setup.py      # one-time: creates config.js from config.example.js
python3 serve.py      # default port 8090, configurable via PORT/HOST
```

Then open `http://localhost:8090/`. Opening `index.html` directly will not work.

### 3. Use it

1. Type a Clash Royale player tag (e.g. `#2YCPLJC9V`) in the search box.
2. Hit **Search**.
3. Browse stats, deck, and suggestions.

> **Note on API access**  
> This app uses the official [Clash Royale Developer API](https://developer.clashroyale.com).  
> You need a free API token to make requests — see **API Token Setup** below.

### 3. API Token Setup

1. Go to [developer.clashroyale.com](https://developer.clashroyale.com) and register an account.
2. Create a new API key and whitelist your IP address.
3. Copy `config.example.js` to `config.js`:
   ```bash
   cp config.example.js config.js
   ```
4. Paste your API token into `config.js`:
   ```js
   const CLASH_ROYALE_API_TOKEN = "your-token-here";
   ```

> ⚠️ `config.js` is gitignored — it will never be committed or pushed.

## Project Structure

```
├── config.example.js  → API key template (commit this)
├── config.js          → 🔐 Your private API key (gitignored)
├── player-config.js   → Default player tag (public)
├── index.html         → Main page
├── style.css          → Dark-theme styles
├── card-data.js       → Upgrade tables, max levels, slot rules, heroes
├── card-roles.js      → Card role/tag/air/splash classification
├── meta-decks.js      → Archetype dataset
├── deck-engine.js     → Deck legality + archetype scoring (pure, no DOM)
├── deck-analysis.js   → Coverage checks, autofill, swap ideas, upgrade value
├── app.js             → UI logic (API calls, rendering, event handlers)
├── cli.js             → Terminal upgrade snapshot
├── serve.py           → Dev server + API proxy + image cache
├── deck-rules.md      → Verified deck-building rules
└── README.md          → This file
```

## Tech Stack

- **Vanilla HTML / CSS / JS** — zero dependencies, no build tools
- **Clash Royale API** — official player data
- **RoyaleAPI CDN** — card icons and assets

## Roadmap

- [ ] Support for `#`-tag autocomplete
- [x] Deck builder with slot rules and elixir average calculator
- [x] Card level upgrade tracker
- [x] Deck coverage check with score, grade, swap ideas and auto-fill
- [x] Shareable deck links
- [ ] Match history and per-deck win rates
- [ ] Clan management dashboard
- [ ] River race stats
- [ ] Player vs player comparison

## Disclaimer

This project is **not affiliated with Supercell**.  
All Clash Royale assets and data belong to Supercell.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/clawdbot58-pixel">clawdbot58-pixel</a>
</p>
