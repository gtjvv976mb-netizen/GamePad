# GamePad store program

`programs/gamepad-store` is the on-chain store behind GamePad: an [Anchor](https://www.anchor-lang.com) program on Solana. Prices are in SOL (lamports on chain).

- **Studios** call `publish_game(price, royalty_bps, uri)` (royalty up to 15%, price can be 0 for free games) and can later `update_game(game_id, price, active)`. Each game is an account at the address `["game", id]`, numbered from 1. The first 16 IDs are reserved for the bundled catalog and require the store authority to co-sign; later publishing is open to every studio.
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

`tests/store.rs` covers initialization and bootstrap authority checks, publishing, buying, every split down to the lamport, the price and studio checks, the caps, free games, listing, cancelling and resale. `tests/client_fixture.rs` writes [client-fixture.json](client-fixture.json) from the program's own instruction builders, and `e2e/program.spec.ts` checks the web client's fixture-covered instructions and account layouts. After changing the program, regenerate it with `UPDATE_FIXTURE=1 cargo test --test client_fixture`.

## Deploy to devnet

Devnet only. Mainnet handles real money and waits for the project owner's explicit decision, ideally after an external audit, with a production treasury (preferably a multisig).

Deployment and publication require the owner's current approval. Local preparation and tests do not deploy anything. Use a dedicated project devnet wallet, never the default wallet or global CLI configuration. Keep both the authority and program keys private and backed up.

Use Agave 4.3.0, Anchor 0.31.1 and SBF platform tools v1.57 (also pinned in CI). Older `cargo-build-sbf` 2.1 uses an incompatible target and Rust toolchain. The CLI wallet is explicitly `program/.keys/devnet-authority.json`; `Anchor.toml` points there too. If these files have not been prepared yet:

```sh
cd program
umask 077
mkdir -p .keys target/deploy
solana-keygen new --no-bip39-passphrase --silent --outfile .keys/devnet-authority.json
solana-keygen new --no-bip39-passphrase --silent --outfile target/deploy/gamepad_store-keypair.json
anchor keys sync          # sync the new public program id into source/config
UPDATE_FIXTURE=1 cargo test --test client_fixture
cargo test --locked
cargo build-sbf --tools-version v1.57 --manifest-path programs/gamepad-store/Cargo.toml
```

After approval, verify `solana genesis-hash --url https://api.devnet.solana.com` is `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. Request faucet funds for the dedicated wallet (test SOL only); deployment rent depends on the built program size. Use explicit paths and endpoint on each command:

```sh
solana airdrop 2 --keypair .keys/devnet-authority.json --url https://api.devnet.solana.com
solana balance --keypair .keys/devnet-authority.json --url https://api.devnet.solana.com
solana program deploy target/deploy/gamepad_store.so \
  --program-id target/deploy/gamepad_store-keypair.json \
  --upgrade-authority .keys/devnet-authority.json \
  --keypair .keys/devnet-authority.json --url https://api.devnet.solana.com
STORE_PROGRAM=<program id> KEYPAIR=.keys/devnet-authority.json SEED_CHECK_ONLY=1 node scripts/seed.mjs
STORE_PROGRAM=<program id> KEYPAIR=.keys/devnet-authority.json node scripts/seed.mjs
```

`scripts/seed.mjs` verifies the RPC genesis hash and program deployment, then checks the existing store and catalog before generating a studio key or funding anything. `SEED_CHECK_ONLY=1` performs those reads without creating keys or sending transactions. Initialization requires the deployed program's upgrade authority; initialize before revoking it.

Seeding sets a 10% fee with treasury defaulting to the explicit authority wallet, funds a separate studio wallet (saved to `program/.keys/studio.json`, git-ignored), and publishes the 16 seed games in catalog order with the authority co-signature. A rerun must match the original store settings and every seeded game. Missing studio keys on a partial or complete existing catalog cause a refusal rather than replacement ownership. It can resume a valid partial seed and skips a matching complete seed without funding.

After confirming the deployed authority, 16 games and payout recipients by read-back, enable the site with repository variable `VITE_STORE_PROGRAM_DEVNET` and run Pages deployment, within the owner's publication approval. Locally, put it in `.env`. Browser transactions also verify devnet identity before wallet signing.
