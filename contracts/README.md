# GamePad contracts

`src/GamePadStore.sol` is the on-chain store behind GamePad. It is an ERC-1155 contract: each token id is a game, and one token is one license (one copy).

- **Studios** call `publishGame(price, royaltyBps, uri)` (royalty up to 15%, price can be 0 for free games) and can later `updateGame(id, price, active)`.
- **Players** `buy(id)` for the exact price. The contract mints the license and splits the payment: the platform fee (`feeBps`, 10% by default) goes to the treasury and the rest goes to the studio.
- **Resale:** `list(id, price)` puts one copy in contract escrow, `cancel(listingId)` returns it, and `buyListing(listingId)` pays the studio royalty, the platform fee and the seller, then hands the license to the buyer.
- **Payouts** are pull-based. Sales only credit `owed[account]`, and each account calls `withdraw()` to receive its balance (non-reentrant, checks-effects-interactions).
- Licenses stay freely transferable. Royalties are enforced on the built-in market, and ERC-2981 `royaltyInfo` exposes the same royalty to other marketplaces.
- The owner can `setFee(bps)` (15% max) and `setTreasury(address)`.

## Test

```sh
cd contracts
npm install
npm test        # compiles with solc-js, then runs node:test against Hardhat's in-process EVM (fully offline)
```

Other scripts:

- `npm run build` writes `out/GamePadStore.json` with the ABI and bytecode.
- `npm run export-abi` writes `../src/web3/storeAbi.ts` as `export const storeAbi = [...] as const` for wagmi/viem. Run it after any contract change.

## Deploy to Base Sepolia (testnet)

1. Create a **throwaway** wallet and copy its private key. Never use a key that holds real funds.
2. Fund the wallet with Base Sepolia ETH from a faucet, such as the Coinbase Developer Platform faucet, or the Alchemy or QuickNode Base Sepolia faucets. About 0.01 ETH is plenty.
3. Deploy, adding `--seed` to also publish the 16 games in `seed-games.json` as ids 1 to 16:

   ```sh
   PRIVATE_KEY=0x... CHAIN=baseSepolia npm run deploy -- --seed
   # optional: RPC_URL=https://... (defaults to the chain's public RPC), BASE_URI=ipfs://...
   ```

4. The script prints the contract address and the line to paste into the front-end `.env`, for example `VITE_STORE_ADDRESS_BASE_SEPOLIA=0x...`. With `CHAIN=sepolia` it prints `VITE_STORE_ADDRESS_SEPOLIA=0x...` instead.

The deployer becomes both the owner and the treasury. Use `setTreasury` to move fees elsewhere. The seed games are published from the deployer, so the deployer is also their studio. The seed URIs are `ipfs://pending/<slug>.json` placeholders.

## Mainnet

The deploy script only accepts `baseSepolia` and `sepolia`. It also refuses to run if `RPC_URL` points at a different chain. A mainnet deployment handles real money and needs the project owner's explicit decision first, ideally after an external audit. It also needs a production treasury, preferably a multisig, and final fee and royalty settings.
