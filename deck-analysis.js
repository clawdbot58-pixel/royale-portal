/* =====================================================
   deck-analysis.js — deck quality, autofill, upgrade value
   Pure logic: no DOM, no fetch. Reads the globals from
   card-data.js, card-roles.js, meta-decks.js and
   deck-engine.js (cardFlags / assignSlots).

   Inspired by deckshop's deck check (coverage checklist)
   and deckai's deck analysis (elixir + cycle metrics).
   ===================================================== */

// Coverage checks: each has a weight that sums to 100, so the
// deck score is simply the weight of everything that passes.
var DECK_CHECKS = [
  { id: "win",      label: "Win condition",           weight: 18, need: "1+" },
  { id: "air",      label: "Anti-air",                weight: 14, need: "2+" },
  { id: "small",    label: "Small spell",             weight: 12, need: "≤3⚡" },
  { id: "tankkill", label: "Tank killer",             weight: 10, need: "1+" },
  { id: "big",      label: "Big spell",               weight: 10, need: "4+⚡" },
  { id: "splash",   label: "Splash damage",           weight: 8,  need: "1+" },
  { id: "avg",      label: "Average elixir",          weight: 8,  need: "≤4.0" },
  { id: "building", label: "Defensive building",      weight: 7,  need: "1+" },
  { id: "swarm",    label: "Swarm / cheap defence",   weight: 7,  need: "1+" },
  { id: "cycle",    label: "Fast cycle",              weight: 6,  need: "4-card ≤9⚡" },
];

var DECK_CHECK_TOTAL = DECK_CHECKS.reduce(function(a, c) { return a + c.weight; }, 0);

function roleEntry(name) {
  if (typeof CARD_ROLES === "undefined") return null;
  return CARD_ROLES[name] || null;
}

function elixirOf(c) {
  return typeof c.elixirCost === "number" ? c.elixirCost : 4;
}

function hasTag(r, tag) {
  return !!(r && r.tags && r.tags.indexOf(tag) !== -1);
}

// Is this card a defensive building (not a siege win condition)?
function isDefBuilding(r) {
  return !!r && r.role === "building" && !hasTag(r, "win-condition");
}

// Everything the coverage checks count. `cards` is 0–8 merged card objects.
function deckCoverage(cards) {
  var cov = {
    win: [], small: [], big: [], spells: [], air: [], splash: [],
    tankkill: [], building: [], swarm: [], cheap: [],
    elixir: 0, count: cards.length,
  };
  cards.forEach(function(c) {
    var r = roleEntry(c.name) || {};
    var e = elixirOf(c);
    cov.elixir += e;
    if (e <= 2) cov.cheap.push(c);
    if (r.role === "spell") {
      cov.spells.push(c);
      if (e <= 3) cov.small.push(c); else cov.big.push(c);
      // Spells stay out of air/splash coverage: Zap answers Minions but
      // nothing stops a Balloon, so a spell-only "air defence" is a lie
      // the grade must not tell. Durable answers only (see scoreArchetype).
      return;                        // spells are not troops/buildings
    }
    if (r.role === "win-condition") cov.win.push(c);
    if (r.air) cov.air.push(c);
    if (r.splash) cov.splash.push(c);
    if (r.role === "tank-killer" || hasTag(r, "tank-killer")) cov.tankkill.push(c);
    if (isDefBuilding(r)) cov.building.push(c);
    if (r.role === "swarm" || hasTag(r, "swarm")) cov.swarm.push(c);
  });
  return cov;
}

// Sorted elixir costs of the deck (or partial deck).
function elixirList(cards) {
  return cards.map(elixirOf).sort(function(a, b) { return a - b; });
}

// Cost of the fastest 4-card rotation. null when the deck is incomplete.
function cycleCost(cards) {
  if (cards.length < 4) return null;
  var s = elixirList(cards);
  return s[0] + s[1] + s[2] + s[3];
}

function names(list) {
  return list.map(function(c) { return c.name; }).join(", ");
}

