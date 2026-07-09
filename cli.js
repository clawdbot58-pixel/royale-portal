#!/usr/bin/env node
/* =====================================================
   cli.js — Royale Portal CLI
   Usage:
     node cli.js                          → snapshot (default tag)
     node cli.js <tag>                    → snapshot for tag
     node cli.js check <card>             → card progress (default tag)
     node cli.js <tag> check <card>       → card progress for tag
     node cli.js top [N]                  → top N closest to max (default 10)
     node cli.js list [filter]            → list cards matching filter
     node cli.js gold                     → gold needed summary
     node cli.js help
   ===================================================== */

// ── Upgrade tables ──
const CARDS = {
  common:    [0,1,2,4,10,20,50,100,200,400,800,1000,1500,2500,3500,5500,7500],
  rare:      [0,0,0,1,2,4,10,20,50,100,200,300,400,550,750,1000,1400],
  epic:      [0,0,0,0,0,0,1,2,4,10,20,30,50,70,100,130,180],
  legendary: [0,0,0,0,0,0,0,0,0,1,2,4,6,9,12,14,20],
  champion:  [0,0,0,0,0,0,0,0,0,0,0,1,2,5,8,11,15],
};
const MAX_LEVELS   = { common:16, rare:16, epic:16, legendary:16, champion:16 };
const START_LEVELS = { common:1,  rare:3,  epic:6,  legendary:9,  champion:11 };
const GOLD_PER_LV  = [0,0,5,20,50,150,400,1000,2000,4000,8000,15000,25000,40000,60000,90000,120000,150000];
const RARITY_ORDER = ["common","rare","epic","legendary","champion"];
const RARITY_LABEL = { common:"C", rare:"R", epic:"E", legendary:"L", champion:"CH" };
const RARITY_COLORS = { common:"#6af", rare:"#e80", epic:"#c6c", legendary:"#fc3", champion:"#fd0" };
const API_BASE = "https://api.clashroyale.com/v1";

// ── Utilities ──
const fs = require("fs");
const path = require("path");

