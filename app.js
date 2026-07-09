/* =====================================================
   app.js — Royale Portal
   Uses the Clash Royale Developer API with a private
   API token from config.js.
   ===================================================== */

// --------------- Constants ---------------
const API_BASE = typeof CLASH_ROYALE_API_TOKEN !== "undefined"
  ? "https://api.clashroyale.com/v1"
  : null;

const RARITY_COLORS = {
  common: "#8b8da8", rare: "#5b7fff", epic: "#b44cff",
  legendary: "#f0c43f", champion: "#ff6b35",
};
const RARITY_MAX = {
  common: 16, rare: 14, epic: 11, legendary: 9, champion: 6,
};

// --------------- State ---------------
let allCardsDb = {};        // name -> { id, name, elixirCost, rarity, iconUrls, maxLevel }
let playerCardsMap = {};    // name -> { level, maxLevel, ... }
let currentPlayerData = null;
let currentFavCard = "";
let currentPlayerTag = "";

// --------------- DOM refs ---------------
const lookupForm = document.getElementById("player-lookup");
const tagInput = document.getElementById("player-tag");
const loadDefaultBtn = document.getElementById("load-default-btn");
const loadingEl = document.getElementById("loading");
const loadingText = document.getElementById("loading-text");
const errorEl = document.getElementById("error");
const errorMsg = document.getElementById("error-message");
const resultsEl = document.getElementById("results");

// Tab system
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanels = {
  dashboard: document.getElementById("tab-dashboard"),
  deck: document.getElementById("tab-deck"),
  cards: document.getElementById("tab-cards"),
  suggestions: document.getElementById("tab-suggestions"),
};

// Dashboard
const avatarEl = document.getElementById("avatar");
const playerNameEl = document.getElementById("player-name");
const playerClanEl = document.getElementById("player-clan");
const playerTrophiesEl = document.getElementById("player-trophies");
const playerLevelEl = document.getElementById("player-level");
const playerArenaEl = document.getElementById("player-arena");
const playerStreakEl = document.getElementById("player-streak");
const playerDonationsEl = document.getElementById("player-donations");

const statEls = {
  wins: document.getElementById("stat-wins"),
  losses: document.getElementById("stat-losses"),
  winrate: document.getElementById("stat-winrate"),
  games: document.getElementById("stat-games"),
  threeCrowns: document.getElementById("stat-3crowns"),
  best: document.getElementById("stat-best"),
  challenge: document.getElementById("stat-challenge"),
  tourney: document.getElementById("stat-tourney"),
  challmax: document.getElementById("stat-challmax"),
  war: document.getElementById("stat-war"),
  clancards: document.getElementById("stat-clancards"),
  totaldonations: document.getElementById("stat-totaldonations"),
};
const seasonSection = document.getElementById("season-stats");
const polSection = document.getElementById("pol-stats");

// Deck tab
const currentDeckEl = document.getElementById("current-deck");
const supportDeckEl = document.getElementById("support-deck");
const deckElixirAvg = document.getElementById("deck-elixir-avg");
const deckStatsEl = document.getElementById("deck-stats");

// Cards tab
const cardGridEl = document.getElementById("card-grid");
const cardFilterRarity = document.getElementById("card-filter-rarity");
const cardFilterSort = document.getElementById("card-filter-sort");

// Suggested decks tab
const suggestedDecksList = document.getElementById("suggested-decks-list");

// --------------- Init ---------------
tagInput.value = DEFAULT_PLAYER_TAG || "";
currentPlayerTag = DEFAULT_PLAYER_TAG || "";

// --------------- Tab system ---------------
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(tabPanels).forEach(([key, panel]) => {
      panel.classList.toggle("active", key === btn.dataset.tab);
    });
  });
});

