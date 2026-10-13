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
// real deck and a plan-less pile reads as one. Works on 0–8 cards.
function deckStrategy(cards) {
  if (!cards.length) return "";
  var cov = deckCoverage(cards);
  function tag(c, t) { var r = roleEntry(c.name) || {}; return (r.tags || []).indexOf(t) !== -1; }
  function cost(c) { return elixirOf(c); }
  function descCost(a, b) { return cost(b) - cost(a); }
  function ascCost(a, b) { return cost(a) - cost(b); }

  if (!cov.win.length) {
    if (cov.spells.length >= 2) {
      var sp = cov.spells.slice().sort(descCost);
      var listed = names(sp.slice(0, 3));
      if (sp.length > 3) listed += " and " + (sp.length - 3) + " more";
      return "No tower-taking card — this is a spell-cycle plan: defend cheaply and close towers with " + listed + ".";
    }
    if (cov.spells.length === 1)
      return "No tower-taking card — a spell-cycle plan needs a second spell to chip with; add a win condition or another spell.";
    return "No tower-taking card and no spells to chip with — add a win condition.";
  }

  // Which win condition leads. Bait decks lead with their log-bait threat;
  // Balloon (when a tank is present) and Sparky ride behind the real threat;
  // fast decks out-cycle with their cheapest threat, slow decks build the tank.
  var cands = cov.win.slice();
  if (cands.length > 1) {
    var baitWins = cands.filter(function (c) { return tag(c, "log-bait"); });
    if (baitWins.length) cands = baitWins.slice().sort(descCost);
    var hasTankWin = cands.some(function (c) {
      return tag(c, "beatdown") && c.name !== "Balloon" && c.name !== "Sparky";
    });
    var slim = cands.filter(function (c) {
      return c.name !== "Sparky" && (c.name !== "Balloon" || !hasTankWin);
    });
    if (slim.length) cands = slim;
  }
  var cyc = cycleCost(cards);
  var fast = cyc != null && cyc <= 9;
  var main;
  if (cands.length === 1) {
    main = cands[0];
  } else if (fast) {
    var cycWins = cands.filter(function (c) { return tag(c, "cycle"); });
    if (cycWins.length) main = cycWins.slice().sort(ascCost)[0];
    else {
      var siegeWins = cands.filter(function (c) { return tag(c, "siege"); });
      main = (siegeWins.length ? siegeWins : cands).slice().sort(descCost)[0];
    }
  } else {
    var tankWins = cands.filter(function (c) { return tag(c, "beatdown"); });
    main = (tankWins.length ? tankWins : cands).slice().sort(descCost)[0];
  }

  // Spells: the biggest is the lane-clearer, the cheapest small the closer.
  var big = cov.big.slice().sort(descCost);
  var small = cov.small.slice().sort(ascCost)[0] || null;
  var bigs = big.length ? (big.length === 1 ? big[0].name : big[0].name + " and " + big[1].name) : null;

  var mentioned = {};
  mentioned[main.name] = true;
  function backupTxt() {
    var o = cov.win.filter(function (c) { return !mentioned[c.name]; }).slice(0, 2);
    return o.length ? " (" + names(o) + " as backup)" : "";
  }

  // The card that best covers a push: air / tank answers first.
  var SUPPORT_SCORE = { "tank-killer": 3, "air-defense": 3, "air-attack": 2, "splash": 1,
                        "swarm": 1, "support": 1, "tank": 1, "building": 1, "control": 1, "push": 1 };
  function bestSupport() {
    var best = null, bestScore = 0, bestCost = 0;
    cards.forEach(function (c) {
      if (c === main) return;
      var r = roleEntry(c.name) || {};
      if (r.role === "spell" || r.role === "win-condition") return;
      var s = SUPPORT_SCORE[r.role] || 0;
      if (tag(c, "tank-killer")) s += 1;
      if (s > bestScore || (s === bestScore && s > 0 && cost(c) > bestCost)) {
        best = c; bestScore = s; bestCost = cost(c);
      }
    });
    return best;
  }

  // Graveyard: bait it, pull the defence into the Skeleton Army.
  if (tag(main, "graveyard")) {
    var pulls = cards.filter(function (c) {
      return c !== main && ["Tornado", "Fisherman", "Void", "Vines"].indexOf(c.name) !== -1;
    });
    var cheap = cards.filter(function (c) {
      var r = roleEntry(c.name) || {};
      return c !== main && r.role !== "spell" && r.role !== "win-condition" && cost(c) <= 3;
    }).sort(ascCost)[0] || null;
    var g = "Bait Graveyard" + (cheap ? " with " + cheap.name : "");
    if (pulls.length) g += "; pull the defence to the tower with " + pulls[0].name + " and let the skeletons finish";
    else if (big.length) g += "; " + big[0].name + " cleans up the overcommit";
    else g += " and punish the overcommit";
    return g + backupTxt() + ".";
  }

  // Mortar: the siege building that parks deep behind, not at the bridge.
  if (tag(main, "building") && tag(main, "win-condition")) {
    var m = "Park Mortar far behind your troops and chip the tower";
    if (big.length) m += "; " + big[0].name + " clears any defence that commits";
    return m + backupTxt() + ".";
  }

  // Balloon as the main threat: fly it over the troops.
  if (tag(main, "balloon")) {
    var air = cards.filter(function (c) {
      var r = roleEntry(c.name) || {};
      return c !== main && (r.role === "air-attack" || r.role === "air-defense" || r.role === "tank-killer");
    }).sort(ascCost)[0] || null;
    var b = "Fly Balloon over their defence" + (air ? " with " + air.name : "");
    if (bigs) b += "; " + bigs + (big.length === 1 ? " clears" : " clear") + " the lane";
    return b + backupTxt() + ".";
  }

  // Siege win conditions.
  if (tag(main, "siege")) {
    if (main.name === "X-Bow") {
      var x = "Plant X-Bow at the bridge and defend the siege";
      if (big.length) x += "; " + big[0].name + " clears the swarm they send at it";
      return x + backupTxt() + ".";
    }
    var s = "Set up " + main.name + " behind your defence";
    if (bigs) s += "; " + bigs + (big.length === 1 ? " clears" : " clear") + " the lane";
    return s + backupTxt() + ".";
  }

  // Beatdown: build the tank up with cover behind it.
  if (tag(main, "beatdown")) {
    var tanks = cards.filter(function (c) {
      var r = roleEntry(c.name) || {};
      return c !== main && r.role === "tank";
    });
    var sup = (tanks.length ? tanks.sort(descCost)[0] : null) || bestSupport();
    var t = "Build " + main.name + (sup ? " with " + sup.name + " behind it" : " from your side");
    if (bigs) t += "; " + bigs + " clear" + (big.length === 1 ? "s" : "") + " the lane";
    return t + backupTxt() + ".";
  }

  // Log-bait: bait the log with the cheap threat, then hit with the main.
  if (tag(main, "log-bait")) {
    var baits = cards.filter(function (c) {
      var r = roleEntry(c.name) || {};
      return c !== main && r.role !== "spell" && tag(c, "log-bait");
    }).sort(descCost);
    if (baits.length) {
      mentioned[baits[0].name] = true;
      var bb = "Bait their log with " + baits[0].name + ", then " + main.name + backupTxt();
      if (small) bb += " — keep " + small.name + " for the tower close";
      return bb + ".";
    }
  }

  // Fast cycle: out-cycle the main threat.
  if (fast && cost(main) <= 5) {
    var cy = "Out-cycle to " + main.name + " and punish every mismatch" + backupTxt();
    if (small) cy += "; close towers with " + small.name;
    return cy + ".";
  }

  // Fallback: push the threat with its best support.
  var sup2 = bestSupport();
  var f = "Send " + main.name + (sup2 ? " with " + sup2.name + " behind it" : "") +
    " and defend the counter-push" + backupTxt();
  if (big.length) f += "; " + big[0].name + " deletes their commit";
  return f + ".";
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
