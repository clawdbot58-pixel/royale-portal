# Verified Clash Royale deck rules (Oct 2026)

Sources: Supercell blog "Upcoming Changes to Clash Royale!" (20 Feb 2026), Supercell blog "Mid-March Update" (16 Mar 2026, deck slot rework 4 → 3), support.clashroyale.com "Cards & Decks" (three special slots; hero slot takes heroes or champions), support.clashroyale.com Card Evolution + Heroes articles, clashroyale.fandom.com/wiki/Heroes, Supercell blog "Fired Up!" (4 Aug 2025, Furnace rework) + RoyaleAPI/Liquipedia version history.

- Deck = 8 cards.
- Special slots (since the Mid-March 2026 rework, 4 → 3; applies to Trophy Road / Ranked / Challenges / Events): 1 Evolution slot (evolutions only), 1 Hero slot (heroes AND champions — there is no dedicated champion slot), 1 Wild slot (evolution, hero or champion). A special card in a normal slot does NOT get its special behaviour. Decks built under the old 4-slot system are rejected by Ranked/Events until the fourth special is removed.
- Max in one deck: 3 special cards total; 2 evolutions (evo slot + wild), 2 heroes (hero slot + wild), 2 champions (hero slot + wild). Heroes and champions share the hero slot: one of them takes it, the other needs the wild slot.
- Evolution slot unlocks Arena 3 (600 trophies); Hero slot Arena 5 (moved from Arena 15 on 23 Feb 2026); Wild slot Arena 10 (3000 trophies).
- Furnace is a troop since the Aug 2025 rework (was a building): 4-elixir ranged attacker, hits air and ground, spawns one Fire Spirit at a time. It is no longer a defensive building.
- Evolution unlock: 6 Evolution Shards per card. Evolution levels 1..3 (API `maxEvolutionLevel`, player `evolutionLevel`).
- Hero unlock: 200 Hero Shards per hero; heroes upgrade with the base card's rarity wild cards. Hero abilities became single-use on 4 Aug 2026.
- Tower troop (support card): exactly 1 equipped, not part of the 8 cards. API: `supportCards[]` (levels), `currentDeckSupportCards[]` (the equipped one).
- API names are authoritative for matching. Note `Mini P.E.K.K.A` (no trailing dot) in the API.
- The developer API does NOT expose hero cards: `/cards` has no hero rarity and no hero names. Hero availability must be modelled from the curated hero list below; hero unlock state is not readable from the API.

## Released heroes (16) — hero form of the base card

| base card | elixir | ability cost | total | ability |
|---|---|---|---|---|
| Knight | 3 | 2 | 5 | Triumphant Taunt — shield + taunt nearby enemies |
| Giant | 5 | 2 | 7 | Heroic Hurl — throws highest-HP enemy troop across the arena |
| Mini P.E.K.K.A | 4 | 1 | 5 | Breakfast Boost — eats pancakes to level up |
| Musketeer | 4 | 3 | 7 | Trusty Turret — spawns rapid-firing turret in front |
| Ice Golem | 2 | 2 | 4 | Snowstorm — blizzard damages and slows nearby enemies |
| Wizard | 5 | 1 | 6 | Fiery Flight — launches, throws fire tornadoes, pulls enemies centre |
| Goblins | 2 | 1 | 3 | Banner Brigade — last goblin standing drops a banner, calls reinforcements |
| Mega Minion | 3 | 2 | 5 | Wounding Warp — warps to lowest-HP enemy, reduced tower damage |
| Barbarian Barrel | 2 | 1 | 3 | Rowdy Reroll — barrels down the lane a second time |
| Magic Archer | 4 | 2 | 6 | Triple Threat — decoy, dart back, triple shot on next attack |
| Balloon | 5 | 2 | 7 | Coffin Cadet — Skeletrooper soars to nearest ground enemy |
| Bowler | 5 | 2 | 7 | Stone Swish — plants feet, boulders with increased range |
| Dark Prince | 4 | 3 | 7 | Destructive Dismount — dismount damage, attacks on foot, Rhino charges buildings |
| Tombstone | 3 | 5 | 8 | Regal Revive — Tomb Queen rises, targets buildings |
| Berserker | 2 | 3 | 5 | Savage Survival — bear spirit, rapid attacks, HP floor 1, reduced tower damage |
| Valkyrie | 4 | 3 | 7 | Wild Whirlwind — spins, damage + speed, takes less damage |

Ice Wizard hero is announced ("coming soon") and not released.

## API card names (123 items, authoritative)

common (29): Knight, Archers, Goblins, Minions, Barbarians, Skeletons, Bomber, Spear Goblins, Minion Horde, Royal Giant, Ice Spirit, Fire Spirit, Goblin Gang, Elite Barbarians, Royal Recruits, Bats, Rascals, Skeleton Barrel, Firecracker, Skeleton Dragons, Electro Spirit, Berserker, Cannon, Mortar, Tesla, Arrows, Zap, Giant Snowball, Royal Delivery

rare (31): Giant, Valkyrie, Musketeer, Wizard, Mini P.E.K.K.A, Hog Rider, Three Musketeers, Battle Ram, Ice Golem, Mega Minion, Dart Goblin, Zappies, Flying Machine, Royal Hogs, Elixir Golem, Battle Healer, Goblin Demolisher, Suspicious Bush, Minion Giant, Goblin Hut, Inferno Tower, Bomb Tower, Barbarian Hut, Elixir Collector, Tombstone, Furnace, Goblin Cage, Fireball, Rocket, Earthquake, Heal Spirit

epic (33): P.E.K.K.A, Balloon, Witch, Golem, Skeleton Army, Baby Dragon, Prince, Giant Skeleton, Guards, Dark Prince, Bowler, Hunter, Executioner, Cannon Cart, Wall Breakers, Goblin Giant, Electro Dragon, Electro Giant, Rune Giant, X-Bow, Goblin Drill, Rage, Goblin Barrel, Freeze, Mirror, Lightning, Poison, Tornado, Clone, Barbarian Barrel, Void, Goblin Curse, Vines

legendary (22): Ice Wizard, Princess, Lava Hound, Miner, Sparky, Lumberjack, Inferno Dragon, Electro Wizard, Bandit, Night Witch, Royal Ghost, Ram Rider, Mega Knight, Fisherman, Magic Archer, Mother Witch, Phoenix, Goblin Machine, Ronin, Graveyard, The Log, Spirit Empress

champion (8): Mighty Miner, Skeleton King, Archer Queen, Golden Knight, Monk, Little Prince, Goblinstein, Boss Bandit

tower troops (4): Tower Princess (common), Cannoneer (epic), Dagger Duchess (legendary), Royal Chef (legendary)
