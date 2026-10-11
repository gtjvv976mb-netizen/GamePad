# GamePad

A game store where you own the copy. Buy games with SOL, sell them on when you're done, and the studio earns a royalty every time a copy changes hands.

The whole store fits on one screen. Five tabs (left rail on desktop, top bar on phones) switch between Store, Market, Library, Studio and Profile, and a single 3D stage behind them re-stages itself for each one: the selected game floats as a holographic license card, your library fans out like a hand of cards, and the profile shows the controller logo in 3D. Behind it all, a looping clip of floating game worlds joined by bridges of foil light plays full screen, tinted by the selected game's cover.

You can drive it with a real game controller (Gamepad API): d-pad or stick to move, A to buy, play or confirm, B to go back, X for used copies or selling from Library, LB/RB to switch tabs. On a keyboard: arrows, A or Enter, B or Esc, X, and Q/E or `[`/`]`.

## Play the offline campaigns

All 16 catalog titles are original single-player browser games with authored campaigns, playable objectives, failure/retry and story endings. There are 90 chapters in total. The quality rebuild adds continuous worlds, stronger movement/combat, multi-stage strategy systems and permanent equipment. Original illustrated sprites, layered environments, music and effects are included in each download; no external asset, API or game service is required during play. See [game design and Steam research](src/games/DESIGN.md) and [art provenance](src/games/assets/PROMPTS.md).

Try the first chapter from Store without a wallet. Purchased games in Library have **Play campaign** and **Download offline**. Open a downloaded `.html` in a modern browser to play its complete campaign without a server, wallet or internet connection. The store's SOL prices and licenses cover its purchase/resale flow; downloaded games run independently.

Use arrows/WASD, Space/Enter for the primary action, X/Shift for the secondary action, and P/Escape to pause. Standard controllers use the stick/D-pad, A/X and Start, with right-stick aiming in combat. Select focuses a decision panel; confirm chooses an option and B returns to the board. Touch controls and decision buttons are on screen. Each game's briefing explains its mechanics. Sound, volume, Hints and Full screen controls are available; browser focus loss pauses gameplay.

Progress and earned equipment save automatically when browser storage is available. **Controls and save files** offers validated JSON export/import for backups or moving between devices. Older prototype saves retain campaign unlocks and restart the changed chapter under its new rules. Local-file browser storage can vary, so export before moving your game or clearing browser data.

| Game | Chapters | Gameplay |
| --- | ---: | --- |
| Neon Drift Protocol | 5 | Drift/boost, AI rivals, multi-lap races, medals and car modules |
| Hollow Crown | 6 | Scrolling keeps, telegraphed combat, dodges, keeper requests, boss and gear |
| Orbital Salvage | 5 | Physical tethered cargo, mass, drones, airlocks, fuel and tug modules |
| Pixel Tavern | 6 | Worker travel, two stoves, batches, freshness, arriving guests and service chains |
| Shardfall Tactics | 6 | Three specialists, enemy intentions, shove/terrain and rescue/defense/escort |
| Kaiju Kitchen | 6 | Knife cuts, timed grilling/flips, seasoning, craving chains and stomps |
| Echoes of Vael | 6 | Scrolling archives, folios, dialogue, memory puzzles and restored machinery |
| Gridlock Arena | 5 | Combat rooms, weapon drops, varied enemies, aiming and sector bosses |
| Moss & Marrow | 6 | 24 spells, branching expeditions, traders/camps, relics and persistent decks |
| Starline Couriers | 5 | Van driving, traffic signals, pickups, fragile deliveries and battery |
| Deep Tide | 5 | Multi-room diving, valves, doors, wildlife, currents and air |
| Chrono Bazaar | 6 | Three-town caravan, demand, aging/spoilage, contracts and travel |
| Rift Runners | 5 | Scrolling platforms, responsive jumps, dashes, checkpoints, secrets and boss |
| Ironbloom | 6 | Gathering, renewable crops, keeper requests and visible industrial repairs |
| Lumen Cascade | 6 | Three rooms per temple, mirrors/splitters, movable crystals and shutters |
| Saltwind Sagas | 6 | Wind/inertial sailing, raider combat, beacons, repairs and ship upgrades |

