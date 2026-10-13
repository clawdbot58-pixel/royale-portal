/* =====================================================
   app.js — Royale Portal (Card Collection)
   ===================================================== */

var API_ROOT = "/api";

var RARITY_COLORS = {
  common:    "#4A90D9",
  rare:      "#E07800",
  epic:      "#C040C0",
  legendary: "#F0C43F",
  champion:  "#FFD700",
};
var RARITY_ORDER = ["common", "rare", "epic", "legendary", "champion"];

// Cards-array helper: picks the right CARDS_* global by rarity name
function getCardsArray(rarity) {
  var r = (rarity || "").toLowerCase();
  if (r === "common")    return typeof CARDS_COMMON    !== "undefined" ? CARDS_COMMON    : null;
  if (r === "rare")      return typeof CARDS_RARE      !== "undefined" ? CARDS_RARE      : null;
  if (r === "epic")      return typeof CARDS_EPIC      !== "undefined" ? CARDS_EPIC      : null;
  if (r === "legendary") return typeof CARDS_LEGENDARY !== "undefined" ? CARDS_LEGENDARY : null;
  if (r === "champion")  return typeof CARDS_CHAMPION  !== "undefined" ? CARDS_CHAMPION  : null;
  return null;
}

// --------------- State ---------------
var allCardsDb  = {};
var mergedCards = [];
var currentPlayerTag = "";
var selectedRarities = new Set();  // empty = show all

// Deck builder + suggestion state
var currentPlayerData = null;
var currentDeck   = [];   // [{name, slot}] — 8 entries
var currentTower  = null; // equipped tower troop name
var currentFavCard = null;
var activeTab     = "collection";
var statusFilter  = "all";
var suggMode      = "all";

// Image URL overrides for cards whose API CDN URLs are broken/missing
var CARD_IMG_OVERRIDES = {
  "ronin": "https://cdns3.royaleapi.com/cdn-cgi/image/w=150,h=180,format=auto/static/img/cards/v10-9f6caa5e/ronin.png",
};

// --------------- DOM refs ---------------
var lookupForm  = document.getElementById("lookup-form");
var tagInput    = document.getElementById("tag-input");
var mineBtn     = document.getElementById("mine-btn");
var loadingEl   = document.getElementById("loading");
var loadingText = document.getElementById("loading-text");
var errorEl     = document.getElementById("error");
var errorMsg    = document.getElementById("error-msg");
var contentEl   = document.getElementById("content");
var playerBar   = document.getElementById("player-bar");
var pnameEl     = document.getElementById("pname");
var ptagEl      = document.getElementById("ptag");
var pstatsEl    = document.getElementById("pstats");
var cacheStatus = document.getElementById("cache-status");
var cardGrid    = document.getElementById("card-grid");
var sortSelect   = document.getElementById("sort-select");
var searchInput  = document.getElementById("search-input");
var countLabel   = document.getElementById("count-label");
var controlsEl   = document.getElementById("controls");
var filtersToggle = document.getElementById("filters-toggle");
var filtersSummary = document.getElementById("filters-summary");
var msBtn       = document.getElementById("rarity-btn");
var msDropdown  = document.getElementById("rarity-dropdown");
var statusSelect  = document.getElementById("status-select");
var tabBar        = document.getElementById("tab-bar");
var deckSlotsEl   = document.getElementById("deck-slots");
var deckSummaryEl = document.getElementById("deck-summary");
var deckCheckEl   = document.getElementById("deck-check");
var towerSelect   = document.getElementById("tower-select");
var deckResetBtn  = document.getElementById("deck-reset");
var deckAutofillBtn = document.getElementById("deck-autofill");
var deckShareBtn  = document.getElementById("deck-share");
var pickFilter = "";
var deckAnalysisEl = document.getElementById("deck-analysis");
var deckStatsEl = document.getElementById("deck-stats");
var deckVerdictEl = document.getElementById("deck-verdict");
// The elixir ladder and rotation timing live in a <details>; a rebuild must
// not slam it shut while you are reading it.
var deckDetailsOpen = false;
var pickListEl    = document.getElementById("deck-pick-list");
var suggestionsEl = document.getElementById("suggestions");
var suggSummaryEl = document.getElementById("sugg-summary");
var suggModeEl    = document.getElementById("sugg-mode");
var investListEl  = document.getElementById("invest-list");
var scoreTableBody = document.querySelector("#score-table tbody");
var battlesSummaryEl = document.getElementById("battles-summary");
var battlesDecksEl   = document.getElementById("battles-decks");
var battlesCardsEl   = document.getElementById("battles-cards");
var battlesFacedEl   = document.getElementById("battles-faced");
var battlesListEl    = document.getElementById("battles-list");
var battlesSrcEl     = document.getElementById("battles-src");
var currentBattlelog = null;
var battlelogTag     = null;
var battlelogError   = null;

// --------------- Init ---------------
if (typeof DEFAULT_PLAYER_TAG !== "undefined" && DEFAULT_PLAYER_TAG) {
  tagInput.value = DEFAULT_PLAYER_TAG;
}

// --------------- Helpers ---------------
function setLoading(msg) {
  loadingText.textContent = msg || "Loading…";
  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  contentEl.classList.add("hidden");
}
function showError(msg) {
  loadingEl.classList.add("hidden");
  errorEl.classList.remove("hidden");
  errorMsg.textContent = msg;
}
function showContent() {
  loadingEl.classList.add("hidden");
  errorEl.classList.add("hidden");
  contentEl.classList.remove("hidden");
}
function sanitizeTag(tag) {
  var c = tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return c ? "#" + c : null;
}
function rarityColor(r) {
  return RARITY_COLORS[(r || "").toLowerCase()] || "#8b8da8";
}
function proxyImg(url, cardName) {
  if (!url) return "";
  // Check for image overrides (cards with broken API CDN URLs)
  if (cardName && CARD_IMG_OVERRIDES[cardName.toLowerCase()]) {
    return CARD_IMG_OVERRIDES[cardName.toLowerCase()];
  }
  // Standard CR API CDN → proxy through our server for caching
  if (url.indexOf("api-assets.clashroyale.com") !== -1) {
    return url.replace("https://api-assets.clashroyale.com/", "/img/");
  }
  // Other CDNs (RoyaleAPI, etc.) — use directly
  return url;
}

function fmt(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString();
}

// --------------- Debug ---------------
var debugLog = [];
function debug(msg, data) {
  var entry = "[" + new Date().toISOString().slice(11,19) + "] " + msg;
  debugLog.push(entry + (data ? " " + JSON.stringify(data) : ""));
  console.log("🔧", entry, data || "");
}
function debugDump() { return debugLog.join("\n"); }

