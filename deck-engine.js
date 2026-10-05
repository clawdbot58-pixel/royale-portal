/* =====================================================
   deck-engine.js — deck legality + suggestion scoring
   Pure logic: no DOM, no fetch. Globals from card-data.js,
   card-roles.js, meta-decks.js and app.js's mergedCards.
   ===================================================== */

// Hero lookup by base card name (the API has no hero cards, so heroes are
// modelled as the hero form of their base card).
function heroFor(name) {
  if (typeof HEROES === "undefined") return null;
  for (var i = 0; i < HEROES.length; i++) {
    if (HEROES[i].base === name) return HEROES[i];
  }
  return null;
}

// Flags a merged card needs for deck rules. `merged` is one entry of
// mergedCards (app.js), `db` its allCardsDb entry.
function cardFlags(merged) {
  var db = (typeof allCardsDb !== "undefined" && allCardsDb[merged.name]) || {};
  var evoMax = merged.maxEvolutionLevel || db.maxEvolutionLevel || 0;
  var evoLv  = merged.evolutionLevel || 0;
  return {
    name: merged.name,
    rarity: merged.rarity,
    type: merged.type,
    owned: !!merged.owned,
    level: merged.level || 0,
    isChampion: merged.rarity === "champion",
    isTower: merged.type === "tower",
    evoCapable: evoMax > 0,
    evoUnlocked: evoLv > 0,
    evoLevel: evoLv,
    evoMax: evoMax,
    heroCapable: !!heroFor(merged.name),
    hero: heroFor(merged.name),
    role: (typeof CARD_ROLES !== "undefined" && CARD_ROLES[merged.name]) ? CARD_ROLES[merged.name].role : "unknown",
    elixir: typeof merged.elixirCost === "number" ? merged.elixirCost : 4,
  };
}

// Greedy slot assignment: champion → champion slot, unlocked evolution →
// evolution slot, hero-capable → hero slot, the next special card → wild slot,
// everything else → normal. Returns {slots: {name: slot}, specials: [...],
// overflow: [...]} where overflow are special cards with no slot left.
function assignSlots(cards) {
  var used = { champion: 0, evolution: 0, hero: 0, wild: 0 };
  var out = {}, specials = [], overflow = [];
  var flags = cards.map(cardFlags);

  function place(f, slot) {
    if (used[slot] < 1) { used[slot] = 1; out[f.name] = slot; specials.push({ name: f.name, slot: slot }); return true; }
    return false;
  }

  flags.forEach(function(f) {
    if (f.isChampion && place(f, "champion")) return;
    if (f.evoUnlocked && place(f, "evolution")) return;
    if (f.heroCapable && place(f, "hero")) return;
    if (f.isChampion || f.evoUnlocked || f.heroCapable) {
      if (place(f, "wild")) return;
      overflow.push(f.name);
      out[f.name] = "normal";
      return;
    }
    out[f.name] = "normal";
  });

  return { slots: out, specials: specials, overflow: overflow, flags: flags };
}

// Deck legality — hard rules only. A special card parked in a normal slot
// plays as the plain card, so counts above the slot ceilings are notes
// (deckNotes), not violations. `cards` is an array of merged card objects
// (8 expected), `tower` the equipped tower troop name or null.
function deckViolations(cards, tower) {
  var v = [];
  var size = typeof DECK_SIZE !== "undefined" ? DECK_SIZE : 8;
  if (cards.length !== size) v.push("Deck must be " + size + " cards (has " + cards.length + ")");

  var seen = {};
  cards.forEach(function(c) {
    if (seen[c.name]) v.push("Duplicate card: " + c.name);
    seen[c.name] = true;
  });

  var flags = cards.map(cardFlags);
  var maxC = (typeof SLOT_RULES !== "undefined" ? SLOT_RULES.maxChampions : 2);
  // Champions have no plain form to fall back on: champion slot + wild slot only.
  var champs = flags.filter(function(f) { return f.isChampion; });
  if (champs.length > maxC) v.push("Too many champions: " + champs.length + " (max " + maxC + " — champion slot + wild slot)");

  var unowned = flags.filter(function(f) { return !f.owned; });
  if (unowned.length) v.push("Cards not owned: " + unowned.map(function(f) { return f.name; }).join(", "));

  if (tower && typeof TOWER_TROOPS !== "undefined" && TOWER_TROOPS.indexOf(tower) === -1) {
    v.push("Tower troop must be one of: " + TOWER_TROOPS.join(", "));
  }

  return v;
}

