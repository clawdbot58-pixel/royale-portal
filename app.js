/* =====================================================
   app.js — Royale Portal
   Uses the Clash Royale API via royaleapi.dev CORS proxy.
   ===================================================== */

const API_BASE = "https://proxy.royaleapi.dev/v1";

// --------------- DOM refs ---------------
const lookupForm = document.getElementById("player-lookup");
const tagInput = document.getElementById("player-tag");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const errorMsg = document.getElementById("error-message");
const resultsEl = document.getElementById("results");

// Profile
const avatarEl = document.getElementById("avatar");
const playerNameEl = document.getElementById("player-name");
const playerClanEl = document.getElementById("player-clan");
const playerTrophiesEl = document.getElementById("player-trophies");
const playerLevelEl = document.getElementById("player-level");
const playerLeagueEl = document.getElementById("player-league");

// Stats
const statWins = document.getElementById("stat-wins");
const statLosses = document.getElementById("stat-losses");
const statDraws = document.getElementById("stat-draws");
const statWinrate = document.getElementById("stat-winrate");
const statGames = document.getElementById("stat-games");
const stat3Crowns = document.getElementById("stat-3crowns");
const statFavCard = document.getElementById("stat-favcard");
const statMaxTrophies = document.getElementById("stat-maxtrophies");

// Decks & Battles
const currentDeckEl = document.getElementById("current-deck");
const suggestedDeckEl = document.getElementById("suggested-deck");
const battleLogEl = document.getElementById("battle-log");

// --------------- Helpers ---------------
function showLoading() {
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

function fmtTag(tag) {
  return tag.startsWith("#") ? tag.toUpperCase() : `#${tag.toUpperCase()}`;
}

function sanitizeTag(tag) {
  // Remove # and any non-alphanumeric characters, then re-add #
  const cleaned = tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned ? `#${cleaned}` : null;
}

// --------------- API call ---------------
async function fetchPlayer(tag) {
  const clean = sanitizeTag(tag);
  if (!clean) throw new Error("Invalid player tag");

  const url = `${API_BASE}/players/${encodeURIComponent(clean)}`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) throw new Error("Player not found — check your tag");
    if (resp.status === 403) throw new Error("API rate limit or auth error. Try again later.");
    throw new Error(`API error (${resp.status})`);
  }

  return resp.json();
}

// --------------- Render ---------------
function renderProfile(p) {
  playerNameEl.textContent = p.name || "—";

  if (p.clan) {
    const clanBadge = p.clan.badgeId
      ? ` <img src="https://cdn.royaleapi.com/static/img/badge/${p.clan.badgeId}.png" alt="" style="width:18px;vertical-align:middle" />`
      : "";
    playerClanEl.innerHTML = `🏰 ${p.clan.name}${clanBadge}`;
  } else {
    playerClanEl.textContent = "No clan";
  }

  playerTrophiesEl.textContent = `🏆 ${p.trophies?.toLocaleString() ?? "—"}`;
  playerLevelEl.textContent = `Lv ${p.expLevel ?? "—"}`;

  if (avatarEl && p.iconUrls && p.iconUrls.medium) {
    avatarEl.src = p.iconUrls.medium;
  }

  // League
  const league = p.leagueStatistics?.currentSeason;
  if (league) {
    playerLeagueEl.textContent = league.trophies
      ? `Best this season: ${league.trophies.toLocaleString()}`
      : "—";
  } else {
    playerLeagueEl.textContent = "Unranked";
  }
}

function renderStats(p) {
  const stats = getStatsFromData(p);
  statWins.textContent = stats.wins.toLocaleString();
  statLosses.textContent = stats.losses.toLocaleString();
  statDraws.textContent = stats.draws.toLocaleString();
  statWinrate.textContent = stats.winrate;
  statGames.textContent = stats.total.toLocaleString();
  stat3Crowns.textContent = stats.threeCrownWins?.toLocaleString() ?? "—";
  statFavCard.textContent = p.currentFavouriteCard?.name ?? "—";
  statMaxTrophies.textContent = p.bestTrophies?.toLocaleString() ?? "—";
}

function getStatsFromData(p) {
  const c = p.leagueStatistics?.currentSeason || {};
  const wins = c.wins ?? 0;
  const losses = c.losses ?? 0;
  const draws = c.draws ?? 0;
  const total = wins + losses + draws;
  const winrate = total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : "—";
  return { wins, losses, draws, winrate, total, threeCrownWins: c.threeCrownWins };
}

function renderDeck(deck, container) {
  container.innerHTML = "";
  if (!deck || deck.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1">No deck data available</p>';
    return;
  }

  deck.forEach((card) => {
    const div = document.createElement("div");
    div.className = "deck-card";

    const iconId = card.iconUrls?.medium
      ? card.iconUrls.medium
      : `https://cdn.royaleapi.com/static/img/battle/${card.id}.png`;

    div.innerHTML = `
      <img src="${iconId}" alt="${card.name}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23232544%22 width=%2240%22 height=%2240%22/><text x=%2220%22 y=%2220%22 text-anchor=%22middle%22 fill=%22%238b8da8%22 font-size=%2210%22>?</text></svg>'"
      />
      <div class="deck-name">${card.name}</div>
    `;
    container.appendChild(div);
  });
}