// --------------- API ---------------
async function apiFetch(path) {
  if (location.protocol === "file:") {
    throw new Error("Run: cd ~/Documents/royal-portal && python3 serve.py\nThen open http://localhost:8090/");
  }
  var resp;
  try {
    resp = await fetch(API_ROOT + path, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error("Network error — is serve.py running? (" + e.message + ")");
  }
  if (!resp.ok) {
    if (resp.status === 404) throw new Error("Player not found. Check the tag.");
    if (resp.status === 403) throw new Error("API key rejected or rate-limited.");
    throw new Error("API error " + resp.status);
  }
  return resp.json();
}

async function fetchCards() {
  if (Object.keys(allCardsDb).length) return;
  var data = await apiFetch("/cards");

  function addCard(c, type) {
    var name = c.name.trim();
    allCardsDb[name] = {
      id: c.id, name: name,
      elixirCost: c.elixirCost != null ? c.elixirCost : "—",
      rarity: c.rarity,
      iconUrls: c.iconUrls || {},
      maxLevel: c.maxLevel || (typeof MAX_LEVELS !== "undefined" ? (MAX_LEVELS[(c.rarity || "").toLowerCase()] || 14) : 14),
      maxEvolutionLevel: c.maxEvolutionLevel,
      hasEvo: !!(c.iconUrls && c.iconUrls.evolutionMedium),
      hasHero: !!(c.iconUrls && c.iconUrls.heroMedium),
      type: type,
    };
  }

  data.items.forEach(function(c) { addCard(c, "card"); });
  (data.supportItems || []).forEach(function(c) { addCard(c, "tower"); });

  debug("cards DB loaded", {count: Object.keys(allCardsDb).length});
}

async function fetchPlayer(tag) {
  var clean = sanitizeTag(tag);
  if (!clean) throw new Error("Invalid player tag");
  return apiFetch("/players/" + encodeURIComponent(clean));
}

// --------------- Merge ---------------
function buildMergedCards(playerData) {
  var owned = {};
  (playerData.cards || []).forEach(function(c) {
    owned[c.name.trim()] = c;
  });
  // Tower troops come from supportCards, not cards
  (playerData.supportCards || []).forEach(function(c) {
    owned[c.name.trim()] = c;
  });

  mergedCards = [];
  Object.keys(allCardsDb).forEach(function(name) {
    var db = allCardsDb[name];
    var pc = owned[name] || {};
    var rarity = (pc.rarity || db.rarity || "").toLowerCase();
    var isTower = db.type === "tower";

    // All cards use MAX_LEVELS from card-data.js (game-level max)
    var maxLv = (typeof MAX_LEVELS !== "undefined" && MAX_LEVELS[rarity])
      ? MAX_LEVELS[rarity]
      : (db.maxLevel || pc.maxLevel || 14);

    // All cards use the same API→game level conversion
    var apiLv = pc.level || 0;
    var startLv = (typeof START_LEVELS !== "undefined" && START_LEVELS[rarity])
      ? START_LEVELS[rarity]
      : 1;
    var gameLv = (apiLv > 0) ? (apiLv + startLv - 1) : 0;

    // Debug raw vs transformed for first few cards
    if (Object.keys(mergedCards).length < 6) {
      debug("card:" + name, {apiLv: apiLv, gameLv: gameLv, maxLv: maxLv, rarity: rarity, isTower: isTower});
    }

    mergedCards.push({
      id: db.id,
      name: db.name,
      elixirCost: pc.elixirCost != null ? pc.elixirCost : (db.elixirCost != null ? db.elixirCost : "?"),
      rarity: rarity,
      iconUrls: pc.iconUrls || db.iconUrls || {},
      level: gameLv,       // game level for display
      lvApi: apiLv,
      maxLevel: maxLv,
      count: pc.count != null ? pc.count : 0,
      owned: !!pc.level,
      evolutionLevel: pc.evolutionLevel || 0,
      maxEvolutionLevel: pc.maxEvolutionLevel != null ? pc.maxEvolutionLevel : (db.maxEvolutionLevel || 0),
      type: db.type || "card",
    });
  });
}

// --------------- Sum remaining cards/gold to max ---------------
// Arrays: arr[N] = incremental cards to reach level N from N-1
function cardsToMax(card) {
  var arr = getCardsArray(card.rarity);
  if (!arr || card.level >= card.maxLevel) return 0;
  var sum = 0;
  for (var i = card.level + 1; i <= card.maxLevel && i < arr.length; i++) {
    sum += arr[i] || 0;
  }
  return sum;
}

function goldToMax(card) {
  if (typeof GOLD_PER_LEVEL === "undefined") return 0;
  if (card.level >= card.maxLevel) return 0;
  var sum = 0;
  for (var i = card.level + 1; i <= card.maxLevel && i < GOLD_PER_LEVEL.length; i++) {
    sum += GOLD_PER_LEVEL[i] || 0;
  }
  return sum;
}

// --------------- Next level cost ---------------
// Returns incremental cards needed for upgrade to next level
function cardsForNext(card) {
  var arr = getCardsArray(card.rarity);
  var target = card.level + 1;
  if (!arr || card.level >= card.maxLevel || target >= arr.length) return null;
  return arr[target] || null;
}

function goldForNext(card) {
  if (typeof GOLD_PER_LEVEL === "undefined") return null;
  var target = card.level + 1;
  if (card.level >= card.maxLevel || target >= GOLD_PER_LEVEL.length) return null;
  return GOLD_PER_LEVEL[target] || null;
}

// (Variant detection removed — evo/hero badges no longer displayed)

// --------------- Main load ---------------
async function loadPlayer(tag) {
  debugLog.length = 0;
  debug("loadPlayer", {tag: tag});
  setLoading("Loading…");

  try {
    await fetchCards();
    setLoading("Loading cards…");
    var data = await fetchPlayer(tag);
    debug("player ok", {name: data.name});

    currentPlayerTag = sanitizeTag(tag) || tag;
    buildMergedCards(data);
    currentPlayerData = data;
    currentFavCard = data.currentFavouriteCard ? String(data.currentFavouriteCard.name).trim() : null;
    currentTower = (data.currentDeckSupportCards && data.currentDeckSupportCards[0])
      ? String(data.currentDeckSupportCards[0].name).trim() : null;
    currentDeck = (data.currentDeck || []).map(function(c) {
      return { name: String(c.name).trim(), slot: "normal" };
    });

    // A shared link carries a deck + tower; apply it once, over the API deck.
    if (pendingShared) {
      var known = {};
      mergedCards.forEach(function(c) { known[c.name] = true; });
      var sharedDeck = (pendingShared.deck || []).filter(function(d) { return known[d.name]; });
      if (sharedDeck.length) currentDeck = sharedDeck;
      if (pendingShared.tower && known[pendingShared.tower]) currentTower = pendingShared.tower;
      pendingShared = null;
    }
    autoAssignCurrentDeck();

    pnameEl.textContent = data.name || "—";
    // The input and the bar used to show the same tag side by side with no
    // label, which read as a duplicate. The input is "look up", the chip is
    // "viewing" — and the input now always mirrors what is actually loaded.
    ptagEl.innerHTML = '<i class="fa-solid fa-hashtag" aria-hidden="true"></i>' +
      currentPlayerTag.replace("#", "");
    tagInput.value = currentPlayerTag;
    var total = mergedCards.length;
    var owned = 0;
    mergedCards.forEach(function(c) { if (c.owned) owned++; });
    pstatsEl.textContent = owned + " / " + total + " cards · Lv " + (data.expLevel || "?");
    playerBar.classList.remove("hidden");

    renderCards();
    renderDeckBuilder();
    renderSuggestions();
    await loadBattlelog(currentPlayerTag);
    renderBattles();
    debugLevels();
    showContent();
    cacheStatus.classList.add("hidden");
    debug("done");
  } catch (err) {
    debug("ERROR", {msg: err.message});
    console.error(debugDump());
    showError(err.message + "\n\n—— debug ——\n" + debugDump());
  }
}

// --------------- Level Debug ---------------
function debugLevels() {
  console.log("═══════════════════════════════════════════════");
  console.log("  LEVEL DEBUG — all cards");
  console.log("  gameLv=displayed  apiLv=raw  max=gameMax  *=maxed  ~=unowned");
  console.log("═══════════════════════════════════════════════");
  var mismatches = [];
  mergedCards.forEach(function(c, i) {
    var tag = "";
    if (!c.owned) tag += "~";
    else if (c.level >= c.maxLevel) tag += "*";
    var line = (i+1) + ". " + pad(c.name, 22) + " gameLv=" + c.level + tag + " apiLv=" + c.lvApi + " max=" + c.maxLevel + " " + c.rarity;
    console.log("  " + line);
    if (c.level > c.maxLevel) mismatches.push(c.name + " lv=" + c.level + " > max=" + c.maxLevel);
  });
  if (mismatches.length) {
    console.log("  ⚠ Cards where lv > maxLv:", mismatches.length);
    mismatches.forEach(function(m) { console.log("    " + m); });
  }
  // Show all unique rarities in the dataset
  var rarities = {};
  mergedCards.forEach(function(c) { rarities[c.rarity] = (rarities[c.rarity] || 0) + 1; });
  var rarStr = Object.keys(rarities).sort().map(function(r) { return r + "=" + rarities[r]; }).join(", ");
  console.log("  RARITIES IN DATA: " + rarStr);
  console.log("  MAX_LEVELS: " + (typeof MAX_LEVELS !== "undefined" ? JSON.stringify(MAX_LEVELS) : "UNDEFINED"));
  console.log("  START_LEVELS: " + (typeof START_LEVELS !== "undefined" ? JSON.stringify(START_LEVELS) : "UNDEFINED"));
  console.log("═══════════════════════════════════════════════");
  debug("level dump complete", {total: mergedCards.length, maxed: mergedCards.filter(function(c){return c.owned && c.level>=c.maxLevel;}).length});
}

function pad(s, n) { while (s.length < n) s += " "; return s; }

// --------------- Render ---------------
function renderCards() {
  var sort  = sortSelect ? sortSelect.value : "level";
  var query = searchInput ? searchInput.value.toLowerCase().trim() : "";

  var cards = mergedCards.slice();

  // Filter by selected rarities (empty set = show all)
  // "tower" in selectedRarities filters by card type, not rarity
  if (selectedRarities.size > 0) {
    var showTower = selectedRarities.has("tower");
    cards = cards.filter(function(c) {
      if (c.type === "tower") return showTower;
      return selectedRarities.has(c.rarity);
    });
  }

  // Filter by collection status: owned, undiscovered, evolution, hero
  if (statusFilter !== "all") {
    cards = cards.filter(function(c) {
      var f = cardFlags(c);
      switch (statusFilter) {
        case "owned":        return c.owned;
        case "undiscovered": return !c.owned;
        case "evo-capable":  return f.evoMax > 0;
        case "evo-unlocked": return f.evoUnlocked;
        case "hero-capable": return f.heroCapable;
      }
      return true;
    });
  }

  // Filter by search
  if (query) {
    cards = cards.filter(function(c) { return c.name.toLowerCase().indexOf(query) !== -1; });
  }

  // Sort
  if (sort === "rarity-group") {
    cards.sort(function(a, b) {
      var ri = RARITY_ORDER.indexOf(a.rarity);
      var rj = RARITY_ORDER.indexOf(b.rarity);
      if (ri === -1) ri = 99;
      if (rj === -1) rj = 99;
      return ri - rj || (b.level || 0) - (a.level || 0);
    });
  } else if (sort === "upgrade") {
    // Upgrade priority: cards closest to next level first, then by rarity, then by name
    cards.sort(function(a, b) {
      function group(c) {
        if (!c.owned) return 4;           // unowned last
        if (c.level >= c.maxLevel) return 3; // maxed
        var need = cardsForNext(c);
        if (need == null || need <= 0) return 3;
        return (c.count || 0) >= need ? 1 : 2; // can upgrade vs needs cards
      }

      var ga = group(a), gb = group(b);
      if (ga !== gb) return ga - gb;

      // Within same group, sort by progress
      function progress(c) {
        if (!c.owned || c.level >= c.maxLevel) return 0;
        var need = cardsForNext(c);
        if (need == null || need <= 0) return 0;
        return Math.min(100, Math.round((c.count || 0) / need * 100));
      }

      var pa = progress(a), pb = progress(b);
      if (pa !== pb) return pb - pa;

      // Then by rarity
      var ra = RARITY_ORDER.indexOf(a.rarity);
      var rb = RARITY_ORDER.indexOf(b.rarity);
      if (ra === -1) ra = 99;
      if (rb === -1) rb = 99;
      if (ra !== rb) return ra - rb;

      return a.name.localeCompare(b.name);
    });
  } else {
    // Default: level descending
    cards.sort(function(a, b) {
      return (b.level || 0) - (a.level || 0) || a.name.localeCompare(b.name);
    });
  }

  var total = mergedCards.length;
  var shown = cards.length;
  if (countLabel) {
    countLabel.textContent = shown < total ? shown + " / " + total : total + " cards";
  }
  updateFiltersSummary();

  if (!cards.length) {
    cardGrid.innerHTML = '<div class="empty-state"><strong>Nothing matches those filters.</strong><br />' +
      'Clear the search box, or set Status back to "All statuses" and Rarity to "All rarities".</div>';
    return;
  }

  cardGrid.innerHTML = "";
  var frag = document.createDocumentFragment();

  cards.forEach(function(card) {
    var r      = card.rarity;
    var lv     = card.level;
    var maxLv  = card.maxLevel;
    var owned  = card.owned;
    var rawImg  = card.iconUrls && card.iconUrls.medium ? card.iconUrls.medium : "";
    var img     = proxyImg(rawImg, card.name);
    var fallback = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#232544" width="40" height="40"/><text x="20" y="22" text-anchor="middle" fill="#8b8da8" font-size="12">?</text></svg>');
    if (card.name === "Ronin") debug("Ronin img", {original: rawImg, proxied: img, fallback: fallback.substring(0,60)});
    var isMaxed = owned && lv >= maxLv;
    var color  = rarityColor(r);
    var f      = cardFlags(card);

    var div = document.createElement("div");
    div.className = "card-item rarity-" + r + (owned ? " owned" : "") + (isMaxed ? " maxed" : "") + (card.type === "tower" ? " tower-type" : "") + (f.evoMax > 0 ? " evo-card" : "") + (f.heroCapable ? " hero-card" : "") + (!owned ? " undiscovered" : "");

    // Card body text (for owned non-maxed cards, including tower troops)
    var bodyExtraHtml = "";
    if (owned && !isMaxed) {
      var needNext = cardsForNext(card);
      var have     = card.count || 0;
      var pctNext = needNext > 0 ? Math.min(100, Math.round(have / needNext * 100)) : 0;
      var canUp   = needNext > 0 && have >= needNext;

      // "Lv14  12/20" — the two numbers are the card level and the wild
      // cards you hold against the cost of the next level, so the bar under
      // them has something to measure.
      bodyExtraHtml += '<div class="ci-lv"><span>Lv' + lv + "</span>" +
        '<span class="ci-need' + (canUp ? " can-up" : "") + '" title="' +
        have + " of the " + (needNext != null ? needNext : "?") +
        " wild cards needed for level " + (lv + 1) + (canUp ? " — ready to upgrade" : "") + '">' +
        have + " / " + (needNext != null ? needNext : "—") + "</span></div>";
      bodyExtraHtml += '<div class="ci-bar' + (canUp ? ' full' : '') + '" role="img" aria-label="' +
        pctNext + '% of the cards needed for level ' + (lv + 1) + '">' +
        '<div class="ci-fill" style="width:' + pctNext + '%"></div></div>';
    } else if (isMaxed) {
      bodyExtraHtml += '<div class="ci-lv"><span>Lv' + lv + '</span><span class="ci-maxed">MAX</span></div>';
    } else {
      bodyExtraHtml += '<div class="ci-lv"><span class="ci-undiscovered">Not discovered</span></div>';
    }

    // Evolution / hero / role badges — the collection shows what the player has
    if (f.evoMax > 0) {
      bodyExtraHtml += '<div class="ci-badge ' + (f.evoUnlocked ? "ci-badge-on" : "ci-badge-off") + '">' +
        '<i class="fa-solid fa-bolt" aria-hidden="true"></i> Evo ' + f.evoLevel + '/' + f.evoMax + '</div>';
    }
    if (f.heroCapable) {
      bodyExtraHtml += '<div class="ci-badge ci-hero">' +
        '<i class="fa-solid fa-star" aria-hidden="true"></i> Hero +' + (f.hero ? f.hero.abilityCost : 0) + '⚡</div>';
    }
    if (f.role && f.role !== "unknown") {
      bodyExtraHtml += '<div class="ci-role">' + f.role + '</div>';
    }

    div.innerHTML =
      '<div class="card-img-wrap">' +
        '<img src="' + img + '" alt="' + card.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + fallback + '\'" />' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-rarity" style="color:' + color + '">' + (card.type === "tower" ? "Tower troop" : r) + "</div>" +
        '<div class="card-n"><span class="card-n-text">' + card.name + "</span></div>" +
        bodyExtraHtml +
      '</div>';

    frag.appendChild(div);
  });

  cardGrid.appendChild(frag);
}

// --------------- Rarity Multi-Select ---------------
function updateRarities() {
  var checks = msDropdown.querySelectorAll('input[type="checkbox"]');
  var allCb = null;
  selectedRarities = new Set();

  checks.forEach(function(cb) {
    if (cb.value === "all") { allCb = cb; return; }
    if (cb.checked) selectedRarities.add(cb.value);
  });

  // If "All" is checked or nothing selected → show all
  if (allCb && allCb.checked) {
    selectedRarities = new Set();
    // Uncheck all specific when All is checked
    checks.forEach(function(cb) {
      if (cb.value !== "all") cb.checked = false;
    });
  } else if (selectedRarities.size === 0 && allCb) {
    allCb.checked = true;
  }

  // Update button label
  if (selectedRarities.size === 0) {
    msBtn.innerHTML = 'All rarities <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
  } else {
    var names = Array.from(selectedRarities).map(function(v) {
      return v === "tower" ? "Tower" : v.charAt(0).toUpperCase() + v.slice(1);
    });
    msBtn.innerHTML = names.join(", ") + ' <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
  }

  renderCards();
}

// --------------- Events ---------------
lookupForm.addEventListener("submit", function(e) {
  e.preventDefault();
  var tag = tagInput.value.trim();
  if (tag) loadPlayer(tag);
});

mineBtn.addEventListener("click", function() {
  if (typeof DEFAULT_PLAYER_TAG !== "undefined" && DEFAULT_PLAYER_TAG) {
    tagInput.value = DEFAULT_PLAYER_TAG;
    loadPlayer(DEFAULT_PLAYER_TAG);
  }
});

// Multi-select dropdown
msBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  msDropdown.classList.toggle("open");
});