// Evaluate every coverage check against a deck (works on partial decks too).
function deckChecks(cards) {
  var cov = deckCoverage(cards);
  var avg = cov.count ? cov.elixir / cov.count : 0;
  var cyc = cycleCost(cards);
  var byId = {};

  DECK_CHECKS.forEach(function(def) {
    var ok = false, detail = "";
    switch (def.id) {
      case "win":
        ok = cov.win.length >= 1;
        detail = cov.win.length ? names(cov.win) : "nothing takes towers";
        break;
      case "air":
        ok = cov.air.length >= 2;
        detail = cov.air.length ? cov.air.length + " · " + names(cov.air) : "no troop targets air";
        break;
      case "small":
        ok = cov.small.length >= 1;
        detail = cov.small.length ? names(cov.small) : "no 1–3⚡ spell";
        break;
      case "big":
        ok = cov.big.length >= 1;
        detail = cov.big.length ? names(cov.big) : "no 4+⚡ spell";
        break;
      case "tankkill":
        ok = cov.tankkill.length >= 1;
        detail = cov.tankkill.length ? names(cov.tankkill) : "nothing shreds tanks";
        break;
      case "splash":
        ok = cov.splash.length >= 1;
        detail = cov.splash.length ? names(cov.splash) : "single-target only";
        break;
      case "avg":
        ok = cov.count > 0 && avg <= 4.0;
        detail = avg ? avg.toFixed(2) + "⚡" : "—";
        break;
      case "building":
        ok = cov.building.length >= 1;
        detail = cov.building.length ? names(cov.building) : "no defensive building";
        break;
      case "swarm":
        ok = cov.swarm.length >= 1 || cov.cheap.length >= 3;
        detail = cov.swarm.length ? names(cov.swarm)
          : (cov.cheap.length ? cov.cheap.length + " cards at 2⚡ or less" : "all cards cost 3⚡+");
        break;
      case "cycle":
        ok = cyc != null && cyc <= 9;
        detail = cyc != null ? cyc + "⚡ for 4 cards" : "deck incomplete";
        break;
    }
    var chk = {
      id: def.id, label: def.label, need: def.need, weight: def.weight,
      ok: ok, detail: detail,
    };
    byId[def.id] = chk;
  });

  return DECK_CHECKS.map(function(d) { return byId[d.id]; });
}

// A one-paragraph game plan synthesized from the deck's composition.
// Same vocabulary the archetype blurbs use, so a custom build reads like a
// real deck and a plan-less pile reads as one.
function deckStrategy(cards) {
  if (!cards.length) return "";
  var cov = deckCoverage(cards);
  function tag(c, t) { var r = roleEntry(c.name) || {}; return (r.tags || []).indexOf(t) !== -1; }
  function cheapest(list) {
    return list.slice().sort(function(a, b) { return elixirOf(a) - elixirOf(b); })[0] || null;
  }

  if (!cov.win.length) {
    if (cov.spells.length >= 2) return "No tower-taking card — this is a spell-cycle plan: defend cheaply and close towers with " + names(cov.spells) + ".";
    return "No tower-taking card and not enough spells to chip with — add a win condition.";
  }
  var main = cheapest(cov.win);
  var others = cov.win.filter(function(c) { return c !== main; });
  var backup = others.length ? " (" + names(others) + " as backup)" : "";
  var big = cheapest(cov.big), small = cheapest(cov.small);
  var tanks = cards.filter(function(c) { var r = roleEntry(c.name) || {}; return r.role === "tank"; });
  var tank = cheapest(tanks);

  if (tag(main, "siege"))
    return "Plant " + main.name + " at the bridge and defend the siege" + backup +
      (big ? "; " + big.name + " clears the swarm they send at it." : ".");
  if (elixirOf(main) >= 5 && tank)
    return "Build " + tank.name + " + " + main.name + " from the back" + backup +
      (big || small ? "; answer their defense with " + (big || small).name + "." : ".");
  var bait = cards.filter(function(c) { return tag(c, "log-bait") && c.name !== main.name; });
  if (tag(main, "log-bait") && bait.length)
    return "Bait their log with " + bait[0].name + ", then " + main.name + backup +
      (small ? " — keep " + small.name + " for the tower close." : ".");
  var cyc = cycleCost(cards);
  if (cyc != null && cyc <= 9)
    return "Out-cycle to " + main.name + backup + " and punish every mismatch" +
      (small ? "; close towers with " + small.name + "." : ".");
  return "Send " + main.name + backup + " with support and defend the counter-push" +
    (big ? " — " + big.name + " deletes their commit." : ".");
}

