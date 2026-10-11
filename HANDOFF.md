# GamePad handoff — 11 October 2026

## Recovered state

Recovery status: **partial**. Current GitHub code and the latest Claude UI context are recovered; full cloud history and the original private program key are unavailable.

- Source: https://github.com/gtjvv976mb-netizen/GamePad
- Recovered `main`: `68ebda7a27e9a05a4da50a87adfe6470aa719cef` (merged PR 3, Solana port).
- Claude project: `chan_01HCfZW6ZrMspK3L9wreXcmi`; thread **GamePad storefront website**: `cmsg_01HCfZW6ZrMspK3L9wreXcmi8gfRkvRzGnbR1hYfBKoBc3`.
- Latest substantive Claude thread update: 11 October 2026, 7:56 PM Asia/Manila. It reported the Solana website live and verified on desktop and phone. Purchases remain simulated and labeled Preview pending store program deployment to devnet.
- User decisions recovered in Claude: use Solana, keep licenses in store rather than wallet NFTs, publish the Solana website. These describe past work; the current continuation request does not independently authorize new deployments.
- Original local Claude source/transcript could not be found. Current code and the latest UI context are recovered; full historical cloud conversation and original keys are not recovered.

## Independent verification

- GitHub Pages run `38137214736` succeeded for the recovered main at 7:54 PM Asia/Manila. CI run `38123556341` also succeeded.
- Live https://gamedotpad.com shows SOL prices and offers Phantom/Solflare; wallet-free browsing is explicitly Preview mode.
- Repository Actions variable listing was empty; no store program is configured for the published build.
- Public devnet is reachable here. Its genesis hash is `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Program ID in recovered source/fixture/Anchor config: `9xNeviToGk1PGUhbwCHNXoxYGwQn9x2oggtJzXhdoT9u`. Devnet read-back found no such account. No private program key was recovered.

## Current continuation

Branch: `codex/gamepad-devnet-readiness`.

The continuation fixes price consent and seed sale terms, retains owned/resale access for inactive games, uses the current on-chain platform fee and prevents superseded refreshes from replacing newer state. Wallet sends verify the RPC's genesis hash before signing.

Program initialization requires its loader-owned upgrade authority proof. The first 16 catalog publishes require the store authority to co-sign; later studio publishing remains open. Seed preflight checks program ownership, authority, payout settings, catalog contents and original studio key before any key generation or transfers. The deployment instructions use explicit project keys and RPC endpoints.

Local devnet preparation (keys ignored, mode 0600):

- Dedicated authority/treasury public key: `Ec3nquqYBCJAYUtezfMrkGKcdEmgx3xPE25CKUSj12cV`; private file `program/.keys/devnet-authority.json`. Read-back balance is 0 devnet SOL.
- New program public key: `7WBHwtN7nZELLnhKAC3GiwZ4RTBjZPaGTrL9LbqYowS5`; private file `program/target/deploy/gamepad_store-keypair.json`. Source, both Anchor clusters and fixture have been synchronized to it. The original program key was unavailable.
- Built artifact: `program/target/deploy/gamepad_store.so`, 372,696 bytes, SHA-256 `56444e6e8f1b525e8962466593170a0fb3cf64e871b20c73530cf4f50ce0eaed`.
- Project-local official Agave 4.3.0 tools: `program/.tools/solana-release/bin`. Platform tools v1.57, Rust 1.95.0. CI uses the same versions. The originally installed CLI binaries were not replaced.

Verified locally: production build, all 11 native tests (9 store behavior/security cases plus generated ID and client fixture), SBF build and 40 distinct desktop/phone browser checks (12 intentional skips of duplicate Node/live cases and phone-only limitations). See `verification/README.md` for exact results and the corrected test-harness timeout.

Next external steps require approval: merge the reviewed PR; obtain faucet test SOL for this dedicated wallet; deploy this built program to devnet with the dedicated upgrade authority; initialize and seed 16 games (10% fee, separate studio, treasury above); verify by on-chain read-back; set the repository's `VITE_STORE_PROGRAM_DEVNET` variable; run and verify GitHub Pages publication. The store program is currently absent from devnet.

No new on-chain transaction, program deployment, Pages publication or external account setting has been performed during this continuation.