msDropdown.addEventListener("change", function(e) {
  var cb = e.target;
  if (cb.value === "all" && cb.checked) {
    // "All" checked → uncheck everything else
    msDropdown.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
      c.checked = (c.value === "all");
    });
  } else if (cb.checked) {
    // A specific box checked → uncheck "All"
    var allCb = msDropdown.querySelector('input[value="all"]');
    if (allCb) allCb.checked = false;
  }
  updateRarities();
});

// Close dropdown when clicking outside
document.addEventListener("click", function() {
  msDropdown.classList.remove("open");
});

// The rarity / status / sort selects are behind a toggle on phones (they are
// ~200px of chrome above a card grid otherwise). The button says how many
// filters are live so a collapsed panel is never silently wrong.
function activeFilterCount() {
  var n = selectedRarities.size;
  if (statusFilter !== "all") n++;
  if (sortSelect && sortSelect.value !== "upgrade") n++;
  return n;
}

function updateFiltersSummary() {
  if (!filtersSummary) return;
  var n = activeFilterCount();
  filtersSummary.textContent = n ? " · " + n : "";
  filtersSummary.classList.toggle("on", n > 0);
}

filtersToggle && filtersToggle.addEventListener("click", function() {
  var open = controlsEl.classList.toggle("filters-open");
  filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
  filtersToggle.querySelector(".fa-chev").classList.toggle("up", open);
});

sortSelect.addEventListener("change", renderCards);
searchInput.addEventListener("input", renderCards);


// --------------- Deck Builder ---------------
function deckIndex() {
  var idx = {};
  mergedCards.forEach(function(c) { idx[c.name] = c; });
  return idx;
}

function deckCardObjs() {
  var idx = deckIndex();
  return currentDeck.map(function(d) { return idx[d.name]; }).filter(Boolean);
}

// Slot capacity + "only cards that belong in a slot may occupy it".
function slotViolations() {
  var idx = deckIndex();
  var counts = { champion: 0, evolution: 0, hero: 0, wild: 0 };
  var REASON = {
    champion: "champion cards only",
    evolution: "evolution cards only",
    hero: "hero-capable cards only",
    wild: "champion, hero, or evolution cards only",
  };
  var v = [];
  currentDeck.forEach(function(d) {
    var c = idx[d.name];
    if (!c) return;
    if (counts[d.slot] === undefined) return;   // normal slot accepts anything
    var f = cardFlags(c);
    var ok = d.slot === "champion" ? f.isChampion
      : d.slot === "evolution" ? f.evoCapable
      : d.slot === "hero" ? f.heroCapable
      : (f.isChampion || f.heroCapable || f.evoCapable);
    if (!ok) { v.push(d.name + " cannot go in the " + d.slot + " slot (" + REASON[d.slot] + ")"); return; }
    counts[d.slot]++;
  });
  Object.keys(counts).forEach(function(s) {
    if (counts[s] > 1) v.push("Only one card can occupy the " + s + " slot (has " + counts[s] + ")");
  });
  return v;
}

function slotFits(f, slot) {
  if (slot === "normal" || !slot) return true;
  if (slot === "champion")  return f.isChampion;
  if (slot === "evolution") return f.evoCapable;
  if (slot === "hero")      return f.heroCapable;
  return f.isChampion || f.heroCapable || f.evoCapable;   // wild
}

// The slot a card would take if it were added right now: champion beats
// evolution beats hero beats wild, skipping anything already occupied.
function pickSlotFor(name) {
  var f = cardFlags(deckIndex()[name] || {});
  var taken = {};
  currentDeck.forEach(function(d) { if (d.slot && d.slot !== "normal") taken[d.slot] = true; });
  var order = f.isChampion ? ["champion", "wild"]
    : f.evoCapable ? ["evolution", "wild"]
    : f.heroCapable ? ["hero", "wild"] : [];
  for (var i = 0; i < order.length; i++) if (!taken[order[i]]) return order[i];
  return "normal";
}

// Fill the special slots the moment a deck arrives (API deck, reset button),
// the same way applyDeck() seeds an archetype. Manual picks are never moved.
function autoAssignCurrentDeck() {
  var assigned = assignSlots(deckCardObjs());
  var taken = {};
  currentDeck.forEach(function(d) { if (d.slot && d.slot !== "normal") taken[d.slot] = true; });
  currentDeck.forEach(function(d) {
    if (d.slot && d.slot !== "normal") return;
    var want = assigned.slots[d.name];
    if (want && want !== "normal" && !taken[want]) { d.slot = want; taken[want] = true; }
  });
}

// Slot picker. Special slots that another card already occupies are marked,
// and the slots this card cannot legally fill are greyed out rather than
// removed — you can still try, the rule check explains what went wrong.
var pickFilterInputEl = document.getElementById("pick-filter");
pickFilterInputEl && pickFilterInputEl.addEventListener("input", function() {
  pickFilter = pickFilterInputEl.value;
  renderPickList(pickFilter);
});

function slotOptions(sel, name) {
  var taken = {};
  currentDeck.forEach(function(d) { if (d.slot && d.slot !== "normal" && d.name !== name) taken[d.slot] = true; });
  var f = name ? cardFlags(deckIndex()[name] || {}) : null;
  return SLOT_RULES.slots.map(function(s) {
    var legal = true;
    if (s !== "normal" && f) {
      legal = s === "wild" ? !!(f.isChampion || f.evoCapable || f.heroCapable)
        : s === "champion" ? !!f.isChampion
        : s === "evolution" ? !!f.evoCapable
        : !!f.heroCapable;
      if (s === "evolution" && !f.evoCapable) legal = false;
      if (s === "hero" && !f.heroCapable) legal = false;
      if (s === "champion" && !f.isChampion) legal = false;
    }
    var suffix = "";
    if (s !== "normal" && taken[s]) suffix = " (taken)";
    else if (s !== "normal" && !legal) suffix = " (n/a)";
    return '<option value="' + s + '"' + (s === sel ? " selected" : "") + (suffix ? ' class="ds-slot-dim"' : "") + ">" +
      s + (suffix ? " " + suffix : "") + "</option>";
  }).join("");
}

