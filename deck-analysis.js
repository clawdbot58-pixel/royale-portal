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

// ── Mirror: the one wildcard card ─────────────────────────────────────
// Mirror is an Epic spell whose in-game cost is "the cost of the previous
// card played, +1" — shown as "?" — and the developer API therefore returns
// NO elixirCost for it. The 4-elixir fallback above would make a Mirror deck
// look like it carries a Fireball-class answer, which is exactly the lie the
// big-spell check must not tell: Mirror can only duplicate the last card
// played, it is never in the starting hand, and it answers nothing.
// Clash Royale counts Mirror as a fixed 1.5-elixir card when working out a
// deck's average elixir (Liquipedia / Clash Royale Wiki), so 1.5 is used for
// every elixir and cycle calculation, and it is excluded from small- and
// big-spell coverage. It still counts as "a spell" so a deck that runs on
// spells is never mistaken for a deck without one.
var MIRROR_ELIXIR = 1.5;

function isWildcardSpell(name) {
  return name === "Mirror";
}

function elixirOf(c) {
  if (isWildcardSpell(c.name)) return MIRROR_ELIXIR;
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
      // Mirror is a spell but never a reliable answer: it duplicates whatever
      // was played last, so it counts for neither the small nor the big slot.
      if (!isWildcardSpell(c.name)) {
        if (e <= 3) cov.small.push(c); else cov.big.push(c);
      }
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

// ---- Archetype classification -----------------------------------------
// deckStrategy() says what to DO; this says what the deck IS. The rule is
// composition only — win-condition tags, the 4-card rotation, average elixir,
// and the building / tank-killer / spell counts each family needs — so it
// works on any 0–8 card pile, never on a META_DECKS lookup.
var ARCHETYPE_LABELS = {
  "spell-cycle": "Spell-cycle deck",
  "siege":        "Siege deck",
  "bait":         "Bait deck",
  "beatdown":     "Beatdown deck",
  "control":      "Control deck",
  "bridge-spam":  "Bridge-spam deck",
  "cycle":        "Cycle deck",
  "misc":         "Unclassified pile",
};

function deckArchetype(cards) {
  cards = cards || [];
  if (!cards.length) {
    return {
      family: "misc",
      label: ARCHETYPE_LABELS.misc,
      why: "No cards yet — pick 8 and this will name the archetype.",
      build: [],
    };
  }

  var cov = deckCoverage(cards);
  var avg = cov.elixir / cov.count;
  var cyc = cycleCost(cards);
  var cost = elixirOf;
  var desc = function(a, b) { return cost(b) - cost(a); };
  var asc = function(a, b) { return cost(a) - cost(b); };
  function role(c) { return roleEntry(c.name) || {}; }
  function tagged(c, t) { return hasTag(role(c), t); }

  // Composition buckets every step below draws from.
  var wins = cov.win.slice();
  // A siege STRUCTURE (Mortar, X-Bow) makes the deck siege outright. A
  // siege-tagged chipper (Magic Archer, Three Musketeers, Royal Giant) only
  // does when it is the deck's sole win condition and the deck is slow
  // enough to play a placement game — otherwise it is one card in a cycle
  // or beatdown deck. ("xbow" is a chipper tag shared with Magic Archer, so
  // it cannot stand in for "is a siege building" here.)
  var siegeStruct = wins.filter(function(c) {
    return tagged(c, "siege") && (hasTag(role(c), "building") || c.name === "X-Bow");
  });
  var siegeUnit = wins.filter(function(c) {
    return tagged(c, "siege") && !hasTag(role(c), "building") && c.name !== "X-Bow";
  });
  var siegeUnitDeck = siegeUnit.length && wins.length === 1 &&
    avg >= 3.5 && (cyc == null || cyc >= 10);
  var baitWins = wins.filter(function(c) { return tagged(c, "log-bait"); });
  var btWins = wins.filter(function(c) { return tagged(c, "building-target") && cost(c) <= 4; });
  var heavyWins = wins.filter(function(c) { return cost(c) >= 5; });
  // A win condition that is walked in behind support rather than sent alone.
  var walkWins = wins.filter(function(c) {
    return cost(c) >= 4 && !tagged(c, "building-target");
  });
  // Cards that exist to walk in front of / behind the win condition.
  var support = cards.filter(function(c) {
    var r = role(c);
    if (r.role === "spell" || r.role === "win-condition") return false;
    return r.role === "tank" || r.role === "support" || r.role === "push" ||
      ((r.role === "air-defense" || r.role === "splash") && cost(c) >= 3);
  }).sort(desc);
  // A win condition cheap and unsieged enough to go alone = the deck cycles to it.
  var fastWins = wins.filter(function(c) {
    return cost(c) <= 4 && !tagged(c, "siege") && !tagged(c, "beatdown");
  });
  var baits = cards.filter(function(c) { return role(c).role !== "spell" && hasTag(role(c), "log-bait"); });
  var buildings = cov.building;
  var tankkill = cov.tankkill.slice().sort(desc);
  var air = cov.air.slice().sort(desc);
  var splash = cov.splash.slice().sort(desc);
  var swarm = cov.swarm.slice().sort(asc);
  var bigs = cov.big.slice().sort(desc);
  var smalls = cov.small.slice().sort(asc);
  var main = null;

  function ref(list, max) {
    var l = (list || []).slice(0, max || 1);
    if (!l.length) return "";
    if (l.length === 1) return l[0].name;
    return names(l.slice(0, -1)) + " or " + l[l.length - 1].name;
  }

  // ── Which family ────────────────────────────────────────────────────
  // Ordered most-specific first: each test is a structure, and `cycle` is
  // the cheap-deck fallback rather than a trump card.
  var family;
  if (!wins.length && cov.spells.length >= 2) {
    family = "spell-cycle";
  } else if (siegeStruct.length) {
    family = "siege"; main = siegeStruct.slice().sort(desc)[0];
  } else if (baitWins.length && baits.length >= 2) {
    family = "bait"; main = baitWins.slice().sort(desc)[0];
} else if (siegeUnitDeck) {
    family = "siege"; main = siegeUnit.slice().sort(desc)[0];
  } else if ((heavyWins.length || walkWins.length) && support.length) {
    family = "beatdown";
    main = (heavyWins.concat(walkWins).slice().sort(desc))[0];
  } else if (buildings.length && tankkill.length && cov.spells.length && (cyc == null || cyc > 9)) {
    family = "control"; main = wins.slice().sort(desc)[0] || null;
  } else if ((btWins.length >= 2 || (wins.length >= 2 && btWins.length >= 1)) && avg <= 4.2) {
    family = "bridge-spam"; main = btWins.slice().sort(desc)[0];
  } else if (cyc != null && cyc <= 9 && fastWins.length) {
    family = "cycle"; main = fastWins.slice().sort(asc)[0];
  } else {
    family = "misc"; main = (wins.slice().sort(desc)[0] || null);
  }

  // ── Why ─────────────────────────────────────────────────────────────
  var why;
  switch (family) {
    case "spell-cycle":
      why = "Nothing takes a tower, so " + cov.spells.length + " spells (" +
        ref(cov.spells.slice().sort(desc), 3) + ") carry the whole game.";
      break;
    case "siege":
      why = main.name + (hasTag(role(main), "building") ? " is a siege building — the deck sets it up and lives behind it."
        : " chips from behind their defence, so the deck plays a slow placement game.");
      break;
    case "bait":
      why = baits.length + " log-bait cards (" + ref(baits, 3) + ") pull The Log before " +
        main.name + " goes to the lane it missed.";
      break;
    case "beatdown":
      why = avg.toFixed(1) + "⚡ average built around a " + cost(main) + "⚡ win condition" +
        (support.length ? " with " + ref(support, 2) + " to walk it in" : "") +
        " — a slow push that wants elixir banked.";
      break;
    case "control":
      why = ref(buildings, 1) + " holds the lane, " + ref(tankkill, 1) +
        " shreds what comes at it, and spells finish the rest.";
      break;
    case "bridge-spam":
      why = btWins.length > 1
        ? btWins.length + " win conditions all target buildings at moderate cost (" + ref(btWins, 3) + ")."
        : wins.length + " win conditions with " + ref(btWins, 1) +
          " going straight for their building — two threats, one lane.";
      break;
    case "cycle":
      why = (cyc == null ? "A cheap core" : cyc + "⚡ for the cheapest 4 cards") +
        " — you get back to the win condition before they do." +
        (cov.cheap.length ? " " + cov.cheap.length + " cards at 2⚡ or less." : "");
      break;
    default:
      why = (wins.length ? ref(wins, 2) + " takes towers" : "Nothing clearly takes towers") +
        " at " + avg.toFixed(1) + "⚡ average" +
        (cyc == null ? "" : " and a " + cyc + "⚡ 4-card rotation") +
        " — no single archetype structure, so play it card for card.";
  }

  // ── Build: 3–5 concrete steps, only ever naming cards in the deck ─────
  var lead = main ? main.name : null;
  var big = bigs[0] || null, small = smalls[0] || null;
  var tk = tankkill[0] || null, ar = air[0] || null, sp = splash[0] || null;
  var sw = swarm[0] || null, bld = buildings[0] || null;
  var build = [];

  switch (family) {
    case "spell-cycle":
      build.push("Win condition: none — every tower comes from a spell you cycle to.");
      build.push("Lead with " + (small || big).name + " when they spend nothing, and finish with " +
        (big || small).name + " when they answer it.");
      if (tk) build.push("Defend tanks with " + tk.name + " so you keep the elixir to cycle.");
      else if (sw) build.push("Defend with " + sw.name + " so you keep the elixir to cycle.");
      build.push(tk ? "You lose to heavy tanks that " + tk.name + " cannot hold — trade elixir early."
        : "You lose to heavy tanks: there is no tank killer, so every tank is a trade.");
      break;

    case "siege":
      build.push(lead + " is the win condition — " +
        (hasTag(role(main), "building")
          ? "set it up far behind your own side and chip."
          : "keep it in the back lane, out of their reach, and chip while they build a defence."));
      if (tk) build.push("Defend with " + tk.name + (ar ? " and answer air with " + ar.name : "") +
        "; they will send swarms and tanks at it.");
      else build.push("Defend with " + ((ar || sp || sw) ? (ar || sp || sw).name : "your cheapest card") +
        "; they will send swarms and tanks at it.");
      if (big) build.push(big.name + " cleans up a committed push instead of defending card for card.");
      else if (small) build.push("Keep " + small.name + " to cycle between placements.");
      build.push("You lose to heavy hitters that reach your tower before the chips land — never push up first.");
      break;

    case "bait":
      build.push("Bait The Log with " + ref(baits, 1) + (baits.length > 1 ? " and " + baits[1].name + " behind it" : "") + ".");
      build.push("Then send " + lead + " to the lane their Log just missed.");
      if (small) build.push("Keep " + small.name + " to finish the tower once the defence is spent.");
      if (big && big.name !== small && big.name !== lead)
        build.push(big.name + " is the answer when they hold it with a tank instead.");
      build.push("You lose to decks with no spell at all — bait nothing, just push " + lead + " behind support.");
      break;

    case "beatdown":
      build.push("Bank elixir and build " + lead + " at the back from a fresh bar.");
      var behind = support.filter(function(c) { return c.name !== lead; });
      if (behind.length) build.push("Put " + ref(behind, 2) +
        (behind.length > 1 ? " behind it" : " behind it") + " so their tank engages your support first.");
      if (sp && sp.name !== lead) build.push(sp.name + " answers their swarms while the push walks in.");
      if (big) build.push(big.name + " deletes their committed answer once it lands behind the tower.");
      build.push("You lose to fast cycle decks that outpace the push — the push only has to start once.");
      break;

    case "control":
      build.push("Park " + bld.name + " at the bridge and let them overcommit onto it.");
      if (tk) build.push("Answer their tank with " + tk.name + (ar ? " and their air with " + ar.name : "") + ".");
      if (big) build.push(big.name + " burns the whole push rather than defending card for card.");
      else if (small) build.push("Keep " + small.name + " to cycle between defences.");
      build.push(lead ? "Win condition: " + lead + " once the tower is softened by the spells."
        : "Win condition: none — add a tower-taker, the spells only chip.");
      break;

    case "bridge-spam":
      build.push("Win conditions " + ref(btWins.length > 1 ? btWins : wins, 3) +
        " — each one goes straight for what they put behind their defence.");
      build.push(btWins.length > 1
        ? "Commit two of them in the same lane the moment they place a tank."
        : "Commit it the moment they place a tank, with a second threat queued behind it.");
      if (tk) build.push(tk.name + " is the answer to that tank" + (ar ? " and " + ar.name + " to their air" : "") + ".");
      if (big) build.push(big.name + " clears the lane on their counter-push.");
      else if (small) build.push("Keep " + small.name + " for the tower close.");
      build.push("You lose to heavy spells — at " + avg.toFixed(1) + "⚡ you cannot afford to trade down.");
      break;

    case "cycle":
      build.push("Win condition: " + (lead || "whatever you can reach first") + " — cycle back to it before they recover.");
      if (sw) build.push("Defend with " + sw.name + (tk ? " and " + tk.name + " for the tanks" : "") + "; hold the cheap cards for the counter.");
      else if (tk) build.push("Defend with " + tk.name + " and keep the cheap cards for the counter.");
      build.push((cyc == null ? "Your 4-card rotation is cheap" : "Your 4-card rotation is " + cyc + "⚡") +
        " — rotate in pairs at the bridge and never let them set elixir.");
      if (small) build.push("Close the tower with " + small.name + " instead of defending with it.");
      build.push("You lose to decks with a cheap hard answer to " + (lead || "your threat") + " — vary your timing.");
      break;

    default:
      build.push(lead ? "Win condition: " + lead + " — it is the only card that takes a tower."
        : "Win condition: none — nothing in this deck takes a tower.");
      if (tk) build.push("Answer tanks with " + tk.name + (ar ? " and air with " + ar.name : "") + ".");
      if (big) build.push(big.name + " is the biggest swing you have; hold it for their answer.");
      else if (small) build.push("Keep " + small.name + " to finish what your support starts.");
      if (sp) build.push(sp.name + " handles the swarms that otherwise eat your push.");
      build.push("Play it card for card and fix the gaps the checklist shows before optimising anything.");
      break;
  }

  return {
    family: family,
    label: ARCHETYPE_LABELS[family] || ARCHETYPE_LABELS.misc,
    why: why,
    build: build,
  };
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
    // Rank 2 = Mirror: it is a real spell but answers nothing, so only reach
    // for it when the pool holds no other spell at all.
    var sa = isWildcardSpell(a.name) ? 2 : (elixirOf(a) <= 3 ? 0 : 1);
    var sb = isWildcardSpell(b.name) ? 2 : (elixirOf(b) <= 3 ? 0 : 1);
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
// card is the least loss to make room.
//
// The hard version of this problem is real. A deck can fail a check for
// which NO single swap closes the gap without giving up something else — an
// "anti-air 2+" gap that only has one air answer and a deck whose every
// other card is load-bearing. Silence there is the worst possible answer:
// the user sees an unfixable gap and no help at all. So a suggestion is
// offered whenever the pool holds a card that moves the check in the right
// direction, and every suggestion says honestly what it costs: `trade` is
// "keeps everything" when the swap breaks no passing check, otherwise
// "costs <checks the swap would break>". `closes` says whether the check
// then passes outright.
//
// The UI renders every suggestion, so the list is capped and de-duplicated:
// at most VICTIMS_PER_CHECK distinct victims per check and TOTAL at most —
// eleven variants of "X for Bomber" is noise, not help.
var VICTIMS_PER_CHECK = 2;
var TOTAL_SWAP_SUGGESTIONS = 6;

// "costs splash damage, anti-air" — the labels come straight from
// DECK_CHECKS so the trade text can never drift from the check it names.
function tradeLabel(brokenIds) {
  if (!brokenIds.length) return "keeps everything";
  return "costs " + brokenIds.map(function(id) {
    var def = DECK_CHECKS.filter(function(d) { return d.id === id; })[0];
    return def ? def.label.toLowerCase() : id;
  }).join(", ");
}

// Which passing checks a swap to `victimName` for `cand` would break.
function swapBreaks(cards, okMap, chkId, victimName, cand) {
  var after = cards.filter(function(c) { return c.name !== victimName; }).concat([cand]);
  var afterOk = {};
  deckChecks(after).forEach(function(a) { afterOk[a.id] = a.ok; });
  var broken = DECK_CHECKS.filter(function(d) {
    return okMap[d.id] && d.id !== chkId && !afterOk[d.id];
  }).map(function(d) { return d.id; });
  return { broken: broken, closes: !!afterOk[chkId] };
}

// Does this single card count toward the check at all? A card that closes the
// gap outright always passes this; a card that only moves it toward passing
// (the second anti-air answer) passes too. `avg` / `cycle` are whole-deck
// metrics with no single-card answer and are never suggested.
function contributesTo(card, checkId) {
  var r = roleEntry(card.name) || {};
  var e = elixirOf(card);
  var spell = r.role === "spell";
  switch (checkId) {
    case "win":      return r.role === "win-condition";
    case "air":      return !!r.air && !spell;
    case "small":    return spell && !isWildcardSpell(card.name) && e <= 3;
    case "big":      return spell && !isWildcardSpell(card.name) && e >= 4;
    case "tankkill": return r.role === "tank-killer" || hasTag(r, "tank-killer");
    case "splash":   return !!r.splash && !spell;
    case "building": return isDefBuilding(r);
    case "swarm":    return r.role === "swarm" || hasTag(r, "swarm") || e <= 2;
    default:         return false;
  }
}

function checkWeight(id) {
  var def = DECK_CHECKS.filter(function(d) { return d.id === id; })[0];
  return def ? def.weight : 0;
}

function swapSuggestions(cards, pool) {
  var out = [];
  var inDeck = {};
  cards.forEach(function(c) { inDeck[c.name] = true; });

  var checks = deckChecks(cards);
  var okMap = {};
  checks.forEach(function(c) { okMap[c.id] = c.ok; });

  checks.forEach(function(chk) {
    if (chk.ok || chk.id === "avg" || chk.id === "cycle") return;

    var candidates = pool.filter(function(c) {
      return !inDeck[c.name] && contributesTo(c, chk.id);
    });

    candidates.sort(function(a, b) {
      var fa = cardFlags(a), fb = cardFlags(b);
      var la = a.maxLevel ? a.level / a.maxLevel : 0;
      var lb = b.maxLevel ? b.level / b.maxLevel : 0;
      if (fa.evoUnlocked !== fb.evoUnlocked) return fa.evoUnlocked ? -1 : 1;
      if (Math.abs(la - lb) > 0.01) return lb - la;
      return a.name.localeCompare(b.name);
    });
    if (!candidates.length) return;

    // One card per sacrifice: offering three different cards for the same
    // victim is the spam the list is capped to avoid.
    var victims = victimOrder(cards, chk.id).slice(0, VICTIMS_PER_CHECK);
    for (var j = 0; j < victims.length; j++) {
      var victimName = victims[j];
      var best = null;
      for (var i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        var res = swapBreaks(cards, okMap, chk.id, victimName, cand);
        var sug = {
          check: chk.id,
          label: chk.label,
          inn: cand.name,
          out: victimName,
          why: chk.detail,
          trade: tradeLabel(res.broken),
          closes: res.closes,
          broken: res.broken,
        };
        if (!best ||
            (sug.closes && !best.sug.closes) ||
            (sug.closes === best.sug.closes && res.broken.length < best.sug.broken.length)) {
          best = { sug: sug, rank: i };
        }
      }
      if (best) out.push(best.sug);
    }
  });

  // Honest swaps first, then by the weight of the check they fix: the list
  // renders top-down, so the biggest gap that can be closed for free has to
  // be at the top and a trade must never outrank a free fix.
  var ranked = out.sort(function(a, b) {
    var fa = a.trade === "keeps everything" ? 0 : 1;
    var fb = b.trade === "keeps everything" ? 0 : 1;
    if (fa !== fb) return fa - fb;
    var wa = checkWeight(a.check), wb = checkWeight(b.check);
    if (wa !== wb) return wb - wa;
    if (a.closes !== b.closes) return a.closes ? -1 : 1;
    if (a.broken.length !== b.broken.length) return a.broken.length - b.broken.length;
    return (a.check + " " + a.inn + " " + a.out).localeCompare(b.check + " " + b.inn + " " + b.out);
  });

  // Cap fairly: one suggestion for every fixable gap first (heaviest gap
  // first) so a quiet low-weight check is never starved by a noisy one, then
  // a second victim for the heaviest gaps while there is room.
  var picked = [], taken = {};
  ranked.forEach(function(s) {
    if (taken[s.check]) return;
    taken[s.check] = 1;
    picked.push(s);
  });
  picked = picked.slice(0, TOTAL_SWAP_SUGGESTIONS);
  taken = {};
  picked.forEach(function(s) { taken[s.check] = (taken[s.check] || 0) + 1; });
  ranked.forEach(function(s) {
    if (picked.length >= TOTAL_SWAP_SUGGESTIONS) return;
    if (picked.indexOf(s) !== -1) return;
    if ((taken[s.check] || 0) >= VICTIMS_PER_CHECK) return;
    taken[s.check] = (taken[s.check] || 0) + 1;
    picked.push(s);
  });
  picked.sort(function(a, b) { return ranked.indexOf(a) - ranked.indexOf(b); });
  return picked;
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
