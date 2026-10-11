# GamePad store program

`programs/gamepad-store` is the on-chain store behind GamePad: an [Anchor](https://www.anchor-lang.com) program on Solana. Prices are in SOL (lamports on chain).

- **Studios** call `publish_game(price, royalty_bps, uri)` (royalty up to 15%, price can be 0 for free games) and can later `update_game(game_id, price, active)`. Each game is an account at the address `["game", id]`, numbered from 1.
- **Players** `buy(game_id, expected_price)`. The price goes straight out: GamePad's fee (`fee_bps`, 10% by default) to the treasury and the rest to the studio. `expected_price` makes the purchase fail instead of charging more if the studio changed the price meanwhile.
- **Licenses stay in the store.** A copy is a count on the player's license account at `["license", game_id, owner]`; there is no token to send around, so every resale goes through the store's market and pays the studio.
- **Resale:** `list(game_id, price)` moves one copy into a listing at `["listing", id]`, `cancel(listing_id)` returns it, and `buy_listing(listing_id)` pays the studio royalty, GamePad's fee and the seller in one go, hands the copy to the buyer and gives the listing's rent back to the seller.
- **Payouts are direct.** Every payment lands in the recipient's wallet inside the same transaction, so there is nothing to withdraw.
- The store's authority can `set_fee(fee_bps, treasury)` (15% max).

Recipients (studio, treasury, seller) need to hold at least the rent-exempt minimum (about 0.00089 SOL) before they can receive small payments; any wallet that has been used already does.

## Test

```sh
cd program
cargo test      # runs the program natively with solana-program-test, fully offline
```

`tests/store.rs` covers publishing, buying, every split down to the lamport, the price and studio checks, the caps, free games, listing, cancelling and resale. `tests/client_fixture.rs` writes [client-fixture.json](client-fixture.json) from the program's own instruction builders, and `e2e/program.spec.ts` checks the web client ([src/web3/storeProgram.ts](../src/web3/storeProgram.ts)) builds and reads exactly the same bytes. After changing the program, regenerate it with `UPDATE_FIXTURE=1 cargo test --test client_fixture`.

## Deploy to devnet

Devnet only. Mainnet handles real money and waits for the project owner's explicit decision, ideally after an external audit, with a production treasury (preferably a multisig).

You need the Solana CLI and Anchor 0.31.1 (`avm install 0.31.1`), and a devnet wallet with about 3 SOL: `solana-keygen new`, then `solana airdrop 2 --url devnet` or [faucet.solana.com](https://faucet.solana.com).

```sh
cd program
solana config set --url devnet
anchor keys sync          # writes the new program id into lib.rs and Anchor.toml
UPDATE_FIXTURE=1 cargo test --test client_fixture
anchor build && anchor deploy --provider.cluster devnet
STORE_PROGRAM=<program id> node scripts/seed.mjs
```

`scripts/seed.mjs` sets up the store (10% fee, treasury = your wallet unless `TREASURY` is set), funds a separate studio wallet (saved to `program/.keys/studio.json`, git-ignored) and publishes the 16 seed games in catalog order, so on-chain ids match `chainId` in `src/data/games.ts`. It skips anything already there, and refuses any RPC that isn't devnet.

Then set the repository variable `VITE_STORE_PROGRAM_DEVNET` to the program id (Settings → Secrets and variables → Actions → Variables) and run the Pages deploy. Locally, put it in `.env`.
