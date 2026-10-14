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

// Greedy slot assignment: unlocked evolution → evolution slot,
// hero-capable or champion → hero slot, the next special card → wild slot,
// everything else → normal. Returns {slots: {name: slot}, specials: [...],
// overflow: [...]} where overflow are special cards with no slot left.
function assignSlots(cards) {
  // No champion slot exists: champions activate in the hero slot or wild.
  var used = { evolution: 0, hero: 0, wild: 0 };
  var out = {}, specials = [], overflow = [];
  var flags = cards.map(cardFlags);

  function place(f, slot) {
    if (used[slot] < 1) { used[slot] = 1; out[f.name] = slot; specials.push({ name: f.name, slot: slot }); return true; }
    return false;
  }

  flags.forEach(function(f) {
    if (f.evoUnlocked && place(f, "evolution")) return;
    if ((f.heroCapable || f.isChampion) && place(f, "hero")) return;
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
  if (champs.length > maxC) v.push("Too many champions: " + champs.length + " (max " + maxC + " — hero slot + wild slot)");

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
  // Capability without ownership is not a note: an unowned hero-capable
  // card is already flagged by deckViolations, not triple-counted here.
  var champs = flags.filter(function(f) { return f.isChampion && f.owned; }).length;
  var heroes = flags.filter(function(f) { return f.heroCapable && f.owned; }).length;
  var evos   = flags.filter(function(f) { return f.evoUnlocked; }).length;
  if (evos   > maxE) n.push(evos   + " evolution cards — only " + maxE + " can be active (evolution slot + wild slot); the rest play as plain cards");
  // Heroes and champions share the hero slot: one of them takes it, the
  // other needs the wild slot, a third of either kind plays as a plain card.
  var maxS = (typeof SLOT_RULES !== "undefined" && SLOT_RULES.maxSpecials) || 3;
  var heroSlotUsers = heroes + champs;
  if (heroSlotUsers > 2) n.push(heroSlotUsers + " heroes + champions — only 2 can be active (hero slot + wild slot); the rest play as plain cards");
  var specialSet = {};
  flags.forEach(function(f) { if (f.isChampion || f.evoUnlocked || f.heroCapable) specialSet[f.name] = true; });
  var special = Object.keys(specialSet).length;
  if (special > maxS) n.push(special + " special cards — only " + maxS + " fit the special slots (evolution, hero, wild); the rest play as plain cards");
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

  // Level-aware tiering: steps to max, which of them are affordable now, and
  // the resulting ready/almost/work bucket.
  var gap = deckUpgradeGap({ owned: owned }, index);
  var state = suggestionTier({ missing: missing, violations: violations }, gap);

  var score = 0;
  score += owned.length * 3;
  // Effective level: an upgrade the player can already pay for counts as done
  // ("if deck good, and one off, and can upgrade, will upgrade"), so a deck 2
  // affordable steps from maxed ranks equal to one that is already maxed.
  var effAvgLevel = gap.effAvgLevel;
  score += effAvgLevel * 2;
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
  // Only troops/buildings count as air answers — a spell that can hit air
  // (Fireball, Lightning, Goblin Curse) is not a durable answer.
  var air = owned.filter(function(n) {
    var r = CARD_ROLES[n];
    return r && r.air && r.role !== "spell";
  }).length;
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
    effAvgLevel: Math.round(effAvgLevel * 10) / 10,
    evoUnlocked: evoUnlocked,
    heroCapable: heroCapable,
    champions: champs,
    tower: arch.tower,
    tags: arch.tags || [],
    tier: arch.tier,
    win: arch.win,
    meta: arch.meta,
    metaWr: arch.metaWr != null ? arch.metaWr : null,
    metaGames: arch.metaGames != null ? arch.metaGames : null,
    modes: arch.modes || [arch.meta],
    violations: violations,
    notes: notes,
    // Level gap to a fully maxed deck, and the tier bucket it implies.
    upgradeSteps: gap.steps,
    upgradesAffordable: gap.affordable,
    upgradesBlocked: gap.blocked,
    upgradeGaps: gap.gaps,
    gapText: describeUpgradeGap(gap),
    tierState: state,
    key: arch.key || null,
    // Slot assignments travel with the result so the UI can show which
    // special forms would actually activate for this player.
    evo: arch.evo || [],
    hero: arch.hero || [],
    champion: arch.champion || [],
  };
}

// ── Upgrade gap analysis ────────────────────────────────────────────────
// One "upgrade step" is one level of one owned card below its max.
//
// Tier rules (the user's spec):
//   ready  — fully maxed, OR ≤2 steps away AND every one of those steps is
//            affordable right now (the player's held `count` covers the cards
//            needed for the next level). Gold is not gating, so goldForNext is
//            carried as information only.
//   almost — ≤2 steps away with at least one step not affordable yet, or
//            3–6 steps away regardless of affordability.
//   work   — 7+ steps away, or any card not owned, or any rule violation.

// Cards/gold for the next level of one merged card. Mirrors app.js's
// cardsForNext()/goldForNext() but is self-contained (same card-data.js
// arrays) so deck-engine stays runnable under node for tests. Returns
// {cards, gold} with null meaning "no cost data / already maxed".
function nextUpgradeCost(card) {
  var rarity = (card && card.rarity || "").toLowerCase();
  var arr = null;
  if (typeof CARDS_COMMON !== "undefined") {
    if (rarity === "common") arr = CARDS_COMMON;
    else if (rarity === "rare") arr = CARDS_RARE;
    else if (rarity === "epic") arr = CARDS_EPIC;
    else if (rarity === "legendary") arr = CARDS_LEGENDARY;
    else if (rarity === "champion") arr = CARDS_CHAMPION;
  }
  var level = (card && card.level) || 0;
  var max = (card && card.maxLevel) || 0;
  var target = level + 1;
  if (level >= max) return { cards: null, gold: null };
  var cards = (arr && target < arr.length) ? (arr[target] || 0) : null;
  var gold = null;
  if (typeof GOLD_PER_LEVEL !== "undefined" && target < GOLD_PER_LEVEL.length) {
    gold = GOLD_PER_LEVEL[target] || null;
  }
  return { cards: cards, gold: gold };
}

// Is the next level of this card already paid for? A missing `count` (the
// stub collections in tests, or a card the API reports without one) is
// treated as unknown-but-possible, never as unaffordable — a deck is never
// dropped because of absent data.
function upgradeAffordable(card, cost) {
  if (cost.cards == null) return true;
  if (!card || typeof card.count !== "number" || isNaN(card.count)) return true;
  return card.count >= cost.cards;
}

// The concrete level gap of one scored archetype: every owned card below
// its max, with its single next step priced and flagged affordable/blocked.
// Returns {steps, affordable, blocked, maxed, effAvgLevel, gaps}.
// `effAvgLevel` is the average level once every affordable step is applied
// (one step per card) — that is the number the ranking uses.
function deckUpgradeGap(result, index) {
  var idx = index || {};
  var gaps = [], steps = 0, affordable = 0, blocked = 0, effSum = 0, counted = 0;

  (result.owned || []).forEach(function(name) {
    var c = idx[name] || {};
    var level = c.level || 0;
    var max = typeof c.maxLevel === "number" ? c.maxLevel : level;
    counted++;
    if (level >= max) { effSum += max; return; }
    var cost = nextUpgradeCost(c);
    var ok = upgradeAffordable(c, cost);
    steps++;
    if (ok) affordable++; else blocked++;
    effSum += ok ? level + 1 : level;
    gaps.push({
      name: name,
      from: level,
      to: level + 1,
      cards: cost.cards,
      gold: cost.gold,
      have: (c && typeof c.count === "number") ? c.count : null,
      affordable: ok,
    });
  });

  // Biggest gap first reads best; affordable steps lead, so "do these now" is
  // visible at a glance.
  gaps.sort(function(a, b) {
    if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
    return (b.to - b.from) - (a.to - a.from);
  });

  return {
    steps: steps,
    affordable: affordable,
    blocked: blocked,
    maxed: steps === 0,
    effAvgLevel: counted ? effSum / counted : 0,
    gaps: gaps,
  };
}

// "2 upgrades away — Cannon Cart 10→11, Zappies 13→14" with each step
// marked: bare means affordable now, "(needs 20 cards, you hold 6)" does not.
function describeUpgradeGap(gap) {
  if (!gap || !gap.steps) return "";
  var head = gap.steps + " upgrade" + (gap.steps === 1 ? "" : "s") + " away";
  if (gap.maxed) return "";
  var body = gap.gaps.map(function(g) {
    if (g.affordable) return g.name + " " + g.from + "→" + g.to;
    var need = g.cards == null ? "?" : g.cards;
    var have = g.have == null ? "?" : g.have;
    return g.name + " " + g.from + "→" + g.to + " (needs " + need + " cards, you hold " + have + ")";
  });
  return head + " — " + body.join(", ");
}

// ready / almost / work. Unowned cards and rule violations always win.
function suggestionTier(result, gap) {
  if (result.missing && result.missing.length) return "work";
  if (result.violations && result.violations.length) return "work";
  var g = gap || { steps: 0, blocked: 0 };
  if (g.steps === 0) return "ready";
  if (g.steps <= 2 && g.blocked === 0) return "ready";
  if (g.steps <= 6) return "almost";
  return "work";
}

// Total cost to make a deck ready: every card that is not owned (full
// unlock, level 0→max) plus every owned card still below max, each to its
// own max. Returns {cards, gold, missing: [names], upgrades: [{name, cards, gold}]}.
// `cardsToMaxFn` / `goldToMaxFn` are app.js's helpers, passed in so this
// stays free of DOM/app dependencies.
function deckUnlockCost(result, index, cardsToMaxFn, goldToMaxFn) {
  var totalCards = 0, totalGold = 0;
  var upgrades = [];

  result.missing.forEach(function(name) {
    var c = index[name] || {};
    var cards = cardsToMaxFn(c);
    var gold = goldToMaxFn(c);
    totalCards += cards;
    totalGold += gold;
  });

  result.owned.forEach(function(name) {
    var c = index[name];
    if (!c || c.level >= c.maxLevel) return;
    var cards = cardsToMaxFn(c);
    var gold = goldToMaxFn(c);
    if (!cards && !gold) return;
    upgrades.push({ name: name, cards: cards, gold: gold });
    totalCards += cards;
    totalGold += gold;
  });

  return {
    cards: totalCards,
    gold: totalGold,
    missing: result.missing.slice(),
    upgrades: upgrades,
  };
}

// For the Invest list: how many (mode-filtered) ranked decks does upgrading
// each card unlock — i.e. decks where that card is a blocker (a missing
// card, or an owned card still below max). Decks that are already ready
// contribute to no card: a deck whose only remaining steps are affordable is
// not held back by anything the player could buy.
function blockerDeckCounts(ranked, index, cardsToMaxFn) {
  var counts = {};
  ranked.forEach(function(a) {
    if (a.tierState === "ready") return;
    a.missing.forEach(function(name) {
      counts[name] = (counts[name] || 0) + 1;
    });
    a.owned.forEach(function(name) {
      var c = index[name];
      if (!c || c.level >= c.maxLevel) return;
      if (cardsToMaxFn(c)) counts[name] = (counts[name] || 0) + 1;
    });
  });
  return counts;
}

// Rank every archetype against the player. Ties break on how ready the deck
// actually is (ready > almost > work) so an equally-scoring deck that only
// needs affordable upgrades floats above one with a real grind ahead.
function rankArchetypes(index, fav) {
  if (typeof META_DECKS === "undefined") return [];
  var order = { ready: 0, almost: 1, work: 2 };
  return META_DECKS.map(function(a) { return scoreArchetype(a, index, fav); })
                   .sort(function(a, b) {
                     if (b.score !== a.score) return b.score - a.score;
                     var d = order[a.tierState] - order[b.tierState];
                     if (d) return d;
                     return a.upgradeSteps - b.upgradeSteps;
                   });
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