// Activation limits for legal decks: how many special cards can actually be
// active. Returns human-readable notes; empty array = everything activates.
function deckNotes(cards) {
  var n = [];
  var flags = cards.map(cardFlags);
  var maxC = (typeof SLOT_RULES !== "undefined" ? SLOT_RULES.maxChampions : 2);
  var maxH = (typeof SLOT_RULES !== "undefined" ? SLOT_RULES.maxHeroes : 2);
  var maxE = (typeof SLOT_RULES !== "undefined" ? SLOT_RULES.maxEvolutions : 2);
  var champs = flags.filter(function(f) { return f.isChampion; }).length;
  var heroes = flags.filter(function(f) { return f.heroCapable; }).length;
  var evos   = flags.filter(function(f) { return f.evoUnlocked; }).length;
  if (evos   > maxE) n.push(evos   + " evolution cards — only " + maxE + " can be active (evolution slot + wild slot); the rest play as plain cards");
  if (heroes > maxH) n.push(heroes + " hero-capable cards — only " + maxH + " can be active (hero slot + wild slot); the rest play as plain cards");
  var specialSet = {};
  flags.forEach(function(f) { if (f.isChampion || f.evoUnlocked || f.heroCapable) specialSet[f.name] = true; });
  var special = Object.keys(specialSet).length;
  if (special > 4) n.push(special + " special cards — only 4 fit the special slots (champion, evolution, hero, wild); the rest play as plain cards");
  return n;
}

// Score one archetype against the player's collection.
// `index` maps card name → merged card. `fav` is the favourite card name.
// Returns {score, owned, missing, avgLevel, evoUnlocked, heroCapable, champions,
//          tower, violations, upgradeNeeded}.
function scoreArchetype(arch, index, fav) {
  var owned = [], missing = [], levels = [];
  var evoUnlocked = 0, heroCapable = 0, champs = 0;

  arch.cards.forEach(function(name) {
    var c = index[name];
    if (!c || !c.owned) { missing.push(name); return; }
    var f = cardFlags(c);
    owned.push(name);
    levels.push(f.level);
    if (f.evoUnlocked) evoUnlocked++;
    if (f.heroCapable) heroCapable++;
    if (f.isChampion) champs++;
  });

  var avgLevel = levels.length ? levels.reduce(function(a, b) { return a + b; }, 0) / levels.length : 0;

  var deckCards = owned.map(function(n) { return index[n]; });
  var violations = deckViolations(deckCards, arch.tower);
  var notes = deckNotes(deckCards);

  var score = 0;
  score += owned.length * 3;
  score += avgLevel * 2;
  score += evoUnlocked * 6;
  score += heroCapable * 4;
  score += champs * 3;
  if (arch.key && index[arch.key] && index[arch.key].owned) score += 15;
  if (fav && arch.cards.indexOf(fav) !== -1) score += 20;
  if (arch.tier === "S") score += 10;
  if (arch.tier === "A") score += 6;
  if (arch.tier === "B") score += 3;

  // Role coverage: a legal deck needs a win path, a spell, and air answers.
  var roles = owned.map(function(n) { return (CARD_ROLES[n] || {}).role; });
  if (roles.indexOf("win-condition") !== -1) score += 12;
  if (roles.indexOf("spell") !== -1) score += 6;
  var air = owned.filter(function(n) { return CARD_ROLES[n] && CARD_ROLES[n].air; }).length;
  if (air >= 2) score += 6;
  var cycle = owned.reduce(function(a, n) { return a + ((CARD_ROLES[n] || {}).cycle || 4); }, 0) / (owned.length || 1);
  if (cycle <= 3.5) score += 4;

  score -= missing.length * 5;
  score -= violations.length * 12;

  return {
    name: arch.name,
    score: Math.round(score * 10) / 10,
    cards: arch.cards,
    owned: owned,
    missing: missing,
    avgLevel: Math.round(avgLevel * 10) / 10,
    evoUnlocked: evoUnlocked,
    heroCapable: heroCapable,
    champions: champs,
    tower: arch.tower,
    tags: arch.tags || [],
    tier: arch.tier,
    win: arch.win,
    meta: arch.meta,
    modes: arch.modes || [arch.meta],
    violations: violations,
    notes: notes,
  };
}

// Rank every archetype against the player.
function rankArchetypes(index, fav) {
  if (typeof META_DECKS === "undefined") return [];
  return META_DECKS.map(function(a) { return scoreArchetype(a, index, fav); })
                   .sort(function(a, b) { return b.score - a.score; });
}

// Cards that need upgrading to make a deck playable: missing cards and cards
// below the deck's average level, with the cards/gold needed to reach max.
function deckUpgradePlan(result, index, cardsToMaxFn, goldToMaxFn) {
  var plan = [];
  result.missing.forEach(function(name) {
    var db = allCardsDb[name];
    if (!db) return;
    plan.push({ name: name, need: "not owned", rarity: db.rarity, cards: null, gold: null });
  });
  result.owned.forEach(function(name) {
    var c = index[name];
    if (!c || c.level >= c.maxLevel) return;
    plan.push({
      name: name,
      need: "level " + c.level + "→" + c.maxLevel,
      rarity: c.rarity,
      cards: cardsToMaxFn(c),
      gold: goldToMaxFn(c),
    });
  });
  plan.sort(function(a, b) {
    if (a.need === "not owned" && b.need !== "not owned") return -1;
    if (b.need === "not owned" && a.need !== "not owned") return 1;
    return (b.cards || 0) - (a.cards || 0);
  });
  return plan;
}
