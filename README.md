# 🏆 Royale Portal

**Clash Royale statistics & deck suggestion tool.**  
Enter your player tag and get detailed stats, your current deck, suggested meta decks, and recent battle history.

![Screenshot placeholder](https://cdn.royaleapi.com/static/img/brand/clash-royale-banner.png)

---

## Features

- **Player Lookup** — search any Clash Royale player by tag
- **Collection** — all 123 cards + 4 tower troops with level, progress, evolution/hero badges, rarity multi-select, status filters, search, upgrade-priority sort
- **Deck Builder** — 8 slots with champion / evolution / hero / wild rules, tower troop selection, live legality check, average elixir
- **Deck Suggestions** — 26 meta archetypes scored against your actual levels, with the upgrade plan to close the gap
- **Deck Rules** — the verified slot rules, ceilings, and unlock thresholds, in-app
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
├── card-roles.js      → Card role/tag classification
├── meta-decks.js      → Archetype dataset
├── deck-engine.js     → Deck legality + scoring (pure, no DOM)
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