// --------------- Pick list ---------------
// The card picker under the deck. `filter` accepts free text (card name, role,
// "evo" / "hero" / "champion") or one of the special slot names, which is what
// the free-slot chips in the stats panel pass in.
function renderPickList(filter) {
  if (!pickListEl) return;
  var q = String(filter == null ? pickFilter : filter).trim().toLowerCase();
  var inDeck = {};
  currentDeck.forEach(function(d) { inDeck[d.name] = true; });
  var pickFilterEl0 = document.getElementById("pick-filter");
  if (pickFilterEl0) pickFilterEl0.value = q;

  var wantSlot = q === "champion" || q === "evolution" || q === "hero" || q === "wild";
  var picks = mergedCards.filter(function(c) {
    if (!c.owned || c.type === "tower" || inDeck[c.name]) return false;
    if (wantSlot) {
      var sf = cardFlags(c);
      if (q === "champion") return sf.isChampion;
      if (q === "evolution") return sf.evoCapable;
      if (q === "hero") return sf.heroCapable;
      return sf.isChampion || sf.evoCapable || sf.heroCapable;
    }
    if (!q) return true;
    return c.name.toLowerCase().indexOf(q) !== -1 || cardFlags(c).role.indexOf(q) !== -1;
  });

  // An unfiltered collection is ~120 rows, which buries everything above it.
  // Show a working set and say how many are hidden; any filter shows them all.
  var PICK_CAP = 24;
  var shown = picks;
  var hidden = 0;
  if (!q && picks.length > PICK_CAP) {
    shown = picks.slice(0, PICK_CAP);
    hidden = picks.length - PICK_CAP;
  }

  var full = currentDeck.length >= DECK_SIZE;
  pickListEl.innerHTML = shown.map(function(c) {
    var f = cardFlags(c);
    var m = [];
    if (f.evoUnlocked) m.push("evo " + f.evoLevel + "/" + f.evoMax);
    if (f.heroCapable) m.push("hero");
    if (f.isChampion) m.push("champion");
    if (f.role && f.role !== "unknown") m.push(f.role);
    var slot = pickSlotFor(c.name);
    return '<button class="pick" data-name="' + c.name + '"' + (full ? " disabled" : "") +
      ' title="' + (full ? "Deck is full — remove a card first" : "Add " + c.name + " to the deck" +
        (slot !== "normal" ? " in the " + slot + " slot" : "")) + '">' +
      '<img src="' + proxyImg(c.iconUrls.medium, c.name) + '" alt="" loading="lazy" />' +
      "<span>" + c.name + "</span>" +
      '<span class="pick-meta">Lv' + c.level + " · " + c.elixirCost + "⚡" +
        (m.length ? " · " + m.join(" · ") : "") + "</span>" +
      '<span class="pick-add" aria-hidden="true"><i class="fa-solid fa-plus"></i></span>' +
    "</button>";
  }).join("") || '<div class="empty-state">' +
    (wantSlot ? "Nothing you own fits this slot — clear the filter to see everything." : "Nothing matches that filter.") + "</div>";

  if (hidden) {
    pickListEl.innerHTML += '<div class="pick-more">Showing ' + shown.length + " of " + picks.length +
      " cards you own — search above to narrow it down.</div>";
  }

  // The heading tells you how much room is left, which is the first thing you
  // need to know before scrolling a list you cannot add to.
  var pickCountEl = document.getElementById("pick-count");
  if (pickCountEl) {
    var left = DECK_SIZE - currentDeck.length;
    pickCountEl.textContent = full
      ? "· deck full at " + DECK_SIZE + " — remove a card to add more"
      : "· " + left + " slot" + (left === 1 ? "" : "s") + " left · " + picks.length + " cards to choose from";
    pickCountEl.className = "pick-count" + (full ? " full" : "");
  }
}