// Offence / defence split, used for the atk-def balance metric.
function atkDefSplit(cards) {
  var OFF = ["win-condition", "push", "beatdown", "siege"];
  var DEF = ["control", "air-defense", "ground-defense", "building", "tank-killer", "swarm"];
  var atk = 0, def = 0;
  cards.forEach(function(c) {
    var r = roleEntry(c.name);
    if (!r) return;
    var tags = r.tags || [];
    if (OFF.some(function(t) { return tags.indexOf(t) !== -1; })) atk++;
    if (DEF.some(function(t) { return tags.indexOf(t) !== -1; })) def++;
  });
  var total = atk + def;
  return { atk: atk, def: def, atkPct: total ? Math.round(atk / total * 100) : 50 };
}

function gradeFor(score) {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "E";
}

// Full read-out for one deck: metrics + checklist + score.
function analyzeDeck(cards, tower) {
  var checks = deckChecks(cards);
  var cov = deckCoverage(cards);
  var score = checks.reduce(function(a, c) { return a + (c.ok ? c.weight : 0); }, 0);
  var bal = atkDefSplit(cards);
  return {
    count: cards.length,
    avg: cov.count ? cov.elixir / cov.count : 0,
    cycle: cycleCost(cards),
    fullCycle: cov.elixir,
    score: score,
    grade: gradeFor(score),
    checks: checks,
    missing: checks.filter(function(c) { return !c.ok; }),
    atk: bal.atk,
    def: bal.def,
    atkPct: bal.atkPct,
    tower: tower || null,
  };
}

// Partial credit for how far a deck is toward each check (0..1).
// The headline score stays binary; this softer version only steers the
// auto-filler, so a "needs 2 anti-air" gap can be worked toward instead
// of only closing when the second card lands last.
function deckProgress(cards) {
  var cov = deckCoverage(cards);
  var avg = cov.count ? cov.elixir / cov.count : 0;
  var cyc = cycleCost(cards);
  var frac = function(n, need) { return n >= need ? 1 : n / need; };
  var p = {
    win: frac(cov.win.length, 1),
    air: frac(cov.air.length, 2),
    small: frac(cov.small.length, 1),
    tankkill: frac(cov.tankkill.length, 1),
    big: frac(cov.big.length, 1),
    splash: frac(cov.splash.length, 1),
    avg: avg ? (avg <= 4.0 ? 1 : Math.max(0, 1 - (avg - 4.0) / 0.8)) : 0,
    building: frac(cov.building.length, 1),
    swarm: Math.max(frac(cov.swarm.length, 1), frac(cov.cheap.length, 3)),
    cycle: cyc == null ? 0 : (cyc <= 9 ? 1 : Math.max(0, 1 - (cyc - 9) / 4)),
  };
  var total = 0;
  DECK_CHECKS.forEach(function(d) { total += d.weight * (p[d.id] || 0); });
  return total;
}

// ---- Slot feasibility -------------------------------------------------
// A special card only activates in a slot that accepts it, so a set of
// special cards fits iff every one of them can be matched to a distinct
// special slot (champion / evolution / hero / wild).
function specialAllowed(f, slot) {
  if (slot === "champion")  return f.isChampion;
  if (slot === "evolution") return f.evoCapable;
  if (slot === "hero")      return f.heroCapable;
  if (slot === "wild")      return f.isChampion || f.heroCapable || f.evoCapable;
  return false;
}

function fitsSpecialSlots(cards) {
  var slots = ["champion", "evolution", "hero", "wild"];
  var flags = cards.map(cardFlags).filter(function(f) {
    return f.isChampion || f.heroCapable || f.evoCapable;
  });
  if (flags.length > slots.length) return false;

  var assign = {};                 // slot index → flag index
  function tryPlace(i, seen) {
    for (var s = 0; s < slots.length; s++) {
      if (seen[s] || !specialAllowed(flags[i], slots[s])) continue;
      seen[s] = true;
      if (assign[s] === undefined || tryPlace(assign[s], seen)) {
        assign[s] = i;
        return true;
      }
    }
    return false;
  }
  for (var i = 0; i < flags.length; i++) {
    if (!tryPlace(i, [])) return false;
  }
  return true;
}