// --------------- Helpers ---------------
function setLoading(msg) {
  loadingText.textContent = msg || "Fetching data...";
  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  resultsEl.classList.add("hidden");
}
function showError(msg) {
  loadingEl.classList.add("hidden");
  errorEl.classList.remove("hidden");
  errorMsg.textContent = msg;
}
function showResults() {
  loadingEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  resultsEl.classList.remove("hidden");
}
function sanitizeTag(tag) {
  const cleaned = tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned ? `#${cleaned}` : null;
}

function rarityColor(rarity) {
  return RARITY_COLORS[rarity?.toLowerCase()] || "#8b8da8";
}

// --------------- API calls ---------------
async function apiFetch(path) {
  if (!API_BASE || !CLASH_ROYALE_API_TOKEN) {
    throw new Error("API token not configured. Add your token to config.js.");
  }
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${CLASH_ROYALE_API_TOKEN}`,
    },
  });
  if (!resp.ok) {
    if (resp.status === 404) throw new Error("Not found");
    if (resp.status === 403) throw new Error("API key rejected or rate-limited. Check config.js.");
    throw new Error(`API error (${resp.status})`);
  }
  return resp.json();
}

async function fetchCards() {
  if (Object.keys(allCardsDb).length > 0) return; // already cached
  const data = await apiFetch("/cards");
  data.items.forEach((c) => {
    const name = c.name.trim();
    allCardsDb[name] = {
      id: c.id,
      name,
      elixirCost: c.elixirCost ?? "?",
      rarity: c.rarity,
      iconUrls: c.iconUrls || {},
      maxLevel: c.maxLevel || RARITY_MAX[c.rarity?.toLowerCase()] || 14,
    };
  });
}

async function fetchPlayer(tag) {
  const clean = sanitizeTag(tag);
  if (!clean) throw new Error("Invalid player tag");
  return apiFetch(`/players/${encodeURIComponent(clean)}`);
}

// --------------- Main data load ---------------
async function loadPlayer(tag) {
  setLoading("Fetching player data...");
  try {
    await fetchCards(); // ensure card DB is loaded
    setLoading("Loading player stats...");
    const data = await fetchPlayer(tag);
    currentPlayerData = data;
    currentPlayerTag = sanitizeTag(tag) || tag;

    // Build player cards map
    playerCardsMap = {};
    (data.cards || []).forEach((c) => {
      playerCardsMap[c.name.trim()] = c;
    });
    currentFavCard = data.currentFavouriteCard?.name || "";

    renderDashboard(data);
    renderDeckTab(data);
    renderCardCollection(data);
    renderSuggestedDecks(data);

    showResults();
    // Reset to dashboard tab
    document.querySelector('.tab-btn[data-tab="dashboard"]')?.click();
  } catch (err) {
    showError(err.message);
  }
}

// --------------- Dashboard ---------------
function renderDashboard(data) {
  // Profile
  playerNameEl.textContent = data.name || "—";
  if (data.clan) {
    playerClanEl.textContent = `🏰 ${data.clan.name}`;
  } else {
    playerClanEl.textContent = "No clan";
  }
  playerTrophiesEl.textContent = `🏆 ${data.trophies?.toLocaleString() ?? "—"}`;
  playerLevelEl.textContent = `Lv ${data.expLevel ?? "—"}`;
  playerArenaEl.textContent = data.arena?.name || "—";

  if (avatarEl && data.iconUrls?.medium) {
    avatarEl.src = data.iconUrls.medium;
  }

  // Streak
  const streak = data.currentWinLoseStreak;
  if (streak != null) {
    const icon = streak > 0 ? "🔥" : streak < 0 ? "💀" : "➖";
    playerStreakEl.textContent = `${icon} ${streak > 0 ? "+" : ""}${streak}`;
  } else {
    playerStreakEl.textContent = "📈 —";
  }
  playerDonationsEl.textContent = `🎁 ${(data.donations ?? 0).toLocaleString()} / ${(data.donationsReceived ?? 0).toLocaleString()}`;

  // Stats
  const wins = data.wins ?? 0;
  const losses = data.losses ?? 0;
  const total = data.battleCount ?? (wins + losses);
  const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) + "%" : "—";

  statEls.wins.textContent = wins.toLocaleString();
  statEls.losses.textContent = losses.toLocaleString();
  statEls.winrate.textContent = winrate;
  statEls.games.textContent = total.toLocaleString();
  statEls.threeCrowns.textContent = (data.threeCrownWins ?? 0).toLocaleString();
  statEls.best.textContent = (data.bestTrophies ?? 0).toLocaleString();
  statEls.challenge.textContent = (data.challengeCardsWon ?? 0).toLocaleString();
  statEls.tourney.textContent = (data.tournamentCardsWon ?? 0).toLocaleString();
  statEls.challmax.textContent = (data.challengeMaxWins ?? "—").toString();
  statEls.war.textContent = (data.warDayWins ?? 0).toString();
  statEls.clancards.textContent = (data.clanCardsCollected ?? 0).toLocaleString();
  statEls.totaldonations.textContent = (data.totalDonations ?? 0).toLocaleString();

  // Season stats
  renderSeasonStats(data);

  // Path of Legend
  renderPolStats(data);
}

function renderSeasonStats(data) {
  seasonSection.innerHTML = "";
  const ls = data.leagueStatistics || {};
  const seasons = [
    { label: "Current Season", s: ls.currentSeason },
    { label: "Previous Season", s: ls.previousSeason },
    { label: "Best Season", s: ls.bestSeason },
  ];
  seasons.forEach(({ label, s }) => {
    if (!s) return;
    const div = document.createElement("div");
    div.className = "season-item";
    div.innerHTML = `
      <h4>${label}</h4>
      <p>Trophies: ${(s.bestTrophies ?? s.trophies ?? "—").toLocaleString()}</p>
    `;
    seasonSection.appendChild(div);
  });
}

function renderPolStats(data) {
  polSection.innerHTML = "";
  const pols = [
    { label: "Current Season", s: data.currentPathOfLegendSeasonResult },
    { label: "Previous Season", s: data.lastPathOfLegendSeasonResult },
    { label: "Best Season", s: data.bestPathOfLegendSeasonResult },
  ];
  let hasAny = false;
  pols.forEach(({ label, s }) => {
    if (!s) return;
    hasAny = true;
    const div = document.createElement("div");
    div.className = "pol-item";
    const rank = s.rank ?? s.leagueNumber ?? "—";
    const trophies = s.trophies ?? "—";
    div.innerHTML = `
      <h4>${label}</h4>
      <p>Rank: ${rank}${trophies !== "—" ? ` | ${trophies} trophies` : ""}</p>
    `;
    polSection.appendChild(div);
  });
  if (!hasAny) {
    polSection.innerHTML = '<div class="pol-item"><p style="color:var(--text-muted)">No Path of Legend data</p></div>';
  }
}

// --------------- Deck Tab ---------------
function renderDeckTab(data) {
  const deck = data.currentDeck || [];
  renderDeckCards(deck, currentDeckEl, true);

  // Elixir average
  const costs = deck.map((c) => c.elixirCost ?? null).filter((v) => v !== null && v !== "?");
  const avg = costs.length > 0 ? (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1) : "—";
  deckElixirAvg.textContent = `⚡ Avg: ${avg}`;

  // Deck stats breakdown
  const rarities = {};
  deck.forEach((c) => {
    const r = (c.rarity || "?").toLowerCase();
    rarities[r] = (rarities[r] || 0) + 1;
  });
  deckStatsEl.innerHTML = Object.entries(rarities)
    .map(([r, n]) => `<span class="deck-stat-tag" style="color:${rarityColor(r)}">${n} ${r}</span>`)
    .join("");

  // Support cards
  const supports = data.currentDeckSupportCards || data.supportCards || [];
  renderDeckCards(supports, supportDeckEl, true);
  if (supports.length === 0) {
    supportDeckEl.innerHTML = '<p style="color:var(--text-muted)">No support cards</p>';
  }
}

function renderDeckCards(cards, container, showMeta) {
  container.innerHTML = "";
  if (!cards || cards.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">No cards</p>';
    return;
  }
  cards.forEach((card) => {
    const div = document.createElement("div");
    const rarity = (card.rarity || "").toLowerCase();
    div.className = `deck-card rarity-${rarity}`;

    const icon = card.iconUrls?.medium || "";
    const name = card.name;
    const level = card.level ?? "?";
    const elixir = card.elixirCost ?? "?";
    const maxLv = card.maxLevel ?? RARITY_MAX[rarity] ?? "?";

    div.innerHTML = `
      ${showMeta && elixir !== "?" ? `<span class="deck-elixir">⚡${elixir}</span>` : ""}
      ${showMeta && level !== "?" ? `<span class="deck-level" style="color:${rarityColor(rarity)}">${level}</span>` : ""}
      <img src="${icon}" alt="${name}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23232544%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2220%22 text-anchor=%22middle%22 fill=%22%238b8da8%22 font-size=%2210%22>?</text></svg>'"
      />
      <div class="deck-name">${name}</div>
      ${showMeta && maxLv !== "?" ? `<div class="cc-level" style="font-size:0.65rem;color:var(--text-muted)">${level}/${maxLv}</div>` : ""}
    `;
    container.appendChild(div);
  });
}

// --------------- Card Collection ---------------
function renderCardCollection(data) {
  const cards = data.cards || [];
  renderFilteredCards(cards);

  // Wire up filter/sort
  function update() { renderFilteredCards(cards); }
  cardFilterRarity.onchange = update;
  cardFilterSort.onchange = update;
}

function renderFilteredCards(cards) {
  const rarity = cardFilterRarity.value;
  const sort = cardFilterSort.value;

  let filtered = cards;
  if (rarity !== "all") {
    filtered = filtered.filter((c) => c.rarity?.toLowerCase() === rarity);
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    switch (sort) {
      case "level": return (a.level ?? 0) - (b.level ?? 0);
      case "level-desc": return (b.level ?? 0) - (a.level ?? 0);
      case "upgrade": return calcUpgradePriority(a) - calcUpgradePriority(b);
      default: return a.name.localeCompare(b.name);
    }
  });

  cardGridEl.innerHTML = "";
  filtered.forEach((card) => {
    const div = document.createElement("div");
    div.className = "collection-card";

    const rarity = (card.rarity || "").toLowerCase();
    const lv = card.level ?? 0;
    const maxLv = card.maxLevel ?? RARITY_MAX[rarity] ?? 0;
    const elixir = card.elixirCost ?? "?";
    const icon = card.iconUrls?.medium || "";
    const canUpgrade = lv < maxLv;
    const pct = maxLv > 0 ? Math.round((lv / maxLv) * 100) : 0;

    div.style.borderLeft = `3px solid ${rarityColor(rarity)}`;
    div.innerHTML = `
      <img src="${icon}" alt="${card.name}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23232544%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2220%22 text-anchor=%22middle%22 fill=%22%238b8da8%22 font-size=%2210%22>?</text></svg>'"
      />
      <div class="cc-name">${card.name}</div>
      <div class="cc-level ${canUpgrade ? "upgradable" : "maxed"}">Lv ${lv}/${maxLv} ${canUpgrade ? "⬆" : "★"}</div>
      <div class="cc-elixir">⚡${elixir} · ${card.rarity}</div>
      <div class="cc-progress" style="margin-top:4px;background:var(--bg);border-radius:4px;height:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${canUpgrade ? rarityColor(rarity) : "var(--accent)"};border-radius:4px"></div>
      </div>
    `;
    cardGridEl.appendChild(div);
  });

  if (filtered.length === 0) {
    cardGridEl.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem">No cards match this filter.</p>';
  }
}

function calcUpgradePriority(card) {
  // Lower score = higher priority to upgrade
  const rarity = (card.rarity || "").toLowerCase();
  const lv = card.level ?? 0;
  const maxLv = card.maxLevel ?? RARITY_MAX[rarity] ?? 0;
  if (lv >= maxLv) return 999; // maxed = last

  // Cards closer to max but not yet maxed = higher priority
  // Also boost meta-relevant cards (we'll do a simple heuristic)
  return (maxLv - lv) * 10;
}

// --------------- Suggested Decks ---------------
const ARCHETYPES = [
  { name: "Hog Rider Cycle", cards: ["Hog Rider", "Fireball", "Zap", "Musketeer", "Cannon", "Ice Spirit", "Skeleton Army", "The Log"], key: "Hog Rider" },
  { name: "Golem Beatdown", cards: ["Golem", "Night Witch", "Baby Dragon", "Lumberjack", "Mega Minion", "Tornado", "Zap", "Poison"], key: "Golem" },
  { name: "X-Bow 2.9", cards: ["X-Bow", "Ice Spirit", "Skeletons", "Fireball", "Tesla", "Archers", "The Log", "Rocket"], key: "X-Bow" },
  { name: "Log Bait", cards: ["Goblin Barrel", "Princess", "Knight", "Ice Spirit", "Rocket", "The Log", "Goblin Gang", "Tesla"], key: "Goblin Barrel" },
  { name: "LavaLoon", cards: ["Lava Hound", "Balloon", "Mega Minion", "Tombstone", "Skeleton Army", "Zap", "Fireball", "Minions"], key: "Lava Hound" },
  { name: "PEKKA Bridge Spam", cards: ["P.E.K.K.A", "Battle Ram", "Bandit", "Magic Archer", "Zap", "Poison", "Royal Ghost", "Miner"], key: "P.E.K.K.A" },
  { name: "Royal Giant Furnace", cards: ["Royal Giant", "Furnace", "Barbarians", "Lightning", "Ice Spirit", "Mega Minion", "The Log", "Electro Wizard"], key: "Royal Giant" },
  { name: "Graveyard Freeze", cards: ["Graveyard", "Freeze", "Knight", "Musketeer", "Tornado", "Poison", "Ice Wizard", "Barbarian Barrel"], key: "Graveyard" },
  { name: "Miner Control", cards: ["Miner", "Wall Breakers", "Skeleton Army", "Fireball", "Zap", "Musketeer", "Cannon", "Ice Spirit"], key: "Miner" },
  { name: "Giant Double Prince", cards: ["Giant", "Prince", "Dark Prince", "Mega Minion", "Zap", "Fireball", "Mini P.E.K.K.A", "Archers"], key: "Giant" },
  { name: "Splashyard", cards: ["Graveyard", "Baby Dragon", "Knight", "Ice Wizard", "Tornado", "Poison", "Tombstone", "Barbarian Barrel"], key: "Baby Dragon" },
  { name: "Three Musketeers", cards: ["Three Musketeers", "Battle Ram", "Elixir Collector", "Ice Golem", "Minion Horde", "Zap", "The Log", "Goblin Gang"], key: "Three Musketeers" },
  { name: "Mega Knight", cards: ["Mega Knight", "Bandit", "Zap", "Poison", "Bats", "Minion Horde", "Ice Spirit", "The Log"], key: "Mega Knight" },
  { name: "Splashyard", cards: ["Graveyard", "Baby Dragon", "Knight", "Ice Wizard", "Tornado", "Poison", "Tombstone", "Barbarian Barrel"], key: "Baby Dragon" },
];

function renderSuggestedDecks(data) {
  suggestedDecksList.innerHTML = "";

  // Score each archetype: match fav card + card levels
  const scored = ARCHETYPES.map((arch) => {
    let score = 0;
    let owned = 0;
    let upgradeCount = 0;
    let totalLevels = 0;

    arch.cards.forEach((cardName) => {
      const lv = playerCardsMap[cardName]?.level ?? 0;
      const maxLv = playerCardsMap[cardName]?.maxLevel ?? RARITY_MAX[playerCardsMap[cardName]?.rarity?.toLowerCase()] ?? 14;
      if (lv > 0) owned++;
      if (lv < maxLv && lv > 0) upgradeCount++;
      totalLevels += lv;

      // Boost if matches fav card
      if (currentFavCard && cardName.toLowerCase().includes(currentFavCard.toLowerCase())) {
        score += 20;
      }
    });

    const avgLevel = owned > 0 ? (totalLevels / owned).toFixed(1) : "—";
    const missing = 8 - owned;

    // Boost score by owned count
    score += owned * 3;
    // Boost if key card is owned
    if (arch.key && playerCardsMap[arch.key]?.level > 0) score += 15;

    return { ...arch, score, owned, missing, upgradeCount, avgLevel };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Show top 6
  scored.slice(0, 6).forEach((arch) => {
    const block = document.createElement("div");
    block.className = "suggested-deck-block";

    const statusClass = arch.owned >= 6 ? "highlight" : arch.owned >= 4 ? "" : "warning";
    const statusText = arch.owned >= 6
      ? `${arch.owned}/8 cards owned ✓`
      : arch.owned >= 4
        ? `${arch.owned}/8 cards owned`
        : `${arch.owned}/8 cards owned — ${arch.missing} missing`;

    block.innerHTML = `
      <h3>${arch.name}</h3>
      <div class="deck-meta">
        <span class="${statusClass}">${statusText}</span>
        <span>Avg Lv: ${arch.avgLevel}</span>
        ${arch.upgradeCount > 0 ? `<span class="warning">${arch.upgradeCount} cards can upgrade</span>` : ""}
      </div>
      <div class="deck-grid" style="grid-template-columns:repeat(8,1fr)">
    `;

    arch.cards.forEach((cardName) => {
      const pc = playerCardsMap[cardName] || {};
      const lv = pc.level ?? 0;
      const icon = pc.iconUrls?.medium || allCardsDb[cardName]?.iconUrls?.medium || "";
      const rarity = (pc.rarity || allCardsDb[cardName]?.rarity || "").toLowerCase();
      const maxLv = pc.maxLevel ?? allCardsDb[cardName]?.maxLevel ?? RARITY_MAX[rarity] ?? 14;
      const owned = lv > 0;
      const canUp = owned && lv < maxLv;

      const cardDiv = document.createElement("div");
      cardDiv.className = "deck-card";
      cardDiv.style.opacity = owned ? "1" : "0.35";
      cardDiv.style.border = `1px solid ${rarityColor(rarity)}`;

      cardDiv.innerHTML = `
        <span class="deck-level" style="background:rgba(0,0,0,0.75);color:${rarityColor(rarity)}">${owned ? lv : "?"}</span>
        <img src="${icon}" alt="${cardName}" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23232544%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2220%22 text-anchor=%22middle%22 fill=%22%238b8da8%22 font-size=%2210%22>?</text></svg>'"
        />
        <div class="deck-name">${cardName}</div>
        ${canUp ? '<div style="font-size:0.6rem;color:var(--success)">⬆ Upgrade</div>' : owned ? '<div style="font-size:0.6rem;color:var(--accent)">MAX</div>' : '<div style="font-size:0.6rem;color:var(--accent3)">Missing</div>'}
      `;
      block.querySelector(".deck-grid").appendChild(cardDiv);
    });

    suggestedDecksList.appendChild(block);
  });
}

// --------------- Event handlers ---------------
lookupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tag = tagInput.value.trim();
  if (!tag) return;
  await loadPlayer(tag);
});

loadDefaultBtn.addEventListener("click", async () => {
  if (DEFAULT_PLAYER_TAG) {
    tagInput.value = DEFAULT_PLAYER_TAG;
    await loadPlayer(DEFAULT_PLAYER_TAG);
  }
});

// Auto-load default on page load
if (DEFAULT_PLAYER_TAG) {
  setTimeout(() => loadPlayer(DEFAULT_PLAYER_TAG), 300);
}
