import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { address, getAddressEncoder, getBase58Decoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import { ACCOUNT } from "../src/web3/storeProgram";

const fx = JSON.parse(readFileSync(new URL("../program/client-fixture.json", import.meta.url), "utf8")) as {
  program: string; keys: Record<"buyer" | "studio" | "treasury" | "seller" | "authority", string>;
  accounts: Record<"store" | "game" | "license" | "listing", string>;
};
const RPC_URL = "https://gamepad-test-rpc.invalid";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const pk = getAddressEncoder();
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const key = (a: string) => new Uint8Array(pk.encode(address(a)));
const metadata = Buffer.from(`data:application/json;base64,${Buffer.from(JSON.stringify({ name: "Retired Comet", genre: "Adventure" })).toString("base64")}`);
const retired = Buffer.concat([Buffer.from(ACCOUNT.Game), u64(17n), key(fx.keys.studio), u64(160_000_000n), u16(800), Buffer.from([0, 253]), u32(metadata.length), metadata]);
const signature = getBase58Decoder().decode(new Uint8Array(64).fill(1));

// This separate local Vite instance enables the real live-mode path. Every RPC call and wallet signature is mocked.
test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "live-mode regressions run once on desktop");
let server: ViteDevServer;
let appUrl: string;
test.beforeAll(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    define: {
      "import.meta.env.VITE_STORE_PROGRAM_DEVNET": JSON.stringify(fx.program),
      "import.meta.env.VITE_SOLANA_RPC": JSON.stringify(RPC_URL),
    },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  appUrl = server.resolvedUrls!.local[0];
});
test.afterAll(async () => { await server?.close(); });

async function mockLiveStore(page: Page, gamePrice = 250_000_000n) {
  let ownedCount = 1;
  let feeBps = 1000;
  let genesis = DEVNET_GENESIS;
  let licenseReads = 0;
  let holdGameRead: { started(): void; ready: Promise<void> } | undefined;
  const expectedPrices: bigint[] = [];
  const accepted: string[] = [];
  const account = (data: Buffer, executable = false) => ({ data: [data.toString("base64"), "base64"], executable, lamports: 1_000_000, owner: fx.program, rentEpoch: 0, space: data.length });
  const contextual = (value: unknown) => ({ context: { slot: 100 }, value });
  const base58 = getBase58Decoder();
  const discs = Object.fromEntries(Object.entries(ACCOUNT).map(([kind, bytes]) => [base58.decode(new Uint8Array(bytes)), kind]));
  await page.route(RPC_URL, async route => {
    const { id, method, params } = route.request().postDataJSON() as { id: string; method: string; params: unknown[] };
    let result: unknown;
    if (method === "getGenesisHash") result = genesis;
    else if (method === "getAccountInfo") {
      const store = Buffer.from(fx.accounts.store, "hex"); store.writeUInt16LE(feeBps, 72);
      result = contextual(params[0] === fx.program ? account(Buffer.alloc(0), true) : account(store));
    }
    else if (method === "getProgramAccounts") {
      const opts = params[1] as { filters: { memcmp: { bytes: string } }[] };
      const kind = discs[opts.filters[0].memcmp.bytes];
      if (kind === "License") licenseReads++;
      const game = Buffer.from(fx.accounts.game, "hex"); game.writeBigUInt64LE(gamePrice, 48);
      const license = Buffer.from(fx.accounts.license, "hex"); license.writeBigUInt64LE(17n, 40); license.writeUInt32LE(ownedCount, 48);
      const listing = Buffer.from(fx.accounts.listing, "hex"); Buffer.from(key(fx.keys.buyer)).copy(listing, 16); listing.writeBigUInt64LE(17n, 48);
      const rows = kind === "Game" ? [game, retired] : kind === "License" ? [license] : kind === "Listing" ? [listing] : [];
      result = rows.map(data => ({ pubkey: fx.program, account: account(data) }));
      if (kind === "Game" && holdGameRead) {
        const held = holdGameRead; holdGameRead = undefined; held.started(); await held.ready;
      }
    } else if (method === "getBalance") result = contextual(5_000_000_000);
    else if (method === "getLatestBlockhash") result = contextual({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 200 });
    else if (method === "sendTransaction") {
      const wire = Buffer.from(params[0] as string, "base64");
      const tx = getTransactionDecoder().decode(wire);
      const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
      if (msg.version === 1) throw new Error("The test wallet only supports legacy transactions");
      const ix = msg.instructions[0];
      const data = Buffer.from(ix.data!);
      if (data.subarray(0, 8).toString("hex") === "66063d1201daebea") {
        const expectedPrice = data.readBigUInt64LE(16);
        expectedPrices.push(expectedPrice);
        if (expectedPrice !== gamePrice) {
          await route.fulfill({ json: { jsonrpc: "2.0", id, error: {
            code: -32002, message: "Transaction simulation failed: The price changed; check it and try again",
            data: { err: { InstructionError: [0, { Custom: 6004 }] }, logs: ["Program log: The price changed; check it and try again"], accounts: null, unitsConsumed: 1000, returnData: null },
          } } });
          return;
        }
      }
      accepted.push(method); result = signature;
    } else if (method === "getSignatureStatuses") result = contextual([{ slot: 100, confirmations: 1, err: null, confirmationStatus: "confirmed" }]);
    else throw new Error(`Unexpected mocked RPC method: ${method}`);
    await route.fulfill({ json: { jsonrpc: "2.0", id, result } });
  });
  await page.addInitScript(({ buyer, publicKey }) => {
    localStorage.setItem("gamepad-motion", "off");
    const testWindow = window as unknown as { __walletSignCount: number };
    testWindow.__walletSignCount = 0;
    const account = { address: buyer, publicKey: new Uint8Array(publicKey), chains: ["solana:devnet"], features: ["solana:signTransaction"] };
    const wallet = {
      version: "1.0.0", name: "Live Test Wallet", chains: ["solana:devnet"], accounts: [],
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=",
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:events": { version: "1.0.0", on: () => () => {} },
        "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy"], signTransaction: async ({ transaction }: { transaction: Uint8Array }) => { testWindow.__walletSignCount++; return [{ signedTransaction: transaction }]; } },
      },
    };
    const register = ({ register }: { register(w: unknown): void }) => register(wallet);
    window.addEventListener("wallet-standard:app-ready", (e: Event) => register((e as CustomEvent).detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  }, { buyer: fx.keys.buyer, publicKey: [...key(fx.keys.buyer)] });
  await page.goto(`${appUrl}?no3d&nointro`);
  await page.getByRole("button", { name: /^Connect/ }).first().click();
  await page.getByRole("button", { name: /Live Test Wallet/ }).click();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Devnet live", { exact: true })).toBeVisible();
  // A catalog-derived listing proves the provider's chain read has finished before either regression runs.
  await page.getByRole("tab", { name: "Market" }).click();
  await expect(page.getByRole("button", { name: /Cancel listing Retired Comet/ })).toBeVisible();
  return {
    expectedPrices, accepted,
    removeOwnedCopy: () => { ownedCount = 0; },
    setFee: (bps: number) => { feeBps = bps; },
    setGamePrice: (price: bigint) => { gamePrice = price; },
    setGenesis: (hash: string) => { genesis = hash; },
    licenseReads: () => licenseReads,
    holdNextRefresh: () => {
      let started!: () => void, release!: () => void;
      const pending = new Promise<void>(resolve => { started = resolve; });
      const ready = new Promise<void>(resolve => { release = resolve; });
      holdGameRead = { started, ready };
      return { pending, release };
    },
  };
}