function loadToken() {
  const raw = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");
  const m = raw.match(/CLASH_ROYALE_API_TOKEN\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error("Can't find API token in config.js");
  return m[1];
}

function loadDefaultTag() {
  const raw = fs.readFileSync(path.join(__dirname, "player-config.js"), "utf8");
  const m = raw.match(/DEFAULT_PLAYER_TAG\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}

function sanitize(tag) {
  const c = tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return c ? "#" + c : null;
}

function fmt(n)   { return (n == null || isNaN(n)) ? "—" : n.toLocaleString(); }
function pad(s, n, dir) {
  s = String(s);
  if (dir === -1) { while (s.length < n) s = " " + s; return s; }
  while (s.length < n) s += " ";
  return s;
}

function bar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

function rarityColor(r) { return RARITY_COLORS[r] || "#888"; }

function cardsForNext(rarity, gameLv) {
  const arr = CARDS[rarity];
  const target = gameLv + 1;
  if (!arr || gameLv >= MAX_LEVELS[rarity] || target >= arr.length) return null;
  return arr[target];
}

function cardsTotalFromTo(rarity, fromLv, toLv) {
  let sum = 0;
  for (let lv = fromLv + 1; lv <= toLv; lv++) {
    sum += (CARDS[rarity] && CARDS[rarity][lv]) || 0;
  }
  return sum;
}

function goldForLevel(lv) {
  return (lv > 0 && lv < GOLD_PER_LV.length) ? GOLD_PER_LV[lv] : null;
}

function goldTotalFromTo(fromLv, toLv) {
  let sum = 0;
  for (let lv = fromLv + 1; lv <= toLv; lv++) {
    sum += goldForLevel(lv) || 0;
  }
  return sum;
}

// Fuzzy match: pick best card name match
function findCard(allCards, query) {
  const q = query.toLowerCase().trim();
  // Exact match first
  const exact = Object.keys(allCards).find(n => n.toLowerCase() === q);
  if (exact) return exact;

  // Partial match
  const partial = Object.keys(allCards).filter(n => n.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    // Prefer exact word boundary or starts-with
    const starts = partial.filter(n => n.toLowerCase().startsWith(q));
    if (starts.length) return starts[0];
    return partial[0]; // first alphabetically
  }
  return null;
}

// ── API fetcher ──
async function fetchAPI(path, token) {
  const resp = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  if (!resp.ok) {
    const msg = resp.status === 404 ? "Not found" : resp.status === 403 ? "API auth error — check token" : resp.statusText;
    throw new Error(`API ${resp.status}: ${msg}`);
  }
  return resp.json();
}

// ── Build merged card list (shared across commands) ──
async function loadData(token, tag) {
  const [cardsData, player] = await Promise.all([
    fetchAPI("/cards", token),
    fetchAPI("/players/" + encodeURIComponent(tag), token),
  ]);

  // Build card DB
  const allCards = {};
  (cardsData.items || []).forEach(c => {
    allCards[c.name.trim()] = {
      id: c.id, name: c.name.trim(), elixir: c.elixirCost,
      rarity: c.rarity, icons: c.iconUrls || {},
    };
  });
  (cardsData.supportItems || []).forEach(c => {
    const name = c.name.trim();
    if (!allCards[name]) {
      allCards[name] = {
        id: c.id, name, elixir: c.elixirCost,
        rarity: c.rarity, icons: c.iconUrls || {}, type: "tower",
      };
    }
  });

  // Build owned map
  const owned = {};
  (player.cards || []).forEach(c => { owned[c.name.trim()] = c; });
  (player.supportCards || []).forEach(c => { owned[c.name.trim()] = c; });

  // Merge
  const merged = [];
  Object.keys(allCards).forEach(name => {
    const db  = allCards[name];
    const pc  = owned[name] || {};
    const r   = (pc.rarity || db.rarity || "").toLowerCase();
    const isTower = db.type === "tower";
    const apiLv = pc.level || 0;
    const startLv = START_LEVELS[r] || 1;
    const gameLv = apiLv > 0 ? (apiLv + startLv - 1) : 0;
    const maxLv = MAX_LEVELS[r] || 14;

    merged.push({
      name, rarity: r, level: gameLv, maxLevel: maxLv,
      count: pc.count != null ? pc.count : 0,
      owned: !!pc.level, apiLv, isTower,
      evolutionLevel: pc.evolutionLevel, maxEvolutionLevel: pc.maxEvolutionLevel,
    });
  });

  return { player, allCards, owned, merged };
}

// ── Subcommand: snapshot (default) ──
function printSnapshot(merged, player) {
  const upgradable = merged.filter(c => c.owned && c.level < c.maxLevel);
  const rows = upgradable.map(c => {
    const needNext = cardsForNext(c.rarity, c.level);
    const have = c.count || 0;
    const canUp = needNext != null && have >= needNext;
    const pct = needNext > 0 ? Math.min(100, Math.round(have / needNext * 100)) : 0;
    const goldNext = goldForLevel(c.level + 1);
    return {
      name: c.name, rarity: c.rarity, lv: c.level, maxLv: c.maxLevel,
      have, need: needNext, pct, canUp, gold: goldNext,
      progress: c.level / c.maxLevel,
    };
  });
  rows.sort((a, b) => {
    if (a.canUp !== b.canUp) return a.canUp ? -1 : 1;
    const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (ri) return ri;
    return (b.lv - a.lv) || a.name.localeCompare(b.name);
  });

  const canUpgradeNow = rows.filter(r => r.canUp);
  const lv15CanMax  = rows.filter(r => r.lv === 15 && r.canUp);
  const lv15CantMax = rows.filter(r => r.lv === 15 && !r.canUp);
  const otherCan    = rows.filter(r => r.lv < 15 && r.canUp);
  const otherWait   = rows.filter(r => r.lv < 15 && !r.canUp);

  console.log("\n" + "═".repeat(78));
  console.log("  🏆  " + player.name + "  " + sanitizePlayerTag() + "  —  Upgrade Snapshot");
  console.log("  " + player.trophies + " trophies  ·  " + merged.filter(c => c.owned).length + "/" + merged.length + " cards owned");
  console.log("═".repeat(78));

  // Lv15 ready to max
  console.log("\n\033[1;33m✦ LEVEL 15 — READY TO MAX (→16) ☝\033[0m");
  if (lv15CanMax.length) {
    console.log("  " + lv15CanMax.length + " card" + (lv15CanMax.length > 1 ? "s" : "") + " can be maxed now");
    lv15CanMax.forEach(r => console.log("  \033[32m✓\033[0m " + pad(r.name, 22) + " Lv15→16  Gold: " + fmt(r.gold)));
  } else console.log("  (none)");

  // Lv15 need more
  if (lv15CantMax.length) {
    console.log("\n\033[1;34m✦ LEVEL 15 — NEED MORE CARDS\033[0m");
    console.log("  " + lv15CantMax.length + " card" + (lv15CantMax.length > 1 ? "s" : "") + " collecting toward max");
    lv15CantMax.slice(0, 20).forEach(r => {
      const miss = r.need ? (r.need - r.have) : 0;
      console.log("  " + pad(r.name, 22) + " " + bar(r.pct, 15) + "  " + fmt(r.have) + "/" + fmt(r.need) + "  (need " + fmt(miss) + " more)");
    });
    if (lv15CantMax.length > 20) console.log("  … +" + (lv15CantMax.length - 20) + " more");
  }

  // Lower ready
  if (otherCan.length) {
    console.log("\n\033[1;32m✦ LOWER LEVELS — READY TO UPGRADE\033[0m");
    otherCan.forEach(r => console.log("  \033[32m✓\033[0m " + pad(r.name, 22) + " Lv" + r.lv + "→" + (r.lv+1) + "  Gold: " + fmt(r.gold)));
  }

  // Lower in progress
  if (otherWait.length) {
    console.log("\n\033[1;90m✦ LOWER LEVELS — IN PROGRESS\033[0m");
    console.log("  " + otherWait.length + " card" + (otherWait.length > 1 ? "s" : "") + " collecting");
    otherWait.slice(0, 10).forEach(r => {
      const miss = r.need ? (r.need - r.have) : 0;
      console.log("  " + pad(r.name, 22) + " Lv" + r.lv + "→" + (r.lv+1) + " " + bar(r.pct, 12) + "  " + fmt(r.have) + "/" + fmt(r.need || "?") + "  (" + fmt(Math.max(0, miss)) + " more)");
    });
    if (otherWait.length > 10) console.log("  … and " + (otherWait.length - 10) + " more");
  }

  console.log("\n" + "─".repeat(78));
  console.log("  Summary:");
  console.log("    Ready to upgrade now:  \033[32m" + canUpgradeNow.length + "\033[0m card" + (canUpgradeNow.length !== 1 ? "s" : ""));
  console.log("    Lv15 → max:            " + lv15CanMax.length + " ready  ·  " + lv15CantMax.length + " collecting");
  console.log("    Total owned:           " + merged.filter(c => c.owned).length + "/" + merged.length + " cards");
  console.log("    Maxed:                 " + merged.filter(c => c.owned && c.level >= c.maxLevel).length + " cards");
  console.log("─".repeat(78));

  function sanitizePlayerTag() {
    const t = player.tag || "";
    return t.startsWith("#") ? t : "#" + t;
  }
}

// ── Subcommand: check <card> ──
function printCardCheck(merged, player, cardName, apiLvRaw) {
  const card = merged.find(c => c.name === cardName);
  if (!card) {
    console.error("❌ Card not found in your collection.");
    process.exit(1);
  }
  if (!card.owned) {
    console.log("\n❌ You don't own " + card.name + " yet.");
    return;
  }

  const r = card.rarity;
  const gameLv = card.level;
  const maxLv = card.maxLevel;
  const have = card.count;
  const maxable = gameLv >= maxLv;

  console.log("\n" + "─".repeat(58));
  console.log("  🃏  " + card.name + "  (" + r + ")");
  console.log("  " + player.name + "  " + (player.tag || "#" + sanitize(player.tag)));
  console.log("─".repeat(58));

  if (maxable) {
    console.log("\n  \033[32m✦ MAX LEVEL REACHED (" + gameLv + "/" + maxLv + ") ✦\033[0m");
    console.log("  No more cards needed.");
    return;
  }

  // Evolution badges
  if (card.evolutionLevel != null && card.maxEvolutionLevel != null) {
    console.log("  Evolution: " + card.evolutionLevel + "/" + card.maxEvolutionLevel);
  }

  // Total cards needed from current level to max
  const totalNeeded = cardsTotalFromTo(r, gameLv, maxLv);
  const stillMissing = Math.max(0, totalNeeded - have);

  console.log("\n  Current:  game level \033[1m" + gameLv + "\033[0m/" + maxLv);
  console.log("  Cards:    " + fmt(have) + " in inventory");

  // Per-step breakdown
  console.log("\n  Upgrade path:");
  for (let target = gameLv + 1; target <= maxLv; target++) {
    const need = CARDS[r] && CARDS[r][target];
    if (need == null) continue;
    const gold = goldForLevel(target);
    const pct = Math.min(100, Math.round(have / totalNeeded * 100));
    const stepMissing = Math.max(0, need - have + (cardsTotalFromTo(r, gameLv, target - 1) - cardsTotalFromTo(r, gameLv, gameLv)));
    // Actually simpler: at each step, how many more from inventory after paying previous steps
    const cumulative = cardsTotalFromTo(r, gameLv, target - 1);
    const remaining = Math.max(0, need - (have - cumulative)); // wrong...

    // Let me just show the step cost
    console.log("    Lv " + (target - 1) + " → " + target + " :  " + fmt(need) + " cards" + (gold ? "  ·  " + fmt(gold) + " gold" : ""));
  }

  console.log("");
  console.log("  \033[1mTotal cards needed:\033[0m  " + fmt(totalNeeded));
  console.log("  \033[1mIn inventory:\033[0m       " + fmt(have));
  if (stillMissing > 0) {
    console.log("  \033[1m\033[31mStill missing:\033[0m     " + fmt(stillMissing) + " cards");
  }

  // Gold total
  const totalGold = goldTotalFromTo(gameLv, maxLv);
  if (totalGold > 0) {
    console.log("  \033[1mGold needed:\033[0m        " + fmt(totalGold));
  }

  // Progress bar
  const pct = Math.min(100, Math.round(have / totalNeeded * 100));
  console.log("  \033[1mProgress:\033[0m           " + bar(pct, 20) + "  " + pct + "%");
  console.log("");
}

// ── Subcommand: top [N] ──
function printTop(merged, n) {
  n = Math.max(1, Math.min(50, n || 10));
  const contenders = merged.filter(c => c.owned && c.level < c.maxLevel && c.level > 0);
  contenders.sort((a, b) => {
    const aTotal = cardsTotalFromTo(a.rarity, a.level, a.maxLevel);
    const bTotal = cardsTotalFromTo(b.rarity, b.level, b.maxLevel);
    const aPct = aTotal > 0 ? a.count / aTotal : 0;
    const bPct = bTotal > 0 ? b.count / bTotal : 0;
    return bPct - aPct; // highest % first
  });

  console.log("\n  🏆  Top " + n + " cards closest to max\n");

  const top = contenders.slice(0, n);
  top.forEach((c, i) => {
    const total = cardsTotalFromTo(c.rarity, c.level, c.maxLevel);
    const pct = total > 0 ? Math.min(100, Math.round(c.count / total * 100)) : 0;
    const need = Math.max(0, total - c.count);
    const ready = need === 0 ? "  \033[32m✓ ready\033[0m" : "  (" + fmt(need) + " more)";
    console.log("  " + pad(String(i + 1) + ".", 4)
      + pad(c.name, 22) + " Lv" + c.level + "/" + c.maxLevel
      + " " + bar(pct, 12) + "  " + pct + "%"
      + ready);
  });
  console.log("");
}

// ── Subcommand: list [filter] ──
function printList(merged, filter) {
  const q = (filter || "").toLowerCase();
  const filtered = q
    ? merged.filter(c => !q || c.name.toLowerCase().includes(q) || c.rarity.includes(q))
    : merged.filter(c => c.owned);

  filtered.sort((a, b) => {
    const ri = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    if (ri) return ri;
    return (b.level - a.level) || a.name.localeCompare(b.name);
  });

  console.log("\n  Cards" + (q ? " matching \"" + filter + "\"" : " owned") + ":  " + filtered.length + "\n");
  filtered.forEach(c => {
    const label = c.owned ? (c.level >= c.maxLevel ? "MAX" : " Lv" + c.level) : " — ";
    const next = cardsForNext(c.rarity, c.level);
    const pct = next && c.count ? Math.min(100, Math.round(c.count / next * 100)) : 0;
    const evo = c.evolutionLevel ? " ⚡" + c.evolutionLevel : "";
    console.log("  " + (RARITY_LABEL[c.rarity] ? pad(RARITY_LABEL[c.rarity], 2) : "  ")
      + pad(label, 5) + "  " + pad(c.name, 22)
      + (c.owned && c.level < c.maxLevel ? bar(pct, 8) + "  " + fmt(c.count) + "/" + fmt(next) : "")
      + evo);
  });
  console.log("");
}

// ── Subcommand: gold ──
function printGoldSummary(merged, player) {
  let goldNow = 0, goldToMax = 0;
  let countNow = 0, countMax = 0;

  merged.filter(c => c.owned && c.level < c.maxLevel).forEach(c => {
    const nextGold = goldForLevel(c.level + 1);
    if (nextGold) { goldNow += nextGold; countNow++; }
    const allGold = goldTotalFromTo(c.level, c.maxLevel);
    if (allGold) { goldToMax += allGold; countMax++; }
  });

  console.log("\n" + "─".repeat(50));
  console.log("  🏆  " + player.name + "  —  Gold Summary");
  console.log("─".repeat(50));
  console.log("  Gold to upgrade all ready cards:  \033[1m" + fmt(goldNow) + "\033[0m");
  console.log("  (" + countNow + " card" + (countNow !== 1 ? "s" : "") + " ready to level up)");
  console.log("");
  console.log("  Gold to max all owned cards:      \033[1m" + fmt(goldToMax) + "\033[0m");
  console.log("  (" + countMax + " card" + (countMax !== 1 ? "s" : "") + " not yet maxed)");
  console.log("");
}

// ── Help ──
function printHelp() {
  console.log(`
  Royale Portal CLI — Clash Royale card progress & upgrade tool

  USAGE:
    node cli.js                               Snapshot (default player)
    node cli.js <tag>                         Snapshot for a player tag
    node cli.js check <card>                  Card progress (default player)
    node cli.js <tag> check <card>            Card progress for a tag
    node cli.js top [N]                       Top N closest to max (default 10)
    node cli.js list [filter]                 List cards (by name/rarity)
    node cli.js gold                          Gold needed summary
    node cli.js help                          This help

  EXAMPLES:
    node cli.js check giant              # cards missing to max a card
    node cli.js giant                    # same — bare card name works too
    node cli.js #ABC123 check skeleton king
    node cli.js top 5
    node cli.js list legendary
    node cli.js gold
`);
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const token = loadToken();

  // Parse: <tag> <subcommand> <args...>  or  <subcommand> <args...>
  // Tags start with # or are 6-12 char alphanumeric
  const SUBCOMMANDS = new Set(["check", "top", "list", "gold", "help", "h", "--help", "-h"]);

  let tag = null;
  let subcmd = null;
  let subArgs = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const al = a.toLowerCase();

    if (SUBCOMMANDS.has(al)) {
      subcmd = al;
      subArgs = args.slice(i + 1);
      break;
    }

    // Looks like a player tag: starts with #, or is 6-12 alphanumeric
    if (!tag) {
      const isTag = a.startsWith("#") || /^[A-Za-z0-9]{6,12}$/.test(a);
      if (isTag) {
        const s = sanitize(a);
        if (s) { tag = s; continue; }
      }
    }

    // Not a tag or subcommand → push for later (e.g. bare card name)
    subArgs.push(a);
  }

  // Resolve tag
  if (!tag) tag = sanitize(loadDefaultTag());
  if (!tag && subcmd === "help") { printHelp(); return; }
  if (!tag) { console.error("❌ No player tag given and no default tag found in player-config.js"); process.exit(1); }

  // ── If no subcommand, check if first subArg is a bare card name ──
  if (!subcmd && subArgs.length > 0) {
    // Fetch card DB to check
    console.log("📡 Fetching card database…");
    const cardsData = await fetchAPI("/cards", token);
    const allCardNames = {};
    (cardsData.items || []).forEach(c => { allCardNames[c.name.trim()] = true; });
    (cardsData.supportItems || []).forEach(c => { allCardNames[c.name.trim()] = true; });

    const query = subArgs.join(" ");
    const match = findCard(allCardNames, query);
    if (match) {
      // Bare card name → treat as "check"
      subcmd = "check";
      subArgs = [query];
    }
    // Otherwise falls through to snapshot with no output (no subcmd + args we don't understand)
  }

  // ── Help early exit ──
  if (subcmd === "help" || subcmd === "h" || subcmd === "--help" || subcmd === "-h") {
    printHelp();
    return;
  }

  // ── Load player data ──
  console.log("📡 Fetching data for " + tag + "…");
  const { player, allCards, owned, merged } = await loadData(token, tag);

  // ── Dispatch ──
  if (subcmd === "check") {
    const query = subArgs.join(" ");
    if (!query) {
      console.error("❌ Specify a card name. Example: node cli.js check giant");
      return;
    }
    const matched = findCard(allCards, query);
    if (!matched) {
      console.error("❌ Card not found. Try \x1B[1mnode cli.js list\x1B[0m to see all cards.");
      return;
    }
    printCardCheck(merged, player, matched);
  } else if (subcmd === "top") {
    const n = parseInt(subArgs[0]) || 10;
    printTop(merged, n);
  } else if (subcmd === "list") {
    const filter = subArgs.join(" ");
    printList(merged, filter);
  } else if (subcmd === "gold") {
    printGoldSummary(merged, player);
  } else {
    // Default: snapshot
    printSnapshot(merged, player);
  }
}

main().catch(err => { console.error("💥", err.message); process.exit(1); });
