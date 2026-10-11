# GamePad Originals — quality rebuild

The first release was a collection of compact prototypes. This rebuild keeps all 16 titles and 90 campaign chapters, but replaces their play systems and presentation. These are original small browser games; they do not reproduce the content or production scope of commercial Steam games.

## Research and direction

The Steam research covered accessible games and deeper simulations. References informed the level of interaction and progression to aim for; no artwork, characters, maps, code or story was copied.

- [Brotato](https://store.steampowered.com/app/1942280/Brotato/) and [Vampire Survivors](https://store.steampowered.com/app/1794680/Vampire_Survivors/): clear combat feedback, distinct enemy pressure and persistent build decisions.
- [Celeste](https://store.steampowered.com/app/504230/Celeste/): responsive platform controls, recoverable mistakes, checkpoints and authored challenges.
- [A Short Hike](https://store.steampowered.com/app/1055540/A_Short_Hike/) and [Stardew Valley](https://store.steampowered.com/app/413150/Stardew_Valley/): places to explore, local characters, optional requests and visible improvements to the world.
- [Into the Breach](https://store.steampowered.com/app/590380/Into_the_Breach/): readable enemy intentions, positioning and mission objectives beyond eliminating enemies.
- [Slay the Spire](https://store.steampowered.com/app/646570/Slay_the_Spire/): branching expeditions, deck decisions, rest, traders and relics.
- [Factorio](https://store.steampowered.com/app/427520/Factorio/), [RimWorld](https://store.steampowered.com/app/294100/RimWorld/) and [Against the Storm](https://store.steampowered.com/app/1336490/Against_the_Storm/): examples of deeper resource systems and interacting decisions. Their production scale exceeds these browser campaigns.

Steam's Single-player label alone does not establish offline compatibility for every title. Factorio documents [offline installation](https://wiki.factorio.com/Install_guide), RimWorld offers a [DRM-free download](https://rimworldgame.com/), and Against the Storm's developers confirm [no internet connection is required](https://steamcommunity.com/app/1336490/discussions/0/4040355128966440233/). GamePad's own downloaded HTML files are tested with the browser network disabled.

## Implemented play systems

| Title | Rebuilt systems |
| --- | --- |
| Neon Drift Protocol | Inertial steering, braking/drifting, boost, rival racers, multiple laps, medals and car modules |
| Orbital Salvage | Physical cargo tethers, mass and fragile cargo, drones, airlocks, fuel docking and tug modules |
| Starline Couriers | Accelerating van, street networks, traffic lights, business pickups, fragile parcels and van modules |
| Deep Tide | Multi-room diving, currents, pressure valves, doors, wildlife, depth/air and suit modules |
| Gridlock Arena | Combat rooms, weapon drops, six enemy behaviors, stick/automatic aim, phased sector bosses and weapon modules |
| Rift Runners | Scrolling levels, buffered/variable/double jumps, coyote time, dash/stomp attacks, moving/crumbling ledges, checkpoints, secrets and a guardian |
| Hollow Crown | Continuous exploration, telegraphed melee, dodge stamina, boss projectiles, keeper requests and permanent gear |
| Echoes of Vael | Scrolling archives, folios, keeper dialogue, rune memories, valve/shelf/light machinery and a memory lens |
| Ironbloom | Timber/ore gathering, timed renewable crops, optional requests, tools and visible repaired machinery |
| Saltwind Sagas | Wind/inertial sailing, cannons, raiders, beacons, salvage, ship repairs and permanent mast/cannon upgrades |
| Pixel Tavern | Moving worker, two independent stoves, recipe batches, freshness, timed guest arrivals, patience and service chains |
| Kaiju Kitchen | Knife cuts, grill timing, flips, seasoning, craving chains, heat and telegraphed stomps |
| Shardfall Tactics | Three specialists, visible intentions, AP/skills, shove/terrain interactions, rescue/defense/escort missions and equipment |
| Moss & Marrow | 24 original spells and improved variants, route forks, elites, events, camps, traders, relics and persistent decks |
| Chrono Bazaar | Three-town caravan, demand forecasts, timed aging/spoilage, contracts, travel, inventory and equipment |
| Lumen Cascade | Three optical rooms per chapter, mirrors/splitters, movable color crystals, shutters, live previews and exploration/precision modes |

## Presentation and offline operation

The games include 48 original illustrated sprites, layered environments, animation and effects. [Asset prompts and provenance](assets/PROMPTS.md) record the built-in image generation workflow. Music and effects are synthesized locally with Web Audio, unlock after a player gesture, and offer mute/volume controls.

Each standalone file embeds its art, code, story and styles. It makes no wallet, chain, API or other network request. Keyboard, standard controllers and touch use the same simulation controls. Decisions are accessible buttons; controller Select focuses a side panel, and confirm chooses an option. Full-screen and Hints controls allow more room for the world.

V2 snapshots preserve exact simulation state and title-specific equipment. Reward ledgers prevent repeatedly farming chapter rewards. Import validates the title, chapter, rules fingerprint, state and equipment before replacing the running game. Older prototype saves preserve campaign unlocks, while restarting the changed chapter with its new rules. Browser storage can be unavailable; JSON export/import remains usable.

Completion solvers exercise actual actions and choices rather than assigning victory states. Browser checks cover standalone downloads with networking disabled, embedded Store/Library play, touch/controller input, old-save migration, menus, sound, exact saves and a complete campaign ending. See the project verification report for the final run results.
