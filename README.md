# GamePad

A game store where you own the copy. Buy games with crypto, sell them on when you're done, and the studio earns a royalty every time a copy changes hands.

The whole store fits on one screen. Five tabs (left rail on desktop, top bar on phones) switch between Store, Market, Library, Studio and Profile, and a single 3D stage behind them re-stages itself for each one: the selected game floats as a holographic license card, your library fans out like a hand of cards, and the profile shows the controller logo in 3D. Behind it all, a looping clip of floating game worlds joined by bridges of foil light plays full screen, tinted by the selected game's cover.

You can drive it with a real game controller (Gamepad API): d-pad or stick to move, A to buy or confirm, B to go back, X for used copies, LB/RB to switch tabs. On a keyboard: arrows, A or Enter, B or Esc, X, and Q/E or `[`/`]`.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
npm run test:e2e     # Playwright, desktop and phone sizes (builds first: npm run build)
```

## Preview mode and live mode

- **Live:** a wallet is connected on a test network where the store contract is deployed. Purchases, listings, resales and withdrawals are real transactions on that test network, and ownership is read from the chain.
- **Preview:** no contract on that network yet, or "Look around without a wallet". Everything works the same, but it's simulated in the browser and labeled "Preview".

Test networks only: Base Sepolia and Sepolia. Mainnet (real money) is deliberately not configured.

To go live on a test network, deploy the contract (see [contracts/README.md](contracts/README.md)), then put its address in `.env`:

```sh
cp .env.example .env
# VITE_STORE_ADDRESS_BASE_SEPOLIA=0x...
```

## Wallets and sign-in

Wallets connect through wagmi and viem: any installed browser wallet (MetaMask, Rabby and others, discovered with EIP-6963) or Coinbase Smart Wallet, which uses a passkey and needs no extension. After connecting, players sign in with Sign-In with Ethereum (EIP-4361), a free signature with no transaction.

## How it's built

- React 19, TypeScript, Vite.
- 3D: three.js with @react-three/fiber and drei. A custom shader for the holographic foil. Resolution steps down on slower GPUs, and without WebGL (or with `?no3d`) the stage falls back to CSS.
- The logo is a pixel mark: a controller on a 16 by 10 grid, with two foil cells for the face buttons. The flat mark is an SVG drawn at a whole number of screen pixels per cell, so it stays sharp. In 3D each pixel is a stack of two cubes, and the two foil cubes hop around the hub between the face buttons.
- Motion: Motion (Framer Motion) for tab and sheet transitions. Reduced-motion settings are respected.
- Web3: wagmi 2, viem 2, and the `GamePadStore` ERC-1155 contract in [contracts/](contracts/) with royalty-enforcing resale.
- Fonts: Big Shoulders Display, Manrope and JetBrains Mono, self-hosted.
- Cover art, the short cover loops (all 16 games) and the background clip were generated with Higgsfield. The background is a seamless 9.5 second loop (VP9 WebM with an H.264 fallback, a portrait cut for phones); with Reduce motion or Data Saver on it shows its first frame instead.
- Design tokens and the UI parts are mirrored in the GamePad Brand Board Figma file, on the "GamePad v3 · real app" page; the pixel mark is not there yet.

## Design check

Every tab is scanned with [Impeccable](https://impeccable.style)'s detector at desktop and phone sizes, against the build served by `npm run preview`:

```sh
npx impeccable detect --viewport 1440x900 "http://localhost:4173/?no3d#store"
npx impeccable detect --viewport 390x844 "http://localhost:4173/?no3d#store"
```

URL scans need Chrome or Chromium (set `IMPECCABLE_BROWSER` to its path if it isn't found).

## Deploying the site

`.github/workflows/pages.yml` publishes to GitHub Pages, but only when someone runs it by hand from the Actions tab. Nothing goes public automatically.
