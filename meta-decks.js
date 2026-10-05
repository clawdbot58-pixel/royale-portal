// ===== META DECKS (Oct 2026 ladder / clan war / challenge meta) =====
//
// Card names are the EXACT API names from deck-rules.md ("API names are
// authoritative for matching", note `Mini P.E.K.K.A` has no trailing dot).
// Slot rules are the 16 Mar 2026 deck rules: 8 cards, 1 champion slot,
// 1 evolution slot, 1 hero slot, 1 wild slot; the wild accepts a champion,
// a hero, or an evolution card, so the per-deck ceilings are 2 champions,
// 2 heroes, 2 evolutions. A special card in a normal slot gets no special
// behaviour, so each card occupies at most one special slot.
//
// Heroes are not exposed by the developer API, so hero legality is checked
// against the curated 16-hero list; `hero` entries are the BASE card names.
// Evolution legality is checked against the cards the API reports with
// maxEvolutionLevel > 0 (55 cards, fetched from GET /cards on 2026-10-04).
//
// Runs under node with no DOM: no window/document references.

const META_DECKS = [
  {
    name: "Hero Knight Cycle",
    cards: ["Knight", "Firecracker", "Electro Spirit", "Royal Recruits", "Skeletons", "Tornado", "Lightning", "Cannon"],
    key: "Knight",
    tower: "Cannoneer",
    evo: ["Firecracker", "Royal Recruits"],
    hero: ["Knight"],
    champion: [],
    tags: ["cycle", "air-attack", "splash", "log-bait"],
    win: "Cycle Firecracker and Electro Spirit behind a Hero Knight tank, chip with Royal Recruits and punish any log with a second Firecracker.",
    meta: "ladder",
    tier: "S",
    modes: ["ladder", "clanwars", "challenge"],
  },
  {
    name: "Hero Giant Beatdown",
    cards: ["Giant", "Mega Minion", "Bats", "Tornado", "Lightning", "Skeletons", "Fireball", "Cannon"],
    key: "Giant",
    tower: "Royal Chef",
    evo: ["Mega Minion", "Cannon"],
    hero: ["Giant"],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "giant"],
    win: "Play Hero Giant in front of Mega Minion; Heroic Hurl throws the defending tank off the bridge so the Giant reaches the tower.",
    meta: "ladder",
    tier: "S",
    modes: ["ladder", "challenge"],
  },
  {
    name: "Hero Bowler Beatdown",
    cards: ["Bowler", "Mega Minion", "Bats", "Tornado", "Lightning", "Skeletons", "Ice Spirit", "Fireball"],
    key: "Bowler",
    tower: "Royal Chef",
    evo: ["Mega Minion", "Skeletons"],
    hero: ["Bowler"],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "control"],
    win: "Stone Swish extends Bowler's range past the defending building; clear the lane with Lightning plus Tornado and send Bowler in with Mega Minion.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Hero Musketeer Cycle",
    cards: ["Musketeer", "Skeletons", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Fireball", "Cannon"],
    key: "Musketeer",
    tower: "Cannoneer",
    evo: ["Skeletons", "Ice Spirit"],
    hero: ["Musketeer"],
    champion: [],
    tags: ["cycle", "air-attack", "splash", "control"],
    win: "Trusty Turret out-ranges any building defence; cycle Ice Spirit and Skeletons to out-tempo the opponent and finish with a Musketeer push.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Hero Valkyrie Cycle",
    cards: ["Valkyrie", "Skeletons", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Fireball", "Cannon"],
    key: "Valkyrie",
    tower: "Cannoneer",
    evo: ["Skeletons", "Ice Spirit"],
    hero: ["Valkyrie"],
    champion: [],
    tags: ["cycle", "splash", "air-attack", "control"],
    win: "Wild Whirlwind clears Skeleton Army and hog support for free; defend with Valkyrie, counter-push the surviving tank with Mega Minion.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Log Bait",
    cards: ["Goblin Barrel", "The Log", "Princess", "Knight", "Ice Spirit", "Skeletons", "Tornado", "Poison"],
    key: "Goblin Barrel",
    tower: "Cannoneer",
    evo: ["Ice Spirit", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["bait", "log-bait", "control", "cycle"],
    win: "Bait The Log with Princess and Skeletons, then throw Goblin Barrel at the tower and Poison the defending troops.",
    meta: "clanwars",
    tier: "S",
    modes: ["clanwars", "challenge", "ladder"],
  },
  {
    name: "Hog 2.6 Cycle",
    cards: ["Hog Rider", "Firecracker", "Ice Spirit", "Skeletons", "Cannon", "Fireball", "The Log", "Musketeer"],
    key: "Hog Rider",
    tower: "Tower Princess",
    evo: ["Firecracker", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["cycle", "hog", "bait", "air-attack", "control"],
    win: "Cycle at 2.6 elixir, chip the tower with Hog Rider plus Firecracker, and win the elixir race by defending with Cannon and Skeletons.",
    meta: "ladder",
    tier: "S",
    modes: ["ladder", "clanwars", "challenge"],
  },
  {
    name: "X-Bow Siege",
    cards: ["X-Bow", "Tesla", "Tornado", "The Log", "Skeletons", "Ice Spirit", "Mega Minion", "Arrows"],
    key: "X-Bow",
    tower: "Cannoneer",
    evo: ["Skeletons", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["siege", "building-target", "control", "cycle", "air-attack"],
    win: "Lock in X-Bow at the bridge with Tesla behind it; Arrows and Tornado clear swarms so the X-Bow shoots the tower uncontested.",
    meta: "ladder",
    tier: "S",
    modes: ["ladder", "challenge"],
  },
  {
    name: "Graveyard",
    cards: ["Graveyard", "Royal Ghost", "Ice Spirit", "Skeletons", "Tornado", "Lightning", "Mega Minion", "Tombstone"],
    key: "Graveyard",
    tower: "Cannoneer",
    evo: ["Ice Spirit", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "control", "counter-push"],
    win: "Defend with Tombstone and Royal Ghost, then turn the counter-push into a Graveyard drop behind the surviving tank.",
    meta: "ladder",
    tier: "S",
    modes: ["ladder", "clanwars", "challenge"],
  },
  {
    name: "Mega Knight Cycle",
    cards: ["Mega Knight", "Golden Knight", "Skeletons", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Fireball"],
    key: "Mega Knight",
    tower: "Royal Chef",
    evo: ["Skeletons", "Ice Spirit"],
    hero: [],
    champion: ["Golden Knight"],
    tags: ["beatdown", "cycle", "splash", "air-attack", "counter-push"],
    win: "Mega Knight spawns on defence, Golden Knight follows the counter-push into the tower while Lightning clears the swarm.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Giant Beatdown",
    cards: ["Giant", "Mega Minion", "Bats", "Tornado", "Lightning", "Ice Spirit", "Skeletons", "Fireball"],
    key: "Giant",
    tower: "Royal Chef",
    evo: ["Giant", "Mega Minion"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "giant"],
    win: "Evolved Giant tanks in front of Mega Minion; Tornado drags the defending troops off the bridge so the push reaches the tower.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Golem Beatdown",
    cards: ["Golem", "Skeleton King", "Lumberjack", "Night Witch", "Mega Minion", "Tornado", "Lightning", "Bats"],
    key: "Golem",
    tower: "Royal Chef",
    evo: ["Lumberjack", "Mega Minion"],
    hero: [],
    champion: ["Skeleton King"],
    tags: ["beatdown", "splash", "air-attack", "golem", "counter-push"],
    win: "Lumberjack and Skeleton King build the army in front of Golem; the wave overwhelms the tower before Splash can clear it.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Lava Hound",
    cards: ["Lava Hound", "Balloon", "Mega Minion", "Bats", "Tornado", "Lightning", "Ice Spirit", "Skeletons"],
    key: "Lava Hound",
    tower: "Cannoneer",
    evo: ["Mega Minion", "Bats"],
    hero: [],
    champion: [],
    tags: ["air-attack", "beatdown", "splash", "balloon"],
    win: "Lava Hound tanks the air defence and splits into pups; Balloon finishes the tower while Skeletons deny ground counter-pushes.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "P.E.K.K.A Bridge Spam",
    cards: ["P.E.K.K.A", "Bandit", "Royal Ghost", "Battle Ram", "Tornado", "Lightning", "Ice Spirit", "Little Prince"],
    key: "P.E.K.K.A",
    tower: "Dagger Duchess",
    evo: ["Battle Ram", "Ice Spirit"],
    hero: [],
    champion: ["Little Prince"],
    tags: ["beatdown", "counter-push", "splash", "air-attack", "control"],
    win: "Kill the tank with P.E.K.K.A, then spam Battle Ram, Bandit and Royal Ghost in the opposite lane before the opponent can cycle air.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Miner Control",
    cards: ["Miner", "Skeletons", "Mega Minion", "Tornado", "Poison", "Ice Spirit", "Bats", "Cannon"],
    key: "Miner",
    tower: "Cannoneer",
    evo: ["Skeletons", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["control", "cycle", "air-attack", "building-target", "counter-push"],
    win: "Chip with Miner and Poison the defending building, defend with Cannon plus Skeletons, and win on tower damage over the full match.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Skeleton Cycle",
    cards: ["Skeletons", "Hog Rider", "Royal Ghost", "Tornado", "Lightning", "Ice Spirit", "Mega Minion", "Cannon"],
    key: "Skeletons",
    tower: "Tower Princess",
    evo: ["Skeletons", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["cycle", "control", "air-attack", "counter-push", "bait"],
    win: "Evolved Skeletons defend for one elixir, Hog Rider and Royal Ghost punish every cycle the opponent spends on defence.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Royal Giant",
    cards: ["Royal Giant", "Tornado", "Lightning", "Mega Minion", "Skeletons", "Ice Spirit", "Fireball", "Royal Ghost"],
    key: "Royal Giant",
    tower: "Dagger Duchess",
    evo: ["Royal Giant", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "control"],
    win: "Evolved Royal Giant snipes the tower from beyond building range; Tornado and Lightning clear the supporting troops.",
    meta: "ladder",
    tier: "A",
  },
  {
    name: "Ram Rider Cycle",
    cards: ["Ram Rider", "Skeletons", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Fireball", "Cannon"],
    key: "Ram Rider",
    tower: "Cannoneer",
    evo: ["Skeletons", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["cycle", "control", "air-attack", "splash"],
    win: "Ram Rider's net disables the defending building so the Ram hits the tower; cycle the rest to keep the elixir lead.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Elite Barbarians Beatdown",
    cards: ["Elite Barbarians", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Skeletons", "Fireball", "Bats"],
    key: "Elite Barbarians",
    tower: "Dagger Duchess",
    evo: ["Elite Barbarians", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "cycle"],
    win: "Evolved Elite Barbarians break the bridge defence; Tornado pulls troops together for Lightning and the pair reaches the tower.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Firecracker Cycle",
    cards: ["Firecracker", "Valkyrie", "Mega Minion", "Tornado", "Lightning", "Ice Spirit", "Skeletons", "Cannon"],
    key: "Firecracker",
    tower: "Tower Princess",
    evo: ["Firecracker", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["cycle", "splash", "air-attack", "control", "log-bait"],
    win: "Evolved Firecracker chips the tower from behind Valkyrie; the opponent loses the log race and the cycle closes the tower.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Electro Giant Beatdown",
    cards: ["Electro Giant", "Tornado", "Lightning", "Mega Minion", "Bats", "Skeletons", "Ice Spirit", "Fireball"],
    key: "Electro Giant",
    tower: "Royal Chef",
    evo: ["Mega Minion", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "giant"],
    win: "Electro Giant's stun locks the defending troops while Mega Minion and Bats fly over them to the tower.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Elixir Golem Beatdown",
    cards: ["Elixir Golem", "Balloon", "Mega Minion", "Tornado", "Lightning", "Bats", "Skeletons", "Ice Spirit"],
    key: "Elixir Golem",
    tower: "Tower Princess",
    evo: ["Mega Minion", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["beatdown", "air-attack", "splash", "cycle"],
    win: "Elixir Golem's death gives elixir back, so Balloon and Mega Minion keep pushing after the tank dies.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Goblin Drill Bait",
    cards: ["Goblin Drill", "Goblin Barrel", "Knight", "Ice Spirit", "Skeletons", "Tornado", "Poison", "Princess"],
    key: "Goblin Drill",
    tower: "Cannoneer",
    evo: ["Goblin Drill", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["bait", "log-bait", "building-target", "control"],
    win: "Bait the small spells, then drop Evolved Goblin Drill on the tower; Poison clears the building and the barrels finish it.",
    meta: "clanwars",
    tier: "A",
  },
  {
    name: "Royal Hogs Beatdown",
    cards: ["Royal Hogs", "Battle Ram", "Tornado", "Lightning", "Ice Spirit", "Skeletons", "Mega Minion", "Fireball"],
    key: "Royal Hogs",
    tower: "Royal Chef",
    evo: ["Royal Hogs", "Ice Spirit"],
    hero: [],
    champion: [],
    tags: ["beatdown", "splash", "air-attack", "cycle", "counter-push"],
    win: "Evolved Royal Hogs split into four hogs the tower cannot clear alone; Battle Ram opens the lane and Lightning answers swarms.",
    meta: "ladder",
    tier: "B",
  },
  {
    name: "Three Musketeers",
    cards: ["Three Musketeers", "Royal Ghost", "Tornado", "Lightning", "Ice Spirit", "Skeletons", "Mega Minion", "Cannon"],
    key: "Three Musketeers",
    tower: "Cannoneer",
    evo: ["Ice Spirit", "Skeletons"],
    hero: [],
    champion: [],
    tags: ["beatdown", "air-attack", "splash", "control", "counter-push"],
    win: "Defend with Cannon and Skeletons, then drop Three Musketeers on the counter-push with Royal Ghost tanking the tower.",
    meta: "clanwars",
    tier: "B",
  },
  {
    name: "Balloon Freeze",
    cards: ["Balloon", "Freeze", "Ice Golem", "Mega Minion", "Tornado", "Lightning", "Skeletons", "Bats"],
    key: "Balloon",
    tower: "Cannoneer",
    evo: ["Skeletons", "Bats"],
    hero: [],
    champion: [],
    tags: ["beatdown", "air-attack", "splash", "control"],
    win: "Ice Golem tanks the Balloon; Freeze locks the defending troops so the Balloon lands its hit before Splash can kill it.",
    meta: "clanwars",
    tier: "B",
  },
];

// ── Legality data (mirrors deck-rules.md + card-data.js) ──

const API_CARD_NAMES = [
  "Knight", "Archers", "Goblins", "Minions", "Barbarians", "Skeletons", "Bomber", "Spear Goblins",
  "Minion Horde", "Royal Giant", "Ice Spirit", "Fire Spirit", "Goblin Gang", "Elite Barbarians",
  "Royal Recruits", "Bats", "Rascals", "Skeleton Barrel", "Firecracker", "Skeleton Dragons",
  "Electro Spirit", "Berserker", "Cannon", "Mortar", "Tesla", "Arrows", "Zap", "Giant Snowball",
  "Royal Delivery",
  "Giant", "Valkyrie", "Musketeer", "Wizard", "Mini P.E.K.K.A", "Hog Rider", "Three Musketeers",
  "Battle Ram", "Ice Golem", "Mega Minion", "Dart Goblin", "Zappies", "Flying Machine", "Royal Hogs",
  "Elixir Golem", "Battle Healer", "Goblin Demolisher", "Suspicious Bush", "Minion Giant", "Goblin Hut",
  "Inferno Tower", "Bomb Tower", "Barbarian Hut", "Elixir Collector", "Tombstone", "Furnace",
  "Goblin Cage", "Fireball", "Rocket", "Earthquake", "Heal Spirit",
  "P.E.K.K.A", "Balloon", "Witch", "Golem", "Skeleton Army", "Baby Dragon", "Prince", "Giant Skeleton",
  "Guards", "Dark Prince", "Bowler", "Hunter", "Executioner", "Cannon Cart", "Wall Breakers",
  "Goblin Giant", "Electro Dragon", "Electro Giant", "Rune Giant", "X-Bow", "Goblin Drill", "Rage",
  "Goblin Barrel", "Freeze", "Mirror", "Lightning", "Poison", "Tornado", "Clone", "Barbarian Barrel",
  "Void", "Goblin Curse", "Vines",
  "Ice Wizard", "Princess", "Lava Hound", "Miner", "Sparky", "Lumberjack", "Inferno Dragon",
  "Electro Wizard", "Bandit", "Night Witch", "Royal Ghost", "Ram Rider", "Mega Knight", "Fisherman",
  "Magic Archer", "Mother Witch", "Phoenix", "Goblin Machine", "Ronin", "Graveyard", "The Log",
  "Spirit Empress",
  "Mighty Miner", "Skeleton King", "Archer Queen", "Golden Knight", "Monk", "Little Prince",
  "Goblinstein", "Boss Bandit",
];

// Cards the API reports with maxEvolutionLevel > 0 (GET /cards, 2026-10-04).
const EVO_CAPABLE = [
  "Knight", "Archers", "Goblins", "Giant", "P.E.K.K.A", "Balloon", "Witch", "Barbarians", "Skeletons",
  "Skeleton Army", "Bomber", "Musketeer", "Baby Dragon", "Wizard", "Mini P.E.K.K.A", "Minion Horde",
  "Ice Wizard", "Royal Giant", "Princess", "Dark Prince", "Ice Spirit", "Bowler", "Lumberjack",
  "Battle Ram", "Inferno Dragon", "Ice Golem", "Mega Minion", "Dart Goblin", "Elite Barbarians",
  "Hunter", "Executioner", "Royal Recruits", "Bats", "Royal Ghost", "Mega Knight", "Skeleton Barrel",
  "Wall Breakers", "Royal Hogs", "Goblin Giant", "Magic Archer", "Electro Dragon", "Firecracker",
  "Berserker", "Cannon", "Mortar", "Tesla", "Tombstone", "Furnace", "Goblin Cage", "Goblin Drill",
  "Goblin Barrel", "Zap", "Barbarian Barrel", "Giant Snowball",
];

// The 16 released heroes, as BASE card names (Ice Wizard hero is unreleased).
const RELEASED_HEROES = [
  "Knight", "Giant", "Mini P.E.K.K.A", "Musketeer", "Ice Golem", "Wizard", "Goblins", "Mega Minion",
  "Barbarian Barrel", "Magic Archer", "Balloon", "Bowler", "Dark Prince", "Tombstone", "Berserker",
  "Valkyrie",
];

const CHAMPION_CARDS = [
  "Mighty Miner", "Skeleton King", "Archer Queen", "Golden Knight", "Monk", "Little Prince",
  "Goblinstein", "Boss Bandit",
];

const MD_TOWER_TROOPS = ["Tower Princess", "Cannoneer", "Dagger Duchess", "Royal Chef"];

const ALLOWED_TAGS = [
  "cycle", "beatdown", "bait", "control", "splash", "air-attack", "building-target", "log-bait",
  "giant", "golem", "hog", "balloon", "graveyard", "xbow", "siege", "counter-push",
];

const ALLOWED_META = ["ladder", "clanwars", "challenge"];
const ALLOWED_TIER = ["S", "A", "B"];

// ── Self-check: throws on any violation ──

function validate(decks) {
  const apiSet = new Set(API_CARD_NAMES);
  const evoSet = new Set(EVO_CAPABLE);
  const heroSet = new Set(RELEASED_HEROES);
  const champSet = new Set(CHAMPION_CARDS);
  const towerSet = new Set(MD_TOWER_TROOPS);
  const tagSet = new Set(ALLOWED_TAGS);
  const problems = [];

  decks.forEach(function (d, i) {
    const at = "deck " + (i + 1) + " (" + d.name + ")";

    if (d.cards.length !== 8) problems.push(at + ": deck size " + d.cards.length);
    if (new Set(d.cards).size !== d.cards.length) problems.push(at + ": duplicate cards");
    d.cards.forEach(function (c) {
      if (!apiSet.has(c)) problems.push(at + ": " + c + " is not an API card name");
    });

    if (!d.cards.includes(d.key)) problems.push(at + ": key " + d.key + " not in cards");
    if (!towerSet.has(d.tower)) problems.push(at + ": tower " + d.tower + " is not a tower troop");

    if (d.evo.length > 2) problems.push(at + ": " + d.evo.length + " evolutions");
    if (d.hero.length > 2) problems.push(at + ": " + d.hero.length + " heroes");
    if (d.champion.length > 2) problems.push(at + ": " + d.champion.length + " champions");

    d.evo.forEach(function (c) {
      if (!d.cards.includes(c)) problems.push(at + ": evo " + c + " not in cards");
      if (!evoSet.has(c)) problems.push(at + ": " + c + " has no evolution");
    });
    d.hero.forEach(function (c) {
      if (!d.cards.includes(c)) problems.push(at + ": hero " + c + " not in cards");
      if (!heroSet.has(c)) problems.push(at + ": " + c + " has no released hero form");
    });
    d.champion.forEach(function (c) {
      if (!d.cards.includes(c)) problems.push(at + ": champion " + c + " not in cards");
      if (!champSet.has(c)) problems.push(at + ": " + c + " is not a champion card");
    });

    // A card occupies one slot, so the special-slot sets must be disjoint.
    const special = d.evo.concat(d.hero, d.champion);
    if (new Set(special).size !== special.length) problems.push(at + ": a card occupies two special slots");

    if (d.tags.length < 2 || d.tags.length > 5) problems.push(at + ": " + d.tags.length + " tags");
    d.tags.forEach(function (t) {
      if (!tagSet.has(t)) problems.push(at + ": tag " + t + " not allowed");
    });
    if (new Set(d.tags).size !== d.tags.length) problems.push(at + ": duplicate tags");

    if (!ALLOWED_META.includes(d.meta)) problems.push(at + ": meta " + d.meta);
    if (!ALLOWED_TIER.includes(d.tier)) problems.push(at + ": tier " + d.tier);
    if (d.modes && d.modes.some(function (m) { return ALLOWED_META.indexOf(m) === -1; })) problems.push(at + ": mode " + d.modes.join(","));
  });

  if (problems.length) throw new Error("meta-decks.js invalid:\n  " + problems.join("\n  "));
}

if (META_DECKS.some(function (d) { return d.cards.length !== 8; })) throw new Error("deck size");
validate(META_DECKS);

if (typeof module !== "undefined" && module.exports) module.exports = { META_DECKS };

if (typeof process !== "undefined" && process.stdout) {
  const tiers = { S: 0, A: 0, B: 0 };
  const metas = { ladder: 0, clanwars: 0, challenge: 0 };
  META_DECKS.forEach(function (d) { tiers[d.tier]++; (d.modes || [d.meta]).forEach(function (m) { metas[m]++; }); });
  process.stdout.write(
    "meta-decks.js: " + META_DECKS.length + " decks validated — " +
    "S:" + tiers.S + " A:" + tiers.A + " B:" + tiers.B + " | " +
    "ladder:" + metas.ladder + " clanwars:" + metas.clanwars + " challenge:" + metas.challenge + "\n"
  );
}
