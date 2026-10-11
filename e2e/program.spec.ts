import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { AccountRole, address, type Address, type Instruction } from "@solana/kit";
import {
  buyIx, buyListingIx, cancelIx, decodeGame, decodeLicense, decodeListing, decodeStore, initializeIx, listIx, publishGameIx, updateGameIx,
} from "../src/web3/storeProgram";

// program/client-fixture.json is written by the program's own instruction builders (tests/client_fixture.rs).
// The web client has to produce the same accounts, roles and bytes, or its transactions would fail on devnet.
type Fixture = {
  program: string; keys: Record<"buyer" | "studio" | "treasury" | "seller" | "authority", string>;
  instructions: Record<string, { accounts: [string, boolean, boolean][]; data: string }>;
  accounts: Record<"store" | "game" | "license" | "listing", string>;
};
const fx: Fixture = JSON.parse(readFileSync(new URL("../program/client-fixture.json", import.meta.url), "utf8"));
const P = address(fx.program);
const k = Object.fromEntries(Object.entries(fx.keys).map(([n, v]) => [n, address(v)])) as Record<keyof Fixture["keys"], Address>;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const bytes = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
const flat = (i: Instruction) => ({
  accounts: (i.accounts ?? []).map(a => [a.address, a.role === AccountRole.READONLY_SIGNER || a.role === AccountRole.WRITABLE_SIGNER, a.role === AccountRole.WRITABLE || a.role === AccountRole.WRITABLE_SIGNER]),
  data: hex(i.data as Uint8Array),
});

test.skip(({ isMobile }) => isMobile, "runs once, in node");

test("the client builds every instruction exactly like the program", async () => {
  const built: Record<string, Instruction> = {
    initialize: await initializeIx(P, k.authority, 1000, k.treasury),
    publishGame: await publishGameIx(P, k.studio, 17n, { price: 250_000_000n, royaltyBps: 800, uri: "ipfs://pending/ndp.json" }),
    updateGame: await updateGameIx(P, k.studio, 3n, 120_000_000n, false),
    buy: await buyIx(P, { buyer: k.buyer, gameId: 2n, studio: k.studio, treasury: k.treasury, expectedPrice: 250_000_000n }),
    list: await listIx(P, { seller: k.seller, gameId: 2n, price: 200_000_000n, nextId: 9n }),
    cancel: await cancelIx(P, { seller: k.seller, listingId: 9n, gameId: 2n }),
    buyListing: await buyListingIx(P, { buyer: k.buyer, listingId: 9n, gameId: 2n, seller: k.seller, studio: k.studio, treasury: k.treasury }),
  };
  expect(Object.keys(built).sort()).toEqual(Object.keys(fx.instructions).sort());
  for (const [name, i] of Object.entries(built)) {
    expect(i.programAddress, name).toBe(P);
    expect(flat(i), name).toEqual(fx.instructions[name]);
  }
});

test("the client reads every account the program writes", () => {
  expect(decodeStore(bytes(fx.accounts.store))).toMatchObject({ authority: k.authority, treasury: k.treasury, feeBps: 1000, gameCount: 16n, listingCount: 9n });
  expect(decodeGame(bytes(fx.accounts.game))).toMatchObject({ id: 2n, studio: k.studio, price: 250_000_000n, royaltyBps: 800, active: true, uri: "ipfs://pending/hcr.json" });
  expect(decodeLicense(bytes(fx.accounts.license))).toMatchObject({ owner: k.buyer, gameId: 2n, count: 3 });
  expect(decodeListing(bytes(fx.accounts.listing))).toMatchObject({ id: 9n, seller: k.seller, gameId: 2n, price: 200_000_000n });
  // a different account kind is never mistaken for this one
  expect(decodeGame(bytes(fx.accounts.listing))).toBeUndefined();
});