// ---- Autofill ---------------------------------------------------------
// Greedy 8-pick builder: coverage gaps pay the most, then card quality,
// while average elixir and special-slot capacity act as constraints.
function autofillDeck(pool) {
  var picked = [];
  var used = {};

  function specials(c) {
    var f = cardFlags(c);
    return f.isChampion || f.heroCapable || f.evoCapable;
  }

  function scoreFor(c, chosen) {
    var f = cardFlags(c);
    var trial = chosen.concat([c]);

    // Hard constraints: capacity of the special slots.
    if (specials(c)) {
      var sp = trial.filter(specials);
      if (sp.length > 4) return -1e9;
      if (trial.filter(function(x) { return cardFlags(x).isChampion; }).length > 2) return -1e9;
      if (trial.filter(function(x) { return cardFlags(x).evoUnlocked; }).length > 2) return -1e9;
      if (trial.filter(function(x) { return cardFlags(x).heroCapable; }).length > 2) return -1e9;
      if (!fitsSpecialSlots(trial)) return -1e9;
    }

    var s = 0;

    // 1. Closing a coverage gap is worth the most; partial progress counts
    //    so the filler does not leave a count-based gap until the last pick.
    s += deckProgress(trial) - deckProgress(chosen);

    // 2. Card quality: level progress, evolutions, special rarity.
    var lvl = c.maxLevel ? c.level / c.maxLevel : 0;
    s += lvl * 8;
    if (f.evoUnlocked) s += 3;
    if (f.isChampion) s += 1.5;
    if (f.heroCapable) s += 1;

    // 3. Keep the average elixir in the healthy band.
    var avgBefore = chosen.reduce(function(a, x) { return a + elixirOf(x); }, 0);
    var avgAfter = (avgBefore + elixirOf(c)) / trial.length;
    if (avgAfter > 4.0) s -= (avgAfter - 4.0) * 25;
    if (avgAfter > 4.6) s -= 60;

    // 4. Avoid piling onto a role the deck already has three of.
    var r = roleEntry(c.name);
    if (r && r.role && trial.filter(function(x) {
      var rr = roleEntry(x.name);
      return rr && rr.role === r.role;
    }).length > 3) s -= 5;

    return s;
  }

  for (var step = 0; step < 8; step++) {
    var best = null, bestScore = -1e9;
    for (var i = 0; i < pool.length; i++) {
      var c = pool[i];
      if (used[c.name]) continue;
      var s = scoreFor(c, picked);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (!best) break;
    picked.push(best);
    used[best.name] = true;
  }

  // Repair: if the specials cannot all be activated, drop the last special
  // and refill with the best plain card still available.
  var guard = 0;
  while (!fitsSpecialSlots(picked) && guard++ < 8) {
    var drop = -1;
    for (var j = picked.length - 1; j >= 0; j--) {
      if (specials(picked[j])) { drop = j; break; }
    }
    if (drop < 0) break;
    used[picked[drop].name] = false;
    picked.splice(drop, 1);
    var fill = null, fillScore = -1e9;
    for (var k = 0; k < pool.length; k++) {
      if (used[pool[k].name]) continue;
      if (specials(pool[k])) continue;
      var fs = scoreFor(pool[k], picked);
      if (fs > fillScore) { fillScore = fs; fill = pool[k]; }
    }
    if (!fill) break;
    picked.push(fill);
    used[fill.name] = true;
  }

  // Playability repair: a deck with no tower-taking card (or no spell to
  // cycle) is unplayable, so when the pool has one, trade the pick whose
  // removal costs the least coverage for the best available candidate —
  // cheapest win condition first, small (cyclable) spells first.
  function capsOk(list) {
    if (list.filter(specials).length > 4) return false;
    if (list.filter(function(x) { return cardFlags(x).isChampion; }).length > 2) return false;
    if (list.filter(function(x) { return cardFlags(x).evoUnlocked; }).length > 2) return false;
    if (list.filter(function(x) { return cardFlags(x).heroCapable; }).length > 2) return false;
    return fitsSpecialSlots(list);
  }

  function playabilityFix(wanted, sortAdds) {
    if (picked.some(function(c) { return wanted(roleEntry(c.name) || {}); })) return;
    var adds = pool.filter(function(c) {
      return !used[c.name] && wanted(roleEntry(c.name) || {});
    }).sort(sortAdds);
    if (!adds.length) return;

    var base = deckProgress(picked);
    var nowOk = {};
    deckChecks(picked).forEach(function(x) { nowOk[x.id] = x.ok; });

    for (var a = 0; a < adds.length; a++) {
      var add = adds[a];
      var bestDrop = -1, bestLoss = Infinity, bestBroken = Infinity, bestCost = -1;
      for (var d = 0; d < picked.length; d++) {
        var trial = picked.filter(function(x) { return x !== picked[d]; }).concat([add]);
        if (!capsOk(trial)) continue;
        var afterOk = {};
        deckChecks(trial).forEach(function(x) { afterOk[x.id] = x.ok; });
        var broken = 0;
        DECK_CHECKS.forEach(function(x) {
          if (nowOk[x.id] && !afterOk[x.id]) broken++;
        });
        var loss = base - deckProgress(trial);
        var cost = elixirOf(picked[d]);
        if (loss < bestLoss - 1e-9 ||
            (Math.abs(loss - bestLoss) <= 1e-9 &&
             (broken < bestBroken ||
              (broken === bestBroken && cost > bestCost)))) {
          bestLoss = loss; bestBroken = broken; bestDrop = d; bestCost = cost;
        }
      }
      if (bestDrop < 0) continue;
      var dropped = picked[bestDrop];
      picked.splice(bestDrop, 1, add);
      used[dropped.name] = false;
      used[add.name] = true;
      return;
    }
  }

  playabilityFix(function(r) {
    return r.role === "win-condition" || hasTag(r, "win-condition");
  }, function(a, b) {
    var ea = elixirOf(a), eb = elixirOf(b);
    if (ea !== eb) return ea - eb;                    // cheap = reachable
    var la = a.maxLevel ? a.level / a.maxLevel : 0;
    var lb = b.maxLevel ? b.level / b.maxLevel : 0;
    if (Math.abs(la - lb) > 0.01) return lb - la;
    return a.name.localeCompare(b.name);
  });
  playabilityFix(function(r) { return r.role === "spell"; }, function(a, b) {
    var sa = elixirOf(a) <= 3 ? 0 : 1;
    var sb = elixirOf(b) <= 3 ? 0 : 1;
    if (sa !== sb) return sa - sb;                    // small = cyclable
    var ea = elixirOf(a), eb = elixirOf(b);
    if (ea !== eb) return ea - eb;
    return a.name.localeCompare(b.name);
  });

  var assigned = assignSlots(picked);
  return picked.map(function(c) {
    return { name: c.name, slot: assigned.slots[c.name] || "normal" };
  });
}

// ---- Swap suggestions -------------------------------------------------
// For every coverage gap: which owned card would close it, and which deck
// card is the least loss to make room. A swap is only suggested when the
// post-swap deck (8 cards) actually closes the gap AND keeps every check
// that already passes.
function swapSuggestions(cards, pool) {
  var out = [];
  var inDeck = {};
  cards.forEach(function(c) { inDeck[c.name] = true; });

  var checks = deckChecks(cards);

  checks.forEach(function(chk) {
    if (chk.ok || chk.id === "avg" || chk.id === "cycle") return;

    var candidates = pool.filter(function(c) {
      if (inDeck[c.name]) return false;
      return coversCheck(c, chk.id, cards);
    });

    candidates.sort(function(a, b) {
      var fa = cardFlags(a), fb = cardFlags(b);
      var la = a.maxLevel ? a.level / a.maxLevel : 0;
      var lb = b.maxLevel ? b.level / b.maxLevel : 0;
      if (fa.evoUnlocked !== fb.evoUnlocked) return fa.evoUnlocked ? -1 : 1;
      if (Math.abs(la - lb) > 0.01) return lb - la;
      return a.name.localeCompare(b.name);
    });

    var victims = victimOrder(cards, chk.id);
    var offered = 0;
    for (var i = 0; i < candidates.length && offered < 3; i++) {
      var cand = candidates[i];
      for (var j = 0; j < victims.length; j++) {
        var victimName = victims[j];
        var after = cards.filter(function(c) { return c.name !== victimName; })
                         .concat([cand]);
        var afterOk = {};
        deckChecks(after).forEach(function(a) { afterOk[a.id] = a.ok; });
        if (!afterOk[chk.id]) continue;               // gap not closed
        var breaks = checks.some(function(p) {
          return p.ok && p.id !== chk.id && !afterOk[p.id];
        });
        if (breaks) continue;                         // would break a pass
        out.push({
          check: chk.id,
          label: chk.label,
          inn: cand.name,
          out: victimName,
          why: chk.detail,
        });
        offered++;
        break;
      }
    }
  });

  return out;
}

// Would adding this card close the given check?
function coversCheck(card, checkId, cards) {
  var probe = cards.concat([card]);
  var chk = deckChecks(probe).filter(function(c) { return c.id === checkId; })[0];
  return !!(chk && chk.ok);
}

// Deck cards to sacrifice, least valuable first: a card goes earlier the
// fewer passing checks its removal would break, then by lower level.
function victimOrder(cards, checkId) {
  return cards.slice().sort(function(a, b) {
    var ra = redundancy(a, cards, checkId);
    var rb = redundancy(b, cards, checkId);
    if (ra !== rb) return rb - ra;
    var la = a.maxLevel ? a.level / a.maxLevel : 0;
    var lb = b.maxLevel ? b.level / b.maxLevel : 0;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  }).map(function(c) { return c.name; });
}

// How safe is it to remove this card? +1 for every check that currently
// passes (other than the gap being filled) and still passes without it —
// i.e. the removal breaks fewer of the deck's passing checks.
function redundancy(card, cards, gapId) {
  var others = cards.filter(function(c) { return c.name !== card.name; });
  var kept = {}, without = {};
  deckChecks(cards).forEach(function(chk) { kept[chk.id] = chk.ok; });
  deckChecks(others).forEach(function(chk) { without[chk.id] = chk.ok; });

  var count = 0;
  DECK_CHECKS.forEach(function(d) {
    if (d.id === gapId || !kept[d.id]) return;
    if (without[d.id]) count++;
  });
  return count;
}

// ---- Upgrade value ----------------------------------------------------
// Which single upgrade helps the most of your best-fit archetypes.
function upgradeValueList(index, limit) {
  if (typeof META_DECKS === "undefined") return [];
  var TIER_W = { S: 3, A: 2, B: 1 };
  var ROLE_W = {
    "win-condition": 3, spell: 2.2, "air-defense": 1.8, "tank-killer": 1.8,
    building: 1.4, tank: 1.3, splash: 1.3, "air-attack": 1.2, swarm: 1.1,
    cycle: 1, support: 1, control: 1,
  };

  var rows = [];
  Object.keys(index).forEach(function(name) {
    var c = index[name];
    if (!c || !c.owned || c.level >= c.maxLevel || c.type === "tower") return;

    var decks = META_DECKS.filter(function(a) { return a.cards.indexOf(name) !== -1; });
    if (!decks.length) return;

    var weight = decks.reduce(function(a, d) { return a + (TIER_W[d.tier] || 1); }, 0);
    var r = roleEntry(name) || {};
    var impact = weight * (ROLE_W[r.role] || 1);

    rows.push({
      name: name,
      rarity: c.rarity,
      level: c.level,
      maxLevel: c.maxLevel,
      impact: impact,
      decks: decks.length,
      sDecks: decks.filter(function(d) { return d.tier === "S"; }).length,
      cards: cardsForNext(c),
      gold: goldForNext(c),
      role: r.role || "",
    });
  });

  rows.sort(function(a, b) {
    if (b.impact !== a.impact) return b.impact - a.impact;
    return a.name.localeCompare(b.name);
  });

  var top = rows.slice(0, limit || 8);
  var max = top.length ? top[0].impact : 1;
  top.forEach(function(r) { r.pct = Math.max(6, Math.round(r.impact / max * 100)); });
  return top;
}