test("a live buy preserves the displayed quote when the chain price is higher", async ({ page }) => {
  const chain = await mockLiveStore(page, 500_000_000n);
  await page.getByRole("tab", { name: "Store" }).click();
  await expect(page.getByRole("button", { name: /Buy · 0\.5 SOL$/ })).toBeVisible();
  chain.setGamePrice(750_000_000n);
  await page.getByRole("button", { name: /Buy · 0\.5 SOL$/ }).click();
  await expect(page.getByText("Transaction simulation failed", { exact: true })).toBeVisible();
  expect(chain.expectedPrices).toEqual([500_000_000n]);
  expect(chain.accepted).toHaveLength(0);
  await expect(page.getByText("Hollow Crown is in your library", { exact: true })).toHaveCount(0);
});

test("inactive custom games keep owned copies and resale listings accessible", async ({ page }) => {
  const chain = await mockLiveStore(page);
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Retired Comet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sell this copy$/ })).toBeEnabled();
  chain.removeOwnedCopy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await page.getByRole("tab", { name: "Market" }).click();
  await expect(page.getByRole("button", { name: /Cancel listing Retired Comet/ })).toBeEnabled();
  await page.getByRole("button", { name: "Store page for Retired Comet" }).click();
  await expect(page.getByRole("heading", { name: "Retired Comet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Not on sale$/ })).toBeDisabled();
  await page.keyboard.press("Enter");
  expect(chain.accepted).toHaveLength(0);
});

test("live payout labels use the store's current platform fee", async ({ page }) => {
  const chain = await mockLiveStore(page);
  chain.setFee(1500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("You get 0.154 SOL", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Store" }).click();
  await expect(page.locator(".fact", { hasText: "Studio gets" }).locator("dd")).toHaveText("0.212 SOL");
  await page.getByRole("tab", { name: "Library" }).click();
  await page.getByRole("button", { name: /Sell this copy$/ }).click();
  await page.getByRole("textbox").fill("0.2");
  await expect(page.getByText("GamePad 0.03 SOL", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Studio" }).click();
  await expect(page.getByText("Per copy: you get 0.136 SOL (GamePad 15%)", { exact: true })).toBeVisible();
});

test("a delayed old refresh cannot replace newer ownership", async ({ page }) => {
  const chain = await mockLiveStore(page);
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Retired Comet" })).toBeVisible();
  const held = chain.holdNextRefresh();
  const previousLicenseReads = chain.licenseReads();
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(chain.licenseReads).toBeGreaterThan(previousLicenseReads);
    await held.pending;
    chain.removeOwnedCopy();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
    const oldResponse = page.waitForResponse(response => new URL(response.url()).origin === RPC_URL && response.request().postDataJSON().method === "getProgramAccounts" && response.request().postDataJSON().params[1].filters[0].memcmp.bytes === getBase58Decoder().decode(new Uint8Array(ACCOUNT.Game)), { timeout: 5000 });
    held.release();
    await (await oldResponse).finished();
    // A browser frame after the released read gives React time to commit any erroneous stale update.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  } finally { held.release(); }
});

test("an RPC serving another ledger is refused before the wallet signs", async ({ page }) => {
  const chain = await mockLiveStore(page);
  chain.setGenesis("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
  await page.getByRole("tab", { name: "Store" }).click();
  await page.getByRole("button", { name: /Buy · 0\.25 SOL$/ }).click();
  await expect(page.getByText("This RPC is not Solana devnet. No transaction was signed or sent.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __walletSignCount: number }).__walletSignCount)).toBe(0);
  expect(chain.accepted).toHaveLength(0);
});
