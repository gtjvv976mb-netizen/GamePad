import { expect, test } from "@playwright/test";
import { GAMES } from "../src/data/games";
// @ts-expect-error Node-only seeding helper has no TypeScript declarations.
import { validateSeedState } from "../program/scripts/seed-validation.mjs";

test.skip(({ isMobile }) => isMobile, "runs once, in node");

const authority = "authority", treasury = "treasury", studio = "studio", feeBps = 1000;
const games = GAMES.map(g => ({ id: BigInt(g.chainId), studio, price: BigInt(Math.round(g.price * 1e9)), royaltyBps: Math.round(g.royaltyPct * 100), active: true, uri: `ipfs://pending/${g.slug}.json` }));
const base = { catalog: GAMES, authority, treasury, studio, feeBps };
const store = { authority, treasury, feeBps, gameCount: 16n };

test("seed preflight accepts fresh, matching partial and completed catalogs", () => {
  validateSeedState({ ...base, store: undefined, games: GAMES.map(() => undefined), studio: undefined });
  validateSeedState({ ...base, store: { ...store, gameCount: 2n }, games: games.map((g, i) => i < 2 ? g : undefined) });
  validateSeedState({ ...base, store: { ...store, gameCount: 18n }, games });
});

test("seed preflight rejects takeover, unrelated seed slots and replacement keys", () => {
  for (const field of ["authority", "treasury", "feeBps"] as const) {
    expect(() => validateSeedState({ ...base, store: { ...store, [field]: field === "feeBps" ? 1500 : "unrelated" }, games })).toThrow(`store ${field}`);
  }
  for (const [field, value] of Object.entries({ id: 99n, studio: "other studio", price: 1n, royaltyBps: 1500, active: false, uri: "unrelated metadata" })) {
    expect(() => validateSeedState({ ...base, store, games: [{ ...games[0], [field]: value }, ...games.slice(1)] })).toThrow(`game #1 ${field}`);
  }
  expect(() => validateSeedState({ ...base, store, games, studio: undefined })).toThrow("original STUDIO_KEYPAIR");
  expect(() => validateSeedState({ ...base, store, games: games.map((g, i) => i === 1 ? undefined : g) })).toThrow("gap");
  expect(() => validateSeedState({ ...base, store: { ...store, gameCount: 4n }, games: games.map((g, i) => i < 2 ? g : undefined) })).toThrow("partial seed");
});
