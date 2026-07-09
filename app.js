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
var msBtn       = document.getElementById("rarity-btn");
var msDropdown  = document.getElementById("rarity-dropdown");

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
    throw new Error("Run: cd ~/Documents/royal-portal && python3 serve.py\nThen open http://localhost:8080/");
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

    pnameEl.textContent = data.name || "—";
    ptagEl.textContent = currentPlayerTag;
    var total = mergedCards.length;
    var owned = 0;
    mergedCards.forEach(function(c) { if (c.owned) owned++; });
    pstatsEl.textContent = owned + " / " + total + " cards · Lv " + (data.expLevel || "?");
    playerBar.classList.remove("hidden");

    renderCards();
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

  if (!cards.length) {
    cardGrid.innerHTML = '<div class="empty-state">No cards match.</div>';
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

    var div = document.createElement("div");
    div.className = "card-item rarity-" + r + (owned ? " owned" : "") + (isMaxed ? " maxed" : "") + (card.type === "tower" ? " tower-type" : "");

    // Card body text (for owned non-maxed cards, including tower troops)
    var bodyExtraHtml = "";
    if (owned && !isMaxed) {
      var needNext = cardsForNext(card);
      var have     = card.count || 0;
      var pctNext = needNext > 0 ? Math.min(100, Math.round(have / needNext * 100)) : 0;
      var canUp   = needNext > 0 && have >= needNext;

      bodyExtraHtml += '<div class="ci-lv">Lv' + lv + '</div>';
      bodyExtraHtml += '<div class="ci-bar' + (canUp ? ' full' : '') + '"><div class="ci-fill" style="width:' + pctNext + '%"></div></div>';
    }

    div.innerHTML =
      '<div class="card-img-wrap">' +
        '<img src="' + img + '" alt="' + card.name + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + fallback + '\'" />' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-n" style="color:' + color + '"><span class="card-n-text">' + card.name + '</span></div>' +
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
    msBtn.textContent = "Rarity ▾";
  } else {
    msBtn.textContent = selectedRarities.size + " ▾";
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

sortSelect.addEventListener("change", renderCards);
searchInput.addEventListener("input", renderCards);

// --------------- Auto-load ---------------
if (typeof DEFAULT_PLAYER_TAG !== "undefined" && DEFAULT_PLAYER_TAG) {
  setTimeout(function() { loadPlayer(DEFAULT_PLAYER_TAG); }, 300);
}
