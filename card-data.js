// ===== CARD UPGRADE DATA =====
// arr[N] = cards needed to REACH level N from N-1 (incremental).
// cardsForNext(level=15) reads arr[16] for the 15→16 cost.
// Values from the official Clash Royale upgrade table (post level-16 update).

// ── Cards needed per upgrade step ──
// Mapping: arr[targetLevel] = cost from (targetLevel-1) → targetLevel

var CARDS_COMMON = [
  0,         // idx 0  — unused
  1,         // idx 1  — 0→1  (unlock)
  2,         // idx 2  — 1→2
  4,         // idx 3  — 2→3
  10,        // idx 4  — 3→4
  20,        // idx 5  — 4→5
  50,        // idx 6  — 5→6
  100,       // idx 7  — 6→7
  200,       // idx 8  — 7→8
  400,       // idx 9  — 8→9
  800,       // idx 10 — 9→10
  1000,      // idx 11 — 10→11
  1500,      // idx 12 — 11→12
  2500,      // idx 13 — 12→13
  3500,      // idx 14 — 13→14
  5500,      // idx 15 — 14→15
  7500,      // idx 16 — 15→16
];

var CARDS_RARE = [
  0,         // idx 0
  0,         // idx 1
  0,         // idx 2
  1,         // idx 3  — 2→3 (unlock at lv 3)
  2,         // idx 4  — 3→4
  4,         // idx 5  — 4→5
  10,        // idx 6  — 5→6
  20,        // idx 7  — 6→7
  50,        // idx 8  — 7→8
  100,       // idx 9  — 8→9
  200,       // idx 10 — 9→10
  300,       // idx 11 — 10→11
  400,       // idx 12 — 11→12
  550,       // idx 13 — 12→13
  750,       // idx 14 — 13→14
  1000,      // idx 15 — 14→15
  1400,      // idx 16 — 15→16
];

var CARDS_EPIC = [
  0,         // idx 0
  0,         // idx 1
  0,         // idx 2
  0,         // idx 3
  0,         // idx 4
  0,         // idx 5
  1,         // idx 6  — 5→6 (unlock at lv 6)
  2,         // idx 7  — 6→7
  4,         // idx 8  — 7→8
  10,        // idx 9  — 8→9
  20,        // idx 10 — 9→10
  30,        // idx 11 — 10→11
  50,        // idx 12 — 11→12
  70,        // idx 13 — 12→13
  100,       // idx 14 — 13→14
  130,       // idx 15 — 14→15
  180,       // idx 16 — 15→16
];

var CARDS_LEGENDARY = [
  0,         // idx 0
  0,         // idx 1
  0,         // idx 2
  0,         // idx 3
  0,         // idx 4
  0,         // idx 5
  0,         // idx 6
  0,         // idx 7
  0,         // idx 8
  1,         // idx 9  — 8→9 (unlock at lv 9)
  2,         // idx 10 — 9→10
  4,         // idx 11 — 10→11
  6,         // idx 12 — 11→12
  9,         // idx 13 — 12→13
  12,        // idx 14 — 13→14
  14,        // idx 15 — 14→15
  20,        // idx 16 — 15→16
];

var CARDS_CHAMPION = [
  0,         // idx 0
  0,         // idx 1
  0,         // idx 2
  0,         // idx 3
  0,         // idx 4
  0,         // idx 5
  0,         // idx 6
  0,         // idx 7
  0,         // idx 8
  0,         // idx 9
  0,         // idx 10
  1,         // idx 11 — 10→11 (unlock at lv 11)
  2,         // idx 12 — 11→12
  5,         // idx 13 — 12→13
  8,         // idx 14 — 13→14
  11,        // idx 15 — 14→15
  15,        // idx 16 — 15→16
];

// ── Gold cost per upgrade step, indexed same way ──
// arr[N] = gold to reach level N. Same for all rarities.
var GOLD_PER_LEVEL = [
  0,
  0,              // start
  5,              // → lv 2
  20,
  50,
  150,
  400,
  1000,
  2000,
  4000,
  8000,
  15000,
  25000,
  40000,
  60000,
  90000,
  120000,         // → lv 16
  150000,         // → lv 17
];

