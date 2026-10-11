# GamePad

A game store where you own the copy. Buy games with SOL, sell them on when you're done, and the studio earns a royalty every time a copy changes hands.

The whole store fits on one screen. Five tabs (left rail on desktop, top bar on phones) switch between Store, Market, Library, Studio and Profile, and a single 3D stage behind them re-stages itself for each one: the selected game floats as a holographic license card, your library fans out like a hand of cards, and the profile shows the controller logo in 3D. Behind it all, a looping clip of floating game worlds joined by bridges of foil light plays full screen, tinted by the selected game's cover.

You can drive it with a real game controller (Gamepad API): d-pad or stick to move, A to buy, play or confirm, B to go back, X for used copies or selling from Library, LB/RB to switch tabs. On a keyboard: arrows, A or Enter, B or Esc, X, and Q/E or `[`/`]`.

## Play the offline campaigns

All 16 catalog titles are original, compact single-player games with authored campaigns, playable objectives, failure/retry and story endings. There are 90 chapters in total. Each game has its own mechanics and original canvas graphics; no external art, API or game service is required during play.

Try the first chapter from Store without a wallet. Purchased games in Library have **Play campaign** and **Download offline**. Open a downloaded `.html` in a modern browser to play its complete campaign without a server, wallet or internet connection. The store's SOL prices and licenses cover its purchase/resale flow; downloaded games run independently.

Use arrows/WASD, Space/Enter for the primary action, X/Shift for the secondary action, and P/Escape to pause. Standard controllers use the stick/D-pad, A/X and Start. Touch controls are on screen; adventures and board games also accept board taps. Each game's briefing explains its mechanics. Browser focus loss pauses gameplay.

Progress saves automatically when browser storage is available. **Controls and save files** offers JSON export/import for backups or moving between devices. Local-file browser storage can vary, so export before moving your game or clearing browser data.

| Game | Chapters | Gameplay |
| --- | ---: | --- |
| Neon Drift Protocol | 5 | Steer, thrust, brake and boost through checkpoint circuits |
| Hollow Crown | 6 | Explore, collect seals, fight sentinels and brace against attacks |
| Orbital Salvage | 5 | Inertial tug piloting, tractor cargo and dock deliveries |
| Pixel Tavern | 6 | Mix ordered recipes, manage stock and serve guest tickets |
| Shardfall Tactics | 6 | Two-unit grid battles, action points, cover and enemy turns |
| Kaiju Kitchen | 6 | Match monster cravings, chain meals and manage stove heat |
| Echoes of Vael | 6 | Recover archive folios and decode rune sequences |
| Gridlock Arena | 5 | Move, fire, dash and survive escalating sentry waves |
| Moss & Marrow | 6 | Deck battles, damage, guard, growth and reward drafting |
| Starline Couriers | 5 | Parcel routes, traffic avoidance and battery management |
| Deep Tide | 5 | Recover relics, navigate currents and ration diving oxygen |
| Chrono Bazaar | 6 | Buy aging goods and time sales against market deadlines |
| Rift Runners | 5 | Double-jump, air dash, collect runes and avoid thorns |
| Ironbloom | 6 | Gather wood/ore, grow flowers and craft garden repairs |
| Lumen Cascade | 6 | Rotate mirrors and route colored light to receivers |
| Saltwind Sagas | 6 | Sail tide passages, salvage supplies, light beacons and repair |

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