// Clicking a free special slot in the stats panel narrows the pick list to
// cards that can legally occupy it.
deckStatsEl && deckStatsEl.addEventListener("click", function(e) {
  var chip = e.target.closest(".chip-action[data-slot]");
  if (chip) {
    var slot = chip.dataset.slot;
    pickFilter = slot;
    renderPickList(slot);
    var picker = document.querySelector(".deck-picker");
    if (picker) picker.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

// `toggle` does not bubble, so it is caught in the capture phase; a click
// listener would read the value before the summary's default action runs.
deckStatsEl && deckStatsEl.addEventListener("toggle", function(e) {
  var more = e.target.closest && e.target.closest(".ds-more");
  if (more) deckDetailsOpen = more.open;
}, true);

// What the slot picker controls, restated on the control itself.
function slotSelectLabel(sel) {
  var COPY = {
    normal: "Normal slot — plays as a plain card",
    champion: "Champion slot — champion ability active",
    evolution: "Evolution slot — evolved form active",
    hero: "Hero slot — hero ability active",
    wild: "Wild slot — accepts a champion, hero or evolution",
  };
  return COPY[sel] || sel;
}

// The three things you do here, in order, with the first unmet step marked as
// current so the tab answers "what do I do first?" without a tooltip.
var DECK_STEPS = [
  { n: 1, label: "Fill the 8 cards",     hint: "Pick from your collection below" },
  { n: 2, label: "Seat all 4 special slots", hint: "Champion · evolution · hero · wild" },
  { n: 3, label: "Score 80 or better",  hint: "The grade is the weight of every check you pass" },
];

function renderDeckGuide(cards, specials, an) {
  var el = document.getElementById("deck-guide");
  if (!el) return;
  var done = [
    cards.length >= DECK_SIZE,
    specials.length >= 4,
    !!(an && cards.length && an.score >= 80),
  ];
  var current = done.indexOf(false);
  if (current === -1) current = DECK_STEPS.length - 1;

  el.innerHTML =
    '<ol class="guide-steps">' + DECK_STEPS.map(function(s, i) {
      var state = done[i] ? "done" : (i === current ? "current" : "todo");
      return '<li class="guide-step ' + state + '">' +
        '<span class="guide-num" aria-hidden="true">' +
          (done[i] ? '<i class="fa-solid fa-check"></i>' : s.n) + "</span>" +
        '<span class="guide-text"><strong>' + s.label + "</strong>" + s.hint + "</span>" +
      "</li>";
    }).join("") + "</ol>" +
    '<div class="guide-meter">' +
      '<span class="guide-meter-cell"><b>' + cards.length + "</b> / " + DECK_SIZE + " cards</span>" +
      '<span class="guide-meter-cell"><b>' + specials.length + "</b> / 4 slots active</span>" +
      '<span class="guide-meter-cell' + (an && cards.length ? " has-grade" : "") + '">' +
        "<b>" + (an && cards.length ? gradeText(an.grade, an.score) : "—") + "</b> deck score</span>" +
    "</div>";
}

function renderDeckBuilder() {
  if (!deckSlotsEl) return;
  var idx = deckIndex();

  if (towerSelect) {
    towerSelect.innerHTML = TOWER_TROOPS.map(function(t) {
      var c = idx[t];
      var sel = t === currentTower ? " selected" : "";
      return '<option value="' + t + '"' + sel + ">" + t +
        (c && c.owned ? " (Lv" + c.level + ")" : " (not owned)") + "</option>";
    }).join("");
  }

  deckSlotsEl.innerHTML = currentDeck.map(function(d, i) {
    var c = idx[d.name];
    var f = c ? cardFlags(c) : null;
    var img = c ? proxyImg(c.iconUrls && c.iconUrls.medium ? c.iconUrls.medium : "", d.name) : "";
    var cls = f ? (f.isChampion ? " slot-champion" : f.heroCapable ? " slot-hero" : f.evoUnlocked ? " slot-evo" : "") : "";
    var marks = "";
    if (f) {
      if (f.evoUnlocked) marks += ' <i class="fa-solid fa-bolt" aria-hidden="true"></i>';
      if (f.heroCapable) marks += ' <i class="fa-solid fa-star" aria-hidden="true"></i>';
    }

    // A card only activates its special form in a matching special slot, so
    // say which form this one is playing in rather than what it could play in.
    var slot = d.slot || "normal";
    var badges = "";
    if (f) {
      if (slot === "champion") badges += '<span class="ds-badge b-champion"><i class="fa-solid fa-crown" aria-hidden="true"></i>Champion</span>';
      else if (slot === "evolution") badges += '<span class="ds-badge b-evo"><i class="fa-solid fa-bolt" aria-hidden="true"></i>' +
        (f.evoUnlocked ? "Evolution " + f.evoLevel + "/" + f.evoMax : "Evolution") + "</span>";
      else if (slot === "hero") badges += '<span class="ds-badge b-hero"><i class="fa-solid fa-star" aria-hidden="true"></i>' +
        (f.hero ? "Hero +" + f.hero.abilityCost + "⚡" : "Hero") + "</span>";
      else if (slot === "wild") badges += '<span class="ds-badge b-wild"><i class="fa-solid fa-clover" aria-hidden="true"></i>Wild slot</span>';
      else if (f.isChampion || f.evoCapable || f.heroCapable) badges += '<span class="ds-badge b-off">plain card</span>';
      if (f.role && f.role !== "unknown") badges += '<span class="ds-badge b-role">' + f.role + "</span>";
    }

    var cost = c && typeof c.elixirCost === "number" ? c.elixirCost : null;
    return '<div class="deck-slot' + cls + '">' +
      '<img src="' + img + '" alt="' + d.name + '" loading="lazy" />' +
      '<div class="ds-info">' +
        '<div class="ds-name">' + d.name + marks + "</div>" +
        '<div class="ds-meta">' + (c && c.owned ? "Lv" + c.level : "not owned") +
          " · " + (cost != null ? cost + "⚡" : "?⚡") + "</div>" +
      "</div>" +
      '<button class="ds-remove" data-i="' + i + '" title="Remove ' + d.name + ' from the deck" aria-label="Remove ' + d.name + ' from the deck">' +
        '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
      '<select class="ds-slot" data-i="' + i + '" title="' + slotSelectLabel(slot) +
        '" aria-label="Slot for ' + d.name + '">' + slotOptions(d.slot) + "</select>" +
      (badges ? '<div class="ds-badges">' + badges + "</div>" : "") +
      '<div class="ds-elixir' + (cost != null && cost <= 2 ? " cheap" : "") + '">' +
        '<span class="ds-elixir-track"><i style="width:' + (cost != null ? Math.round(cost / 10 * 100) : 0) + '%"></i></span>' +
        '<span class="ds-elixir-num">' + (cost != null ? cost + "⚡" : "?⚡") + "</span>" +
        '<span class="ds-elixir-cap">cost</span>' +
      "</div>" +
    "</div>";
  }).join("") || '<div class="empty-state"><strong>No cards in the deck yet.</strong><br />' +
    "Pick 8 from the list below, or press <strong>Auto-fill</strong> and let it build one from what you own.</div>";

  var cards = deckCardObjs();
  var an = analyzeDeck(cards, currentTower);
  var specials = currentDeck.filter(function(d) { return d.slot && d.slot !== "normal"; });

  renderDeckGuide(cards, specials, an);

  if (deckSummaryEl) {
    // Orientation only: how big the deck is, how it scores, and which special
    // slots are live. The elixir breakdown lives in the stats panel below, so
    // nothing is stated twice.
    deckSummaryEl.innerHTML =
      '<div class="dsum-cells">' +
        '<div class="dsum-cell' + (cards.length === DECK_SIZE ? " ok" : " warn") + '">' +
          '<span class="dsum-val">' + cards.length + '<small>/' + DECK_SIZE + "</small></span>" +
          "<span class=dsum-lbl>cards in deck</span></div>" +
        '<div class="dsum-cell"><span class="dsum-val">' + an.avg.toFixed(2) +
          "<small>⚡</small></span><span class=dsum-lbl>average elixir per card</span></div>" +
        '<div class="dsum-cell grade-' + an.grade.toLowerCase() + '">' +
          '<span class="dsum-val">' + gradeText(an.grade, an.score) + "</span>" +
          "<span class=dsum-lbl>deck score out of 100</span></div>" +
        '<div class="dsum-cell' + (specials.length === 4 ? " ok" : "") + '">' +
          '<span class="dsum-val">' + specials.length + "<small>/4</small></span>" +
          "<span class=dsum-lbl>special slots active</span></div>" +
      "</div>" +
      '<div class="dsum-tail">' +
        '<span class="dsum-meta"><span class="dsum-chip">' +
          '<i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i> Tower: <strong>' +
          (currentTower || "—") + "</strong>" +
          (idx[currentTower] && idx[currentTower].owned ? " · Lv" + idx[currentTower].level : "") +
        "</span></span>" +
      "</div>" +
      '<div class="dsum-slots">' + (specials.length
        ? "Playing as a special form: " + specials.map(function(s) {
            return "<span>" + s.name + " <i>→</i> " + s.slot + "</span>";
          }).join("")
        : "<span class=dim>No special slot is filled — every card plays as its plain form.</span>") + "</div>";
  }

  var v = deckViolations(cards, currentTower).concat(slotViolations());
  var notes = deckNotes(cards);
  if (deckCheckEl) {
    deckCheckEl.className = "deck-check " + (v.length ? "has-issues" : (notes.length ? "has-notes" : "ok"));
    deckCheckEl.innerHTML = v.length
      ? '<h3><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ' + v.length +
        " rule" + (v.length === 1 ? "" : "s") + " to fix</h3><ul>" +
        v.map(function(x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"
      : '<h3><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Legal deck</h3>' +
        "<p>" + cards.length + " cards, no duplicates, slot ceilings respected, tower troop equipped.</p>" +
        (notes.length ? '<div class="deck-note"><h4>Worth knowing</h4><ul>' + notes.map(function(x) { return "<li>" + x + "</li>"; }).join("") + "</ul></div>" : "");
  }

  renderDeckVerdict(cards, an);
  renderDeckStats(cards);
  renderDeckAnalysis(an);

  renderPickList();
  writeHash();
}

// --------------- Deck analysis panel ---------------
// The one thing you want from the deck tab is "how good is this, and what do
// I change?" — so it is pinned directly under the 8 cards, above the rule
// check, the elixir maths and the full checklist.
function renderDeckVerdict(cards, an) {
  if (!deckVerdictEl) return;
  if (!cards.length) { deckVerdictEl.innerHTML = ""; deckVerdictEl.classList.add("hidden"); return; }
  deckVerdictEl.classList.remove("hidden");
  deckVerdictEl.className = "deck-verdict grade-" + an.grade.toLowerCase();

  var failing = an.missing.slice().sort(function(a, b) { return b.weight - a.weight; });
  var top = failing.slice(0, 3);

  var pool = mergedCards.filter(function(c) { return c.owned && c.type !== "tower"; });
  var swaps = failing.length ? swapSuggestions(cards, pool) : [];
  var best = swaps[0];

  var html = '<div class="dv-head">' +
    '<span class="dv-grade">' + gradeText(an.grade, an.score) + "</span>" +
    '<span class="dv-note">' + (failing.length
      ? "out of 100 · " + failing.length + " check" + (failing.length === 1 ? "" : "s") + " still failing"
      : "out of 100 · every coverage check passes") + "</span>" +
  "</div>";

  if (top.length) {
    html += '<div class="dv-gaps">' + top.map(function(c) {
      return '<div class="dv-gap" title="' + c.detail + '">' +
        '<i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>' +
        '<span class="dv-gap-label">' + c.label + "</span>" +
        '<span class="da-need">' + c.need + "</span>" +
        '<span class="dv-gap-w">−' + c.weight + "</span>" +
      "</div>";
    }).join("") + "</div>";
  }

  if (best) {
    html += '<button class="dv-swap" data-in="' + best.inn + '" data-out="' + best.out + '"' +
      ' title="Swap ' + best.inn + ' in for ' + best.out + ' — fixes ' + best.label + '">' +
      '<img src="' + proxyImg((allCardsDb[best.inn] || {}).iconUrls ? allCardsDb[best.inn].iconUrls.medium : "", best.inn) + '" alt="" loading="lazy" />' +
      "<span><b>Best swap</b> " + best.inn + " for " + best.out + "</span>" +
      '<em>fixes ' + best.label + "</em>" +
    "</button>";
  }

  deckVerdictEl.innerHTML = html;
}

deckVerdictEl && deckVerdictEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".dv-swap");
  if (btn) swapInDeck(btn.dataset.in, btn.dataset.out);
});

// --------------- Deck statistics ---------------
// Pure read-out of the deck's elixir maths. Ability costs are deliberately
// NOT part of average elixir or the cycle costs (they are single-use, off the
// 10-cycle clock) — they get their own row so the numbers stay comparable.
function deckStats(cards) {
  var rows = cards.map(function(c) {
    return {
      name: c.name,
      card: c,
      cost: typeof c.elixirCost === "number" ? c.elixirCost : 4,
      flags: cardFlags(c),
    };
  });
  var sorted = rows.slice().sort(function(a, b) { return a.cost - b.cost; });
  var cheap4 = sorted.slice(0, 4);
  var total = rows.reduce(function(a, r) { return a + r.cost; }, 0);
  var ladder = {};
  rows.forEach(function(r) { ladder[r.cost] = (ladder[r.cost] || 0) + 1; });
  var winCond = rows.filter(function(r) { return r.flags.role === "win-condition"; });
  var spells = rows.filter(function(r) { return r.flags.role === "spell"; });
  var actives = currentDeck.filter(function(d) { return d.slot && d.slot !== "normal"; });
  return {
    rows: rows, sorted: sorted, cheap4: cheap4, total: total, ladder: ladder,
    avg: rows.length ? total / rows.length : 0,
    cycle: cheap4.reduce(function(a, r) { return a + r.cost; }, 0),
    winCond: winCond, spells: spells, actives: actives,
    spellAvg: spells.length ? spells.reduce(function(a, r) { return a + r.cost; }, 0) / spells.length : null,
    cheapestWin: winCond.length ? winCond.reduce(function(a, b) { return a.cost <= b.cost ? a : b; }) : null,
  };
}

function renderDeckStats(cards) {
  if (!deckStatsEl) return;
  if (!cards.length) { deckStatsEl.innerHTML = ""; return; }
  var s = deckStats(cards);
  var cheapestSpells = s.spells.slice().sort(function(a, b) { return a.cost - b.cost; });

  var html = '<div class="ds-metrics">' +
    metric(s.avg.toFixed(2) + "⚡", "average elixir", s.avg <= 4.0 ? "good" : "warn") +
    metric(s.cycle + "⚡", "4-card cycle", s.cycle <= 9 ? "good" : "") +
    metric(s.total + "⚡", "full 8-card cycle", "") +
    metric(s.cheapestWin ? s.cheapestWin.cost + "⚡" : "—", "cheapest win condition",
      s.cheapestWin && s.cheapestWin.cost <= 4 ? "good" : "") +
    metric(s.spellAvg != null ? s.spellAvg.toFixed(1) + "⚡" : "—", "average spell", "") +
    metric(s.actives.length + "/4", "special slots active", s.actives.length ? "good" : "") +
  "</div>";

  // The cheapest four are what you can actually cycle in a push.
  html += '<div class="ds-cycle"><h4>Cheapest 4-card cycle <span>' + s.cycle + "⚡ of elixir</span></h4>" +
    s.cheap4.map(function(r) {
      return '<span class="ds-cycle-card">' +
        '<img src="' + proxyImg((allCardsDb[r.name] || {}).iconUrls ? allCardsDb[r.name].iconUrls.medium : "", r.name) + '" alt="" loading="lazy" />' +
        r.name + " <b>" + r.cost + "⚡</b></span>";
    }).join("") + "</div>";

  // Elixir ladder + hero abilities + rotation timing: the deep read-out. It is
  // a page of chrome on a phone and none of it changes the grade, so it folds
  // away; the state is remembered so a re-render cannot slam it shut.
  var keys = Object.keys(s.ladder).map(Number).sort(function(a, b) { return a - b; });
  var maxCount = Math.max.apply(null, keys.map(function(k) { return s.ladder[k]; }));
  html += '<details class="ds-more"' + (deckDetailsOpen ? " open" : "") + ">" +
    '<summary><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>' +
    "<span>More — elixir ladder, hero abilities, rotation timing</span></summary>";
  html += '<div class="ds-ladder"><h4>Elixir ladder</h4>' + keys.map(function(k) {
    return '<div class="ds-rung"><span class="ds-rung-cost">' + k + "⚡</span>" +
      '<span class="ds-rung-bar"><span style="width:' + (s.ladder[k] / maxCount * 100) + '%"></span></span>' +
      '<span class="ds-rung-names">' + s.sorted.filter(function(r) { return r.cost === k; })
        .map(function(r) { return r.name; }).join(", ") + "</span></div>";
  }).join("") + "</div>";

  // Hero abilities: one-time costs, tracked apart from the cycle maths.
  var abilityRows = currentDeck.filter(function(d) { return d.slot === "hero"; });
  var abilityTotal = abilityRows.reduce(function(a, d) {
    var c = deckIndex()[d.name];
    var h = c ? heroFor(d.name) : null;
    return a + (h ? h.abilityCost : 0);
  }, 0);
  html += '<div class="ds-ability"><h4>Hero abilities <span>not part of the elixir average</span></h4>' +
    (abilityRows.length
      ? abilityRows.map(function(d) {
          var h = heroFor(d.name);
          return '<div class="ds-ability-row"><span class="ds-ability-cost">+' + (h ? h.abilityCost : "?") + "⚡</span>" +
            "<span>" + d.name + (h ? " — " + h.ability : "") + "</span></div>";
        }).join("") + '<div class="ds-ability-total">' + abilityTotal + "⚡ of one-time ability elixir</div>"
      : '<div class="ds-ability-total">No hero in a hero slot — nothing outside the cycle.</div>') +
    "</div>";

  // ---- Rotation timing in seconds ----
  // Elixir regenerates 1 per 2.8s at 1x, 1.4s at 2x, 1.0s at 3x. Costs are
  // just capacity until you convert them into how long a rotation actually
  // takes back on the ladder.
  var secsPer = [[1, 2.8], [2, 1.4], [3, 1.0]];
  html += '<div class="ds-timing"><h4>Rotation timing</h4>' +
    '<div class="ds-timing-grid">' +
      secsPer.map(function(r) {
        return '<div class="ds-timing-cell">' +
          '<span class="ds-timing-rate">' + r[0] + "x elixir</span>" +
          '<span class="ds-timing-val">' + (s.cycle * r[1]).toFixed(1) + "s</span>" +
          '<span class="ds-timing-sub">cheapest 4</span>' +
          '<span class="ds-timing-val">' + (s.total * r[1]).toFixed(1) + "s</span>" +
          '<span class="ds-timing-sub">full 8</span>' +
        "</div>";
      }).join("") +
    "</div>" +
    '<div class="ds-band">' + (s.cycle <= 9 ? "Cycle deck"
      : s.cycle <= 13 ? "Midrange" : "Beatdown") + " — 4-card rotation of " + s.cycle + "⚡</div>" +
  "</div></details>";

  // ---- What deck is this? ----
  var inDeck = {};
  currentDeck.forEach(function(d) { inDeck[d.name] = true; });
  var best = null;
  if (typeof META_DECKS !== "undefined") {
    META_DECKS.forEach(function(d) {
      var overlap = d.cards.filter(function(n) { return inDeck[n]; }).length;
      if (!best || overlap > best.overlap) best = { name: d.name, tier: d.tier, overlap: overlap, total: d.cards.length };
    });
  }
  var verdict, verdictCls;
  if (s.avg <= 3.5 && s.cycle <= 8) { verdict = "Fast cycle — you out-cycle opponents and punish mismatches"; verdictCls = "good"; }
  else if (s.avg <= 4.0) { verdict = "Balanced — can answer most things and still make power plays"; verdictCls = ""; }
  else if (s.avg <= 4.8) { verdict = "Control — you defend for a big counter-push, not a race"; verdictCls = ""; }
  else { verdict = "Heavy beatdown — you must win on value; one bad bridge placement loses"; verdictCls = "warn"; }

  var freeSlots = SLOT_RULES.slots.filter(function(sl) {
    return sl !== "normal" && !currentDeck.some(function(d) { return d.slot === sl; });
  });

  html += '<div class="ds-identity">' +
    '<h4>Deck identity</h4>' +
    '<div class="ds-verdict ' + verdictCls + '">' + verdict + "</div>" +
    (best && best.overlap >= 4
      ? '<div class="ds-fit">Closest archetype: <strong>' + best.name + '</strong> <span class="chip">' +
        best.overlap + "/" + best.total + " cards</span> <span class=\"chip\">tier " + best.tier + "</span></div>"
      : '<div class="ds-fit">No close archetype — this is an off-meta build.</div>') +
    (freeSlots.length
      ? '<div class="ds-free">Free special slots: ' + freeSlots.map(function(sl) {
          return '<span class="chip chip-action" data-slot="' + sl + '" title="Find a card that fits this slot">' + sl + "</span>";
        }).join("") + "</div>"
      : '<div class="ds-free">All four special slots are active.</div>') +
  "</div>";

  deckStatsEl.innerHTML = html;
}

function renderDeckAnalysis(an) {
  if (!deckAnalysisEl) return;
  var cards = deckCardObjs();
  if (!cards.length) {
    deckAnalysisEl.innerHTML = '<div class="empty-state">Add cards to see the coverage check.</div>';
    return;
  }

  var bal = an.atk + an.def ? an.atkPct : 50;
  var html = '<div class="da-metrics">' +
    metric(an.avg.toFixed(2) + "⚡", "average elixir", an.avg <= 4.0 ? "good" : "warn") +
    metric(an.cycle != null ? an.cycle + "⚡" : "—", "4-card cycle", an.cycle != null && an.cycle <= 9 ? "good" : "") +
    metric(gradeText(an.grade, an.score), "deck score", "grade-" + an.grade.toLowerCase()) +
    metric(bal + "%", "attack · " + (100 - bal) + "% defence", "") +
    metric(an.fullCycle + "⚡", "full 8-card cycle", "") +
  "</div>";

  html += '<div class="da-grid">' + an.checks.map(function(c) {
    return '<div class="da-check ' + (c.ok ? "ok" : "no") + '" title="' + c.detail + '">' +
      '<i class="fa-solid ' + (c.ok ? "fa-circle-check" : "fa-circle-xmark") + '" aria-hidden="true"></i>' +
      '<span class="da-label">' + c.label + "</span>" +
      '<span class="da-need">' + c.need + "</span>" +
      '<span class="da-detail">' + c.detail + "</span>" +
    "</div>";
  }).join("") + "</div>";

  if (an.missing.length) {
    var pool = mergedCards.filter(function(c) { return c.owned && c.type !== "tower"; });
    var swaps = swapSuggestions(cards, pool).slice(0, 4);
    if (swaps.length) {
      html += '<div class="da-swaps"><h4>Swap ideas <span>tap to apply</span></h4>' +
        swaps.map(function(s) {
          return '<button class="da-swap" data-in="' + s.inn + '" data-out="' + s.out + '">' +
            '<img src="' + proxyImg((allCardsDb[s.inn] || {}).iconUrls ? allCardsDb[s.inn].iconUrls.medium : "", s.inn) + '" alt="" loading="lazy" />' +
            "<span><strong>" + s.inn + "</strong> for <strong>" + s.out + "</strong></span>" +
            '<em>fixes ' + s.label + "</em>" +
          "</button>";
        }).join("") + "</div>";
    }
  }

  deckAnalysisEl.innerHTML = html;
}

function metric(val, label, cls) {
  return '<div class="da-metric ' + (cls || "") + '">' +
    '<span class="da-val">' + val + "</span>" +
    '<span class="da-lbl">' + label + "</span>" +
  "</div>";
}

// One grade format everywhere — letter coloured by band, then the score.
// "B · 78" reads the same in the guide, the summary, the analysis panel, the
// pinned verdict and the battles tab.
function gradeText(grade, score) {
  return '<span class="grade-letter gl-' + String(grade).toLowerCase() + '">' + grade + "</span>" +
    '<span class="grade-num"> · ' + score + "</span>";
}

// Replace one card for another, keeping slot legality.
function swapInDeck(inName, outName) {
  var i = -1;
  currentDeck.forEach(function(d, n) { if (d.name === outName) i = n; });
  if (i < 0) return;
  var keep = currentDeck[i].slot;
  currentDeck[i] = { name: inName, slot: "normal" };
  var f = cardFlags(deckIndex()[inName] || {});
  currentDeck[i].slot = slotFits(f, keep) ? keep : pickSlotFor(inName);
  renderDeckBuilder();
}

deckAnalysisEl && deckAnalysisEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".da-swap");
  if (btn) swapInDeck(btn.dataset.in, btn.dataset.out);
});