function renderBattles(p) {
  battleLogEl.innerHTML = "";

  const battles = p.battles || [];
  if (battles.length === 0) {
    battleLogEl.innerHTML = '<p style="color:var(--text-muted)">No recent battles available.</p>';
    return;
  }

  // Take last 10 battles
  const recent = battles.slice(-10);

  recent.forEach((b) => {
    const item = document.createElement("div");
    item.className = "battle-item";

    let resultText = "Draw";
    let resultClass = "draw";

    if (b.team && b.opponent) {
      const teamCrowns = b.team[0]?.crowns ?? 0;
      const oppCrowns = b.opponent[0]?.crowns ?? 0;
      if (teamCrowns > oppCrowns) {
        resultText = "Win";
        resultClass = "win";
      } else if (teamCrowns < oppCrowns) {
        resultText = "Loss";
        resultClass = "loss";
      }
    }

    const trophyChange = b.team?.[0]?.trophyChange;
    const trophyStr = trophyChange != null
      ? (trophyChange > 0 ? `+${trophyChange}` : trophyChange)
      : "";

    item.innerHTML = `
      <span class="battle-result ${resultClass}">${resultText}</span>
      <span class="battle-mode">${b.type ?? b.gameMode?.name ?? "Unknown"}</span>
      <span class="battle-trophies">${trophyStr}</span>
    `;

    battleLogEl.appendChild(item);
  });
}

// --------------- Deck Suggestions ---------------
function generateSuggestedDeck(favCardName) {
  // Pre-built archetypes keyed by card name keywords
  const archetypes = [
    { name: "Hog Rider", cards: ["Hog Rider", "Fireball", "Zap", "Musketeer", "Cannon", "Ice Spirit", "Skeleton Army", "The Log"] },
    { name: "Golem Beatdown", cards: ["Golem", "Night Witch", "Baby Dragon", "Lumberjack", "Mega Minion", "Tornado", "Zap", "Poison"] },
    { name: "X-Bow", cards: ["X-Bow", "Ice Spirit", "Skeleton Army", "Fireball", "Tesla", "Archers", "The Log", "Rocket"] },
    { name: "Log Bait", cards: ["Goblin Barrel", "Princess", "Knight", "Ice Spirit", "Rocket", "The Log", "Goblin Gang", "Tesla"] },
    { name: "LavaLoon", cards: ["Lava Hound", "Balloon", "Mega Minion", "Tombstone", "Skeleton Army", "Zap", "Fireball", "Minions"] },
    { name: "Pekka Bridge Spam", cards: ["P.E.K.K.A", "Battle Ram", "Bandit", "Magic Archer", "Zap", "Poison", "Royal Ghost", "Miner"] },
    { name: "Royal Giant", cards: ["Royal Giant", "Furnace", "Barbarians", "Lightning", "Ice Spirit", "Mega Minion", "The Log", "Electro Wizard"] },
    { name: "Graveyard Freeze", cards: ["Graveyard", "Freeze", "Knight", "Musketeer", "Tornado", "Poison", "Ice Wizard", "Barbarian Barrel"] },
    { name: "Miner Control", cards: ["Miner", "Wall Breakers", "Skeleton Army", "Fireball", "Zap", "Musketeer", "Cannon", "Ice Spirit"] },
    { name: "Giant Double Prince", cards: ["Giant", "Prince", "Dark Prince", "Mega Minion", "Zap", "Fireball", "Mini P.E.K.K.A", "Archers"] },
    { name: "Splashyard", cards: ["Graveyard", "Baby Dragon", "Knight", "Ice Wizard", "Tornado", "Poison", "Tombstone", "Barbarian Barrel"] },
    { name: "Three Musketeers", cards: ["Three Musketeers", "Battle Ram", "Elixir Collector", "Ice Golem", "Minion Horde", "Zap", "The Log", "Goblin Gang"] },
    { name: "Mortar Bait", cards: ["Mortar", "Rocket", "Goblin Gang", "Skeleton Army", "Rascals", "Ice Spirit", "The Log", "Miner"] },
    { name: "Sparky", cards: ["Sparky", "Giant", "Mega Minion", "Wizard", "Zap", "Fireball", "Tornado", "Minions"] },
    { name: "Mega Knight", cards: ["Mega Knight", "Bandit", "Zap", "Poison", "Bats", "Minion Horde", "Ice Spirit", "The Log"] },
  ];

  // Prefer archetype that matches the favorite card
  let matched = null;
  let bestScore = 0;

  for (const arch of archetypes) {
    const score = arch.cards.some((c) =>
      favCardName && c.toLowerCase().includes(favCardName.toLowerCase())
    )
      ? 10
      : 0;
    if (score > bestScore) {
      bestScore = score;
      matched = arch;
    }
  }

  // Fallback: Hog Rider cycle (it's the most common)
  if (!matched) {
    matched = archetypes.find((a) => a.name === "Hog Rider") || archetypes[0];
  }

  return matched.cards;
}

// --------------- Main flow ---------------
lookupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tag = tagInput.value.trim();
  if (!tag) return;

  showLoading();

  try {
    const data = await fetchPlayer(tag);

    renderProfile(data);
    renderStats(data);
    renderDeck(data.currentDeck || [], currentDeckEl);

    // Suggested deck based on favorite card
    const favCard = data.currentFavouriteCard?.name || "";
    const suggestedCards = generateSuggestedDeck(favCard);
    const suggestedCardObjects = suggestedCards.map((name) => ({
      name,
      iconUrls: { medium: `https://cdn.royaleapi.com/static/img/battle/${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png` },
      id: name,
    }));
    renderDeck(suggestedCardObjects, suggestedDeckEl);

    // Battles from the player data (the endpoint returns recent battles inline)
    renderBattles(data);

    showResults();
  } catch (err) {
    showError(err.message);
  }
});

// --------------- Demo hint (auto-load on Enter) ---------------
tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupForm.dispatchEvent(new Event("submit"));
});
