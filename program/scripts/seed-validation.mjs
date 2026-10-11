// Read-only checks shared by the devnet seeder and its regression tests.
export function validateSeedState({ store, games, catalog, authority, treasury, studio, feeBps }) {
  if (store) {
    for (const [field, expected] of Object.entries({ authority, treasury, feeBps })) {
      if (store[field] !== expected) throw new Error(`Existing store ${field} does not match the requested setup`);
    }
  } else if (games.some(Boolean)) {
    throw new Error("Found game accounts without a store; refusing to seed");
  }

  const existing = games.filter(Boolean);
  if (existing.length && !studio) throw new Error("Existing seed games require their original STUDIO_KEYPAIR; refusing to create a replacement");
  let missing = false;
  for (let i = 0; i < catalog.length; i++) {
    const game = games[i];
    if (!game) { missing = true; continue; }
    if (missing) throw new Error("Seed catalog has a gap; refusing to skip unrelated game accounts");
    const expected = {
      id: BigInt(catalog[i].chainId), studio,
      price: BigInt(Math.round(catalog[i].price * 1e9)),
      royaltyBps: Math.round(catalog[i].royaltyPct * 100),
      active: true, uri: `ipfs://pending/${catalog[i].slug}.json`,
    };
    for (const [field, value] of Object.entries(expected)) {
      if (game[field] !== value) throw new Error(`Seed game #${expected.id} ${field} does not match ${catalog[i].slug}`);
    }
  }
  if (store && store.gameCount !== BigInt(existing.length) && existing.length < catalog.length) {
    throw new Error("Store game count does not match its partial seed catalog");
  }
  if (store && store.gameCount < BigInt(existing.length)) throw new Error("Store game count is behind its seed catalog");
}
