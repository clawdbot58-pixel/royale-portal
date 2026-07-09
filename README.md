# 🏆 Royale Portal

**Clash Royale statistics & deck suggestion tool.**  
Enter your player tag and get detailed stats, your current deck, suggested meta decks, and recent battle history.

![Screenshot placeholder](https://cdn.royaleapi.com/static/img/brand/clash-royale-banner.png)

---

## Features

- **Player Lookup** — search any Clash Royale player by tag
- **Stats Dashboard** — wins, losses, win rate, total games, three crowns, and more
- **Current Deck** — see the 8 cards your target is currently using
- **Suggested Deck** — an archetype recommendation based on your trophy range and favourite card
- **Battle History** — recent match results

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/clawdbot58-pixel/royale-portal.git
cd royale-portal
```

### 2. Open the app

Simply open `index.html` in your browser — it's a fully client-side SPA. No build step needed.

```bash
open index.html
```

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
├── index.html         → Main page
├── style.css          → Dark-theme styles
├── app.js             → All logic (API calls, rendering, deck suggestions)
└── README.md          → This file
```

## Tech Stack

- **Vanilla HTML / CSS / JS** — zero dependencies, no build tools
- **Clash Royale API** — official player data
- **RoyaleAPI CDN** — card icons and assets

## Roadmap

- [ ] Support for `#`-tag autocomplete
- [ ] Deck builder with elixir average calculator
- [ ] Card level upgrade tracker
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