// Load a whole archetype (or an autofill result) into the builder.
function applyDeck(names, tower) {
  currentDeck = names.map(function(n) { return { name: n, slot: "normal" }; });
  var objs = deckCardObjs();
  var assigned = assignSlots(objs);
  currentDeck.forEach(function(d) {
    d.slot = assigned.slots[d.name] || d.slot;
  });
  if (tower) currentTower = tower;
  renderDeckBuilder();
  switchTab("deck");
}

// --------------- Shareable deck links ---------------
// #tag=92LCJ898U&deck=Hog%20Rider|evolution,The%20Log&tower=Tower%20Princess
function readHash() {
  var raw = location.hash.replace(/^#/, "");
  if (!raw) return null;
  var params = new URLSearchParams(raw);
  var deck = (params.get("deck") || "").split(",").filter(Boolean).map(function(part) {
    var bits = part.split("|");
    // params.get decodes once. Links written before the double-encoding
    // fix carry one extra layer, so keep decoding while it changes
    // anything (no card name contains a literal %, so this is safe).
    var name = bits[0] || "";
    for (var k = 0; k < 3; k++) {
      try {
        var again = decodeURIComponent(name);
        if (again === name) break;
        name = again;
      } catch (e) { break; }
    }
    return { name: name, slot: bits[1] || "normal" };
  });
  return {
    tag: params.get("tag"),
    deck: deck,
    tower: params.get("tower"),
  };
}

function writeHash() {
  var params = new URLSearchParams();
  if (currentPlayerTag) params.set("tag", currentPlayerTag.replace(/^#/, ""));
  if (currentDeck.length) {
    // URLSearchParams encodes on set — no manual encodeURIComponent here
    // (that used to double-encode names into Ice%2520Golem links).
    params.set("deck", currentDeck.map(function(d) {
      return d.name + (d.slot && d.slot !== "normal" ? "|" + d.slot : "");
    }).join(","));
  }
  if (currentTower) params.set("tower", currentTower);
  var s = params.toString();
  if (s === location.hash.replace(/^#/, "")) return;
  history.replaceState(null, "", location.pathname + location.search + (s ? "#" + s : ""));
}

function copyShareLink(btn) {
  writeHash();
  var url = location.href;
  function done() {
    if (!btn) return;
    var old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied';
    btn.classList.add("copied");
    setTimeout(function() { btn.innerHTML = old; btn.classList.remove("copied"); }, 1600);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, function() { prompt("Copy this link:", url); });
  } else {
    prompt("Copy this link:", url);
  }
}

// --------------- Suggestions ---------------
var lastRanked = [];

function renderInvest() {
  if (!investListEl) return;
  var idx = deckIndex();
  var rows = upgradeValueList(idx, 8);
  // How many (mode-filtered) ranked decks does upgrading this card unlock —
  // i.e. decks where it is the blocker (a missing card, or an owned card
  // still below max). lastRanked is set by renderSuggestions() before this runs.
  var unlocks = blockerDeckCounts(lastRanked, idx, cardsToMax);
  // Explicit column header, matching the 5-col grid of .invest-row below.
  // No numeric impact is printed — sub-1% values are meaningless, so the
  // "Why" column is the impact bar only.
  var head = '<div class="invest-head" style="display:grid;grid-template-columns:30px minmax(90px,1.1fr) minmax(70px,2fr) auto auto;gap:0.6rem;align-items:center;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;padding:0 0.3rem 0.1rem;">' +
    "<span></span><span>Card</span><span>Why</span><span>In N decks</span><span>Next lvl · Gold</span></div>";
  var body = rows.map(function(r) {
    var db = allCardsDb[r.name] || {};
    var img = proxyImg((db.iconUrls || {}).medium, r.name);
    var unlock = unlocks[r.name] || 0;
    return '<button class="invest-row" data-name="' + r.name + '" title="Open this card in the collection">' +
      '<img src="' + img + '" alt="" loading="lazy" />' +
      '<span class="inv-name">' + r.name + "</span>" +
      '<span class="inv-bar" title="Impact · ' + (r.role || "deck value") + '"><span class="inv-fill" style="width:' + r.pct + '%"></span></span>' +
      '<span class="inv-decks">' + r.decks + " deck" + (r.decks === 1 ? "" : "s") + (r.sDecks ? " · " + r.sDecks + " S" : "") +
        (unlock ? " · unlocks " + unlock : "") + "</span>" +
      '<span class="inv-cost">next Lv' + (r.level + 1) + " · " + (r.cards != null ? r.cards + " cards" : "—") +
        " · " + (r.gold != null ? fmt(r.gold) + "g" : "—") + "</span>" +
    "</button>";
  }).join("");
  investListEl.innerHTML = rows.length ? head + body
    : '<div class="empty-state">Everything you own is already maxed, or no deck uses your cards.</div>';
}

investListEl && investListEl.addEventListener("click", function(e) {
  var row = e.target.closest(".invest-row");
  if (!row) return;
  searchInput.value = row.dataset.name;
  statusFilter = "all";
  statusSelect.value = "all";
  switchTab("collection");
  renderCards();
  var el = cardGrid.querySelector(".card-item");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
});

function renderSuggestions() {
  if (!suggestionsEl) return;
  var idx = deckIndex();
  var ranked = rankArchetypes(idx, currentFavCard);
  if (suggMode !== "all") ranked = ranked.filter(function(a) { return a.meta === suggMode || (a.modes && a.modes.indexOf(suggMode) !== -1); });
  lastRanked = ranked;

  renderInvest();

  var ownedCount = mergedCards.filter(function(c) { return c.owned; }).length;
  if (suggSummaryEl) {
    suggSummaryEl.textContent = ranked.length + " archetypes · " + ownedCount + " cards owned · favourite: " + (currentFavCard || "—");
  }

  if (!ranked.length) {
    suggestionsEl.innerHTML = '<div class="empty-state">No archetypes match this mode.</div>';
    return;
  }

  // "Almost there" cost gate: cheap enough to level in a short grind.
  var SMALL_GOLD = 200000, SMALL_CARDS = 400;
  var costMemo = {};
  function costFor(a) {
    if (!costMemo[a.name]) costMemo[a.name] = deckUnlockCost(a, idx, cardsToMax, goldToMax);
    return costMemo[a.name];
  }
  // Ready now: every card owned AND the deck is legal as-is (fieldable today).
  function isReady(a) { return a.missing.length === 0 && a.violations.length === 0; }
  // Almost there: 1–2 cards missing, OR a small upgrade cost to field it.
  function isAlmost(a) {
    if (a.missing.length <= 2) return true;
    var c = costFor(a);
    return c.cards <= SMALL_CARDS && c.gold <= SMALL_GOLD;
  }

  var ready  = ranked.filter(isReady);
  var almost = ranked.filter(function(a) { return !isReady(a) && isAlmost(a); })
                     .sort(function(a, b) {
                       var ca = costFor(a), cb = costFor(b);
                       if (ca.gold !== cb.gold) return ca.gold - cb.gold;
                       return ca.cards - cb.cards;
                     });
  var rest   = ranked.filter(function(a) { return !isReady(a) && !isAlmost(a); });

  // Sections (capped), then back-fill the top-10 so the ranked list stays
  // fully represented no matter how the caps land.
  var readySec  = ready.slice(0, 12);
  var almostSec = almost.slice(0, 8);
  var restSec   = rest.slice(0, 5);
  var shown = {};
  readySec.concat(almostSec, restSec).forEach(function(a) { shown[a.name] = true; });
  ranked.slice(0, 10).forEach(function(a) {
    if (shown[a.name]) return;
    if (isReady(a)) readySec.push(a);
    else if (isAlmost(a)) almostSec.push(a);
    else restSec.push(a);
    shown[a.name] = true;
  });

  // Labeled stat: "Label value" pair, label muted, value bright.
  function stat(label, value) {
    return '<span style="display:inline-flex;gap:0.3rem;align-items:baseline">' +
      '<span style="color:var(--text-muted);font-size:0.7rem">' + label + "</span>" +
      '<span style="color:var(--text)">' + value + "</span></span>";
  }
  // Published meta stat, visually separated from locally computed ones.
  function metaChip(a) {
    return '<span style="display:inline-flex;gap:0.35rem;align-items:baseline;background:rgba(240,196,63,0.12);border:1px solid rgba(240,196,63,0.4);border-radius:var(--radius-sm);padding:0 0.4rem">' +
      '<span style="color:var(--accent);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.03em">meta</span>' +
      '<span style="color:var(--text)">' + a.metaWr + "% · " + a.metaGames + " games</span></span>";
  }
  // A deck whose key (win) card is unowned must be flagged, not buried.
  function keyFlag(a) {
    if (a.key && a.missing.indexOf(a.key) !== -1) {
      return '<div class="sugg-viol" style="margin-top:0.55rem">⚠ Key card not owned: <b>' + a.key + "</b> — no win path until you unlock it.</div>";
    }
    return "";
  }
  // Unlock cost line for non-ready decks: what's missing + the grind to max.
  function unlockLine(a) {
    if (isReady(a)) return "";
    var c = costFor(a);
    var parts = [];
    if (a.missing.length) parts.push("missing: " + a.missing.join(", "));
    parts.push("needs " + fmt(c.cards) + " cards + " + fmt(c.gold) + " gold to max");
    return '<div class="sugg-note" style="margin-top:0.55rem"><b style="color:var(--warning)">Unlock</b> — ' + parts.join(" · ") + "</div>";
  }
  function cardHtml(a) {
    var plan = isReady(a) ? [] : deckUpgradePlan(a, idx, cardsToMax, goldToMax).slice(0, 6);
    return '<div class="sugg-card' + (a.violations.length ? " sugg-warn" : "") + '">' +
      '<div class="sugg-top">' +
        '<span class="sugg-tier tier-' + a.tier + '">' + a.tier + "</span>" +
        '<span class="sugg-name">' + a.name + "</span>" +
        '<button class="sugg-use" data-name="' + a.name + '" title="Load this deck into the builder">' +
          '<i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Use</button>' +
        '<span class="sugg-score">' + a.score + "</span>" +
      "</div>" +
      '<div class="sugg-tags">' + a.tags.map(function(t) { return '<span class="tag">' + t + "</span>"; }).join("") + "</div>" +
      '<div class="sugg-stats">' +
        stat("owned", a.owned.length + "/8") +
        stat("avg Lv", a.avgLevel) +
        stat("tower", a.tower) +
        (a.evoUnlocked ? stat("evos", a.evoUnlocked) : "") +
        (a.heroCapable ? stat("heroes", a.heroCapable) : "") +
        (a.metaWr != null ? metaChip(a) : "") +
        (a.modes.length > 1 ? stat("modes", a.modes.join(" · ")) : "") +
      "</div>" +
      '<div class="sugg-cards">' + a.cards.map(function(n) {
        var on = idx[n] && idx[n].owned;
        return '<span class="chip ' + (on ? "chip-on" : "chip-off") + '">' + n + (on ? "" : " +") + "</span>";
      }).join("") + "</div>" +
      keyFlag(a) +
      unlockLine(a) +
      (a.win ? '<div class="sugg-win">' + a.win + "</div>" : "") +
      (plan.length ? '<div class="sugg-plan"><h4>To make it work</h4><ul>' + plan.map(function(p) {
        return "<li>" + p.name + " — " + p.need +
          (p.cards != null ? " · " + p.cards + " cards · " + p.gold + " gold" : "") + "</li>";
      }).join("") + "</ul></div>" : "") +
      (a.violations.length ? '<div class="sugg-viol">' + a.violations.join("; ") + "</div>" : "") +
      (a.notes.length ? '<div class="sugg-note">' + a.notes.join("; ") + "</div>" : "") +
    "</div>";
  }
  function section(label, sub, list) {
    if (!list.length) return "";
    return '<h3 style="color:var(--accent);font-size:0.82rem;margin:0.9rem 0 0.15rem;text-transform:uppercase;letter-spacing:0.05em">' + label +
      (sub ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;text-transform:none;letter-spacing:0">(' + sub + ")</span>" : "") + "</h3>" +
      list.map(cardHtml).join("");
  }

  suggestionsEl.innerHTML =
    section("Ready now", "all 8 owned · legal as-is", readySec) +
    section("Almost there", "1–2 missing or cheap to level · sorted by cost", almostSec) +
    section("Needs work", "3+ missing or a heavy grind", restSec) +
    (ranked.some(function(a) { return a.metaWr != null; })
      ? '<p class="sugg-src">Meta win rates and usage: deckai.app popular decks — 7-day sample, ranked + Path of Legend playlists, fetched 7 Oct 2026. Everything else (scores, plans, upgrades) is computed from your own collection.</p>'
      : "");
}

// --------------- Battles & win rates ---------------
// GET /players/{tag}/battlelog is the only official win-rate source: the
// Developer API publishes no meta win rates, so everything below is the
// player's own results (the last ~30 battles the API returns).
async function loadBattlelog(tag) {
  if (battlelogTag === tag && currentBattlelog) return;
  battlelogTag = tag;
  currentBattlelog = null;
  battlelogError = null;
  try {
    var log = await apiFetch("/players/" + encodeURIComponent(tag) + "/battlelog");
    currentBattlelog = Array.isArray(log) ? log : [];
  } catch (err) {
    currentBattlelog = [];
    battlelogError = (err && err.message) || "Battle log unavailable";
  }
}

function battleRows() {
  var log = currentBattlelog || [];
  return log.map(function(b) {
    var me = b.team && b.team[0], opp = b.opponent && b.opponent[0];
    if (!me || !opp || !me.cards || !opp.cards) return null;
    var myC = me.crowns || 0, opC = opp.crowns || 0;
    return {
      win: myC > opC,
      myC: myC, opC: opC,
      time: b.battleTime || "",
      type: b.type || "",
      mode: (b.gameMode && b.gameMode.name) || b.type || "",
      oppName: opp.name || "Opponent",
      oppTag: opp.tag || "",
      oppClan: (opp.clan && opp.clan.name) || "",
      oppRank: opp.globalRank || null,
      deck: me.cards.map(function(c) { return c.name; }),
      tower: (me.supportCards && me.supportCards[0] && me.supportCards[0].name) || "",
      oppDeck: opp.cards.map(function(c) { return c.name; }),
      oppTower: (opp.supportCards && opp.supportCards[0] && opp.supportCards[0].name) || "",
    };
  }).filter(Boolean);
}

function battleTimeLabel(ts) {
  var m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(ts || "");
  if (!m) return ts || "";
  var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  var mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return Math.round(mins) + "m ago";
  if (mins < 60 * 24) return Math.round(mins / 60) + "h ago";
  if (mins < 60 * 48) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function record(games, wins) {
  var losses = games - wins;
  return wins + "-" + losses + " (" + (games ? Math.round(wins / games * 100) : 0) + "%)";
}

function renderBattles() {
  if (!battlesSummaryEl) return;
  var emptyBox = '<div class="empty-state">';

  if (!battlelogTag) {
    battlesSummaryEl.innerHTML = "";
    battlesDecksEl.innerHTML = battlesCardsEl.innerHTML = battlesFacedEl.innerHTML =
      battlesListEl.innerHTML = emptyBox + "Load a player to see their battle history.</div>";
    return;
  }
  if (currentBattlelog === null) {
    battlesSummaryEl.innerHTML = "";
    var loadingBox = '<div class="empty-state is-loading"><div class="spinner"></div>Loading battle history…</div>';
    battlesDecksEl.innerHTML = battlesCardsEl.innerHTML = battlesFacedEl.innerHTML =
      battlesListEl.innerHTML = loadingBox;
    return;
  }
  if (battlelogError) {
    battlesSummaryEl.innerHTML = "";
    battlesDecksEl.innerHTML = battlesCardsEl.innerHTML = battlesFacedEl.innerHTML =
      battlesListEl.innerHTML = emptyBox + "<strong>No battle history.</strong><br />" + battlelogError +
        "<br />Battlelogs are private for some players and only cover the last ~30 battles.</div>";
    return;
  }

  var rows = battleRows();
  if (!rows.length) {
    battlesSummaryEl.innerHTML = "";
    battlesDecksEl.innerHTML = battlesCardsEl.innerHTML = battlesFacedEl.innerHTML =
      battlesListEl.innerHTML = emptyBox + "<strong>No battles returned.</strong><br />" +
        "Play a ladder or challenge battle — the API returns the last ~30 once you have one.</div>";
    return;
  }

  var games = rows.length;
  var wins = rows.filter(function(r) { return r.win; }).length;
  var cf = rows.reduce(function(a, r) { return a + r.myC; }, 0) / games;
  var ca = rows.reduce(function(a, r) { return a + r.opC; }, 0) / games;
  var streak = 0, streakWin = rows[0].win;
  for (var i = 0; i < rows.length && rows[i].win === streakWin; i++) streak++;
  var byType = {};
  rows.forEach(function(r) { byType[r.type || "battle"] = (byType[r.type || "battle"] || 0) + 1; });
  var typeBits = Object.keys(byType).map(function(t) { return byType[t] + " " + t; }).join(" · ");

  battlesSummaryEl.innerHTML = [
    ["games", games, ""],
    ["win rate", Math.round(wins / games * 100) + "%", wins / games >= 0.5 ? "good" : "warn"],
    ["record", wins + "-" + (games - wins), ""],
    ["form", (streakWin ? "W" : "L") + streak, streak >= 3 ? (streakWin ? "good" : "bad") : ""],
    ["crowns for", cf.toFixed(1), ""],
    ["crowns against", ca.toFixed(1), ca > cf ? "warn" : ""],
  ].map(function(m) {
    return '<div class="bat-metric ' + (m[2] || "") + '"><span class="da-val">' + m[1] + '</span><span class="da-lbl">' + m[0] + "</span></div>";
  }).join("") + '<div class="bat-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' + typeBits +
    " · last " + games + " battles, newest first</div>";

  battlesSrcEl.textContent = "Win rates come from the official Clash Royale API battle log for #" +
    (currentPlayerTag || "").replace("#", "") + ".";

  // ---- decks actually played ----
  var byDeck = {};
  rows.forEach(function(r) {
    var k = r.deck.slice().sort().join("|");
    var g = byDeck[k];
    if (!g) g = byDeck[k] = { cards: r.deck, tower: r.tower, games: 0, wins: 0, last: "" };
    g.games++;
    if (r.win) g.wins++;
    if (r.time > g.last) { g.last = r.time; if (r.tower) g.tower = r.tower; }
  });
  var decks = Object.keys(byDeck).map(function(k) { return byDeck[k]; })
    .sort(function(a, b) { return (b.wins / b.games) - (a.wins / a.games) || b.games - a.games; });

  var idx = deckIndex();
  battlesDecksEl.innerHTML = decks.map(function(d) {
    var objs = d.cards.map(function(n) { return idx[n]; }).filter(Boolean);
    var an = objs.length === d.cards.length ? analyzeDeck(objs, d.tower) : null;
    var wr = Math.round(d.wins / d.games * 100);
    return '<div class="bat-deck">' +
      '<div class="bd-top">' +
        (an ? '<span class="da-grade grade-' + an.grade.toLowerCase() + '">' + gradeText(an.grade, an.score) + "</span>" : "") +
        '<span class="bd-rec">' + record(d.games, d.wins) + "</span>" +
        '<span class="bd-bar"><span class="bd-fill" style="width:' + wr + '%"></span></span>' +
        '<button class="bd-use" data-cards="' + d.cards.join(",") + '" data-tower="' + d.tower + '" title="Load into the deck builder">Use</button>' +
      "</div>" +
      '<div class="bd-cards">' + d.cards.map(function(n) { return '<span class="chip chip-on">' + n + "</span>"; }).join("") + "</div>" +
      '<div class="bd-foot">tower ' + d.tower + " · last played " + battleTimeLabel(d.last) + "</div>" +
    "</div>";
  }).join("");

  // ---- per-card win rate ----
  var cardStats = {};
  rows.forEach(function(r) {
    r.deck.forEach(function(n) {
      var st = cardStats[n] || (cardStats[n] = { name: n, games: 0, wins: 0 });
      st.games++;
      if (r.win) st.wins++;
    });
  });
  var cards = Object.keys(cardStats).map(function(k) { return cardStats[k]; })
    .filter(function(c) { return c.games >= 2; })
    .sort(function(a, b) { return (b.wins / b.games) - (a.wins / a.games) || b.games - a.games; });

  battlesCardsEl.innerHTML = cards.map(function(c) {
    var pct = Math.round(c.wins / c.games * 100);
    var db = allCardsDb[c.name] || {};
    var img = proxyImg((db.iconUrls || {}).medium, c.name);
    var cls = pct >= 55 ? " good" : (pct < 45 ? " bad" : "");
    return '<div class="bat-card' + cls + '">' +
      '<img src="' + img + '" alt="" loading="lazy" />' +
      '<span class="bc-name">' + c.name + "</span>" +
      '<span class="bd-bar"><span class="bd-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="bc-nums">' + pct + "% · " + record(c.games, c.wins) + "</span>" +
    "</div>";
  }).join("") || '<div class="empty-state">Not enough battles yet to rank cards (2+ games needed).</div>';

  // ---- archetypes faced ----
  var sigs = {};
  if (typeof META_DECKS !== "undefined") {
    META_DECKS.forEach(function(d) { sigs[d.cards.slice().sort().join("|")] = d.name; });
  }
  var faced = {};
  rows.forEach(function(r) {
    var k = r.oppDeck.slice().sort().join("|");
    var name = sigs[k] || "Off-meta deck";
    var g = faced[name] || (faced[name] = { name: name, games: 0, wins: 0 });
    g.games++;
    if (r.win) g.wins++;
  });
  var facedList = Object.keys(faced).map(function(k) { return faced[k]; })
    .sort(function(a, b) { return b.games - a.games || (b.wins / b.games) - (a.wins / a.games); })
    .slice(0, 8);

  battlesFacedEl.innerHTML = facedList.map(function(f) {
    var wr = Math.round(f.wins / f.games * 100);
    var cls = wr >= 55 ? " good" : (wr < 45 ? " bad" : "");
    return '<div class="bat-faced-row' + cls + '">' +
      '<span class="bf-name">' + f.name + "</span>" +
      '<span class="bd-bar"><span class="bd-fill" style="width:' + wr + '%"></span></span>' +
      '<span class="bc-nums">' + record(f.games, f.wins) + "</span>" +
    "</div>";
  }).join("") || '<div class="empty-state">No battles yet.</div>';

  // ---- recent battles ----
  var recent = rows.slice().sort(function(a, b) { return b.time.localeCompare(a.time); }).slice(0, 12);
  battlesListEl.innerHTML = recent.map(function(r) {
    return '<div class="bat-row' + (r.win ? " bat-win" : " bat-loss") + '" data-cards="' + r.deck.join(",") +
        '" data-tower="' + r.tower + '" title="Click to load this deck">' +
      '<span class="br-res">' + (r.win ? "W" : "L") + "</span>" +
      '<span class="br-score">' + r.myC + "-" + r.opC + "</span>" +
      '<span class="br-time">' + battleTimeLabel(r.time) + "</span>" +
      '<span class="br-opp">' + r.oppName + (r.oppClan ? " · " + r.oppClan : "") + "</span>" +
      '<span class="br-mode">' + r.type + "</span>" +
      '<span class="br-deck">' + r.deck.map(function(n) { return '<span class="chip">' + n + "</span>"; }).join("") + "</span>" +
    "</div>";
  }).join("");
}

battlesDecksEl && battlesDecksEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".bd-use");
  if (!btn) return;
  applyDeck(btn.dataset.cards.split(","), btn.dataset.tower || null);
});

battlesListEl && battlesListEl.addEventListener("click", function(e) {
  var row = e.target.closest(".bat-row");
  if (!row) return;
  applyDeck(row.dataset.cards.split(","), row.dataset.tower || null);
});

// --------------- Tabs ---------------
function switchTab(name) {
  activeTab = name;
  document.querySelectorAll("#tab-bar .tab-btn").forEach(function(b) {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach(function(p) {
    p.classList.toggle("active", p.id === "tab-" + name);
  });
}

// --------------- New events ---------------
statusSelect.addEventListener("change", function() { statusFilter = statusSelect.value; renderCards(); });
suggModeEl.addEventListener("change", function() { suggMode = suggModeEl.value; renderSuggestions(); });
towerSelect.addEventListener("change", function() { currentTower = towerSelect.value; renderDeckBuilder(); });

deckResetBtn.addEventListener("click", function() {
  if (currentPlayerData && currentPlayerData.currentDeck) {
    currentDeck = currentPlayerData.currentDeck.map(function(c) {
      return { name: String(c.name).trim(), slot: "normal" };
    });
    autoAssignCurrentDeck();
    renderDeckBuilder();
  }
});

deckSlotsEl.addEventListener("change", function(e) {
  var i = e.target.dataset.i;
  if (i === undefined || !currentDeck[i]) return;
  currentDeck[i].slot = e.target.value;
  renderDeckBuilder();
});

deckSlotsEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".ds-remove");
  if (!btn) return;
  currentDeck.splice(Number(btn.dataset.i), 1);
  renderDeckBuilder();
});

pickListEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".pick");
  if (!btn) return;
  if (currentDeck.length >= DECK_SIZE) return;   // remove something first
  var slot = pickSlotFor(btn.dataset.name);
  currentDeck.push({ name: btn.dataset.name, slot: slot });
  renderDeckBuilder();
});

