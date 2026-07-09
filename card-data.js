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