// ── Max level ──
var MAX_LEVELS = { common: 16, rare: 16, epic: 16, legendary: 16, champion: 16 };
var START_LEVELS = { common: 1, rare: 3, epic: 6, legendary: 9, champion: 11 };

// ── Deck slot rules (verified from the 16 Mar 2026 update) ──
// Deck = 8 cards. Special slots: 1 champion, 1 evolution, 1 hero, 1 wild.
// The wild slot accepts a champion, a hero, OR an evolution card, so the
// per-deck ceilings are 2 champions, 2 heroes, 2 evolutions. A special card
// placed in a normal slot does not get its special behaviour.
var DECK_SIZE = 8;
var SLOT_RULES = {
  maxChampions: 2,
  maxHeroes: 2,
  maxEvolutions: 2,
  slots: ["champion", "evolution", "hero", "wild", "normal"],
  unlockArena: { champion: 5, hero: 5, evolution: 3, wild: 10 },
  evoShardsToUnlock: 6,
  heroShardsToUnlock: 200,
};

// ── Heroes ──
// The developer API does NOT expose hero cards (no hero rarity, no hero names),
// so hero availability is modelled here from the released hero list. `base` is
// the exact API card name of the card the hero form belongs to. Heroes unlock
// at 200 hero shards and upgrade with the base card's rarity wild cards.
var HEROES = [
  { base: "Knight",         abilityCost: 2, ability: "Triumphant Taunt — gains a shield and taunts nearby enemies", released: "2025-12-01" },
  { base: "Giant",          abilityCost: 2, ability: "Heroic Hurl — throws the highest-HP enemy troop across the arena", released: "2025-12-01" },
  { base: "Mini P.E.K.K.A", abilityCost: 1, ability: "Breakfast Boost — eats pancakes to level up", released: "2025-12-01" },
  { base: "Musketeer",      abilityCost: 3, ability: "Trusty Turret — spawns a rapid-firing turret in front", released: "2025-12-01" },
  { base: "Ice Golem",      abilityCost: 2, ability: "Snowstorm — blizzard damages and slows nearby enemies", released: "2026-01-05" },
  { base: "Wizard",         abilityCost: 1, ability: "Fiery Flight — launches and throws fire tornadoes, pulling enemies centre", released: "2026-01-05" },
  { base: "Goblins",        abilityCost: 1, ability: "Banner Brigade — last goblin standing drops a banner, calls reinforcements", released: "2026-02-02" },
  { base: "Mega Minion",    abilityCost: 2, ability: "Wounding Warp — warps to the lowest-HP enemy, reduced tower damage", released: "2026-02-02" },
  { base: "Barbarian Barrel", abilityCost: 1, ability: "Rowdy Reroll — barrels down the lane a second time", released: "2026-03-02" },
  { base: "Magic Archer",   abilityCost: 2, ability: "Triple Threat — summons a decoy, darts back, triple shot on next attack", released: "2026-03-02" },
  { base: "Balloon",        abilityCost: 2, ability: "Coffin Cadet — a Skeletrooper soars to the nearest ground enemy", released: "2026-04-06" },
  { base: "Bowler",         abilityCost: 2, ability: "Stone Swish — plants his feet, throws boulders with increased range", released: "2026-05-04" },
  { base: "Dark Prince",    abilityCost: 3, ability: "Destructive Dismount — dismount damage, attacks on foot, Rhino charges buildings", released: "2026-05-04" },
  { base: "Tombstone",      abilityCost: 5, ability: "Regal Revive — Tomb Queen rises from the earth, targets buildings", released: "2026-06-01" },
  { base: "Berserker",      abilityCost: 3, ability: "Savage Survival — bear spirit, rapid attacks, HP floor at 1, reduced tower damage", released: "2026-08-03" },
  { base: "Valkyrie",       abilityCost: 3, ability: "Wild Whirlwind — spins rapidly, more damage and speed, takes less damage", released: "2026-08-03" },
];

// ── Tower troops (support cards, exactly 1 equipped, not part of the 8) ──
var TOWER_TROOPS = ["Tower Princess", "Cannoneer", "Dagger Duchess", "Royal Chef"];