deckAutofillBtn.addEventListener("click", function() {
  var pool = mergedCards.filter(function(c) { return c.owned && c.type !== "tower"; });
  if (!pool.length) return;
  var built = autofillDeck(pool);
  if (!built.length) return;
  currentDeck = built;
  renderDeckBuilder();
});

deckShareBtn.addEventListener("click", function() { copyShareLink(deckShareBtn); });

suggestionsEl.addEventListener("click", function(e) {
  var btn = e.target.closest(".sugg-use");
  if (!btn) return;
  var arch = lastRanked.filter(function(a) { return a.name === btn.dataset.name; })[0];
  if (!arch) return;
  applyDeck(arch.cards.slice(), arch.tower);
});

if (scoreTableBody && typeof DECK_CHECKS !== "undefined") {
  scoreTableBody.innerHTML = DECK_CHECKS.map(function(c) {
    return "<tr><td>" + c.label + "</td><td>" + c.need + "</td><td>" + c.weight + "</td></tr>";
  }).join("") + '<tr class="total"><td><strong>Total</strong></td><td></td><td><strong>100</strong></td></tr>';
}

tabBar.addEventListener("click", function(e) {
  var btn = e.target.closest(".tab-btn");
  if (btn) switchTab(btn.dataset.tab);
});

// --------------- Auto-load ---------------
var pendingShared = null;

(function boot() {
  pendingShared = readHash();
  var tag = (pendingShared && pendingShared.tag) ? pendingShared.tag
    : (typeof DEFAULT_PLAYER_TAG !== "undefined" ? DEFAULT_PLAYER_TAG : "");
  if (tag) setTimeout(function() { loadPlayer(tag); }, 300);
})();