`npm run build:games` produces `public/games/*.html` and a size/chapter manifest. `npm run dev` and `npm run build` generate those files automatically; production copies are in `dist/games/`. Campaign content is in `src/games/campaigns/`, engines in `src/games/engines/`, and shared input, save and story UI in `src/games/standalone.ts`. Generated game files are ignored by Git and rebuilt from source.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run test:e2e     # Playwright, desktop and phone sizes (builds first: npm run build)
```

## Preview mode and live mode

- **Live:** a Solana wallet is connected and the store program is deployed on devnet. Purchases, listings and resales are real devnet transactions, and ownership is read from the chain.
- **Preview:** the program isn't deployed yet, or "Look around without a wallet". Everything works the same, but it's simulated in the browser and labeled "Preview".

Solana devnet only. Mainnet (real money) is deliberately not configured.

To go live on devnet, deploy the program (see [program/README.md](program/README.md)), then put its id in `.env`:

```sh
cp .env.example .env
# VITE_STORE_PROGRAM_DEVNET=<program id>
# VITE_SOLANA_RPC=<optional devnet RPC; defaults to https://api.devnet.solana.com>
```

## Wallets and sign-in

Any Solana wallet that supports the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) shows up by name: Phantom, Solflare, Backpack and others. Without one installed, the sheet offers to open GamePad inside the Phantom or Solflare app. After connecting, players sign in with Sign In With Solana, a free signature with no transaction; the site checks the Ed25519 signature and that the message carries its own domain and nonce. The last wallet reconnects quietly on the next visit.

Transactions are signed in the wallet and sent to devnet through the site's own RPC, so they land on devnet whatever network the wallet is showing. `e2e/wallet.spec.ts` runs the sign-in against a stand-in wallet with a real Ed25519 key, including a forged signature that must be refused.

## How it's built

- React 19, TypeScript, Vite.
- 3D: three.js with @react-three/fiber and drei. A custom shader for the holographic foil. Resolution steps down on slower GPUs, and without WebGL (or with `?no3d`) the stage falls back to CSS.
- The logo is a pixel mark: a controller on a 16 by 10 grid, with two foil cells for the face buttons. The flat mark is an SVG drawn at a whole number of screen pixels per cell, so it stays sharp. In 3D each pixel is a stack of two cubes, and the two foil cubes hop around the hub between the face buttons.
- Motion: CSS for the interface choreography, Motion (Framer Motion) for tab and sheet transitions, and the 3D layer for the card, the voxels and the camera. See [Motion](#motion).
- Solana: @solana/kit for transactions and reads, the Wallet Standard for wallets, and the `gamepad_store` Anchor program in [program/](program/), which keeps licenses in the store so every resale pays the studio.
- Fonts: Big Shoulders Display, Manrope and JetBrains Mono, self-hosted.
- Cover art, the short cover loops (all 16 games) and the background clip were generated with Higgsfield. The background is a seamless 9.5 second loop (VP9 WebM with an H.264 fallback, a portrait cut for phones); with Data Saver on, or the stop button pressed, it shows its first frame instead. The first visit of a session opens with a second Higgsfield clip, a 5 second fly-in through a warp tunnel that lands on the loop's first frame (`public/world/intro-*`).
- Design tokens and the UI parts are mirrored in the GamePad Brand Board Figma file, on the "GamePad v3 · real app" page; the pixel mark is not there yet.

## Motion

The site moves in one of three modes, set on `<html data-motion>` by [src/lib/motion.ts](src/lib/motion.ts):

| Mode | Who | What moves |
|---|---|---|
| `full` | everyone by default | everything: the fly-in, the interface arriving in sequence, the 3D card swoop and flips, voxel bursts, camera parallax, glints, the hero carousel |
| `calm` | devices set to reduce motion | the world clip, the cover loops, the floating 3D card and voxels, copy that fades in; no fly-in, flips, bursts, glints, parallax or carousel |
| `off` | anyone who presses the stop button (top right) | nothing; every clip rests on a still. The choice is remembered in `localStorage` |

`WHEN_REDUCED` in `src/lib/motion.ts` decides what a reduce-motion device gets (`calm` now; `full` would give it everything).

The first visit of a session plays the fly-in ([src/ui/World.tsx](src/ui/World.tsx)); at 2.5 s, as the camera bursts out of the warp, the interface comes in and the 3D card swoops into place ([src/lib/show.ts](src/lib/show.ts)). Any tap or key skips it, a clip that hasn't started within 1.5 s is skipped, and the interface is in after 6 s whatever happens. `?nointro` skips it (the tests use it). Each change of game is a beat: the card flips with a punch, the voxels burst and spring home, and the title rebuilds letter by letter. After the first game has had 7 s on screen and nobody has touched anything for 6 s, the hero turns to the next game every 7 s; it holds under the pointer, while a sheet or a transaction is open, and when the tab is hidden.

The timeline, the beats, the loops and the easings are drawn on the "Motion v4" board in the Figma file. `e2e/motion.spec.ts` checks the clip plays at full and calm, the stop button stops everything and sticks, a phone that blocks autoplay starts on the first tap, the carousel turns, and the fly-in hands over to the store.

## Design check

Every tab is scanned with [Impeccable](https://impeccable.style)'s detector at desktop and phone sizes, against the build served by `npm run preview`:

```sh
npx impeccable detect --viewport 1440x900 "http://localhost:4173/?no3d#store"
npx impeccable detect --viewport 390x844 "http://localhost:4173/?no3d#store"
```

URL scans need Chrome or Chromium (set `IMPECCABLE_BROWSER` to its path if it isn't found).

## Deploying the site

The site lives at [gamedotpad.com](https://gamedotpad.com), served by GitHub Pages. `.github/workflows/pages.yml` builds `main` and publishes it; run it from the Actions tab.

One-time setup, done by the repository owner:

1. **GitHub:** Settings → Pages → Build and deployment → Source: **GitHub Actions**. Under Custom domain enter `gamedotpad.com` and save; once the certificate is issued, tick **Enforce HTTPS**.
2. **Namecheap:** Domain List → gamedotpad.com → Manage → Advanced DNS. Remove the parking records (the `www` CNAME to `parkingpage.namecheap.com` and the `@` URL redirect), then add:

   | Type | Host | Value |
   |---|---|---|
   | A Record | `@` | `185.199.108.153` |
   | A Record | `@` | `185.199.109.153` |
   | A Record | `@` | `185.199.110.153` |
   | A Record | `@` | `185.199.111.153` |
   | CNAME Record | `www` | `gtjvv976mb-netizen.github.io.` |

Without a program id in the repository variable `VITE_STORE_PROGRAM_DEVNET`, the live site runs in preview mode. `VITE_SOLANA_RPC` optionally points it at a devnet RPC other than the public one.
