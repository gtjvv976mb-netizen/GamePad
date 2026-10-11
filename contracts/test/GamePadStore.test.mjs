import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, zeroAddress } from "viem";
import {
  BPS,
  alice,
  balanceOf,
  bob,
  carol,
  deploy,
  deployFixture,
  deployer,
  expectRevert,
  gasCost,
  newTreasury,
  publish,
  studio,
  treasury,
} from "./helpers.mjs";

const PRICE = parseEther("0.012");

describe("publishGame / updateGame", () => {
  it("publishes games with ids starting at 1 and stores them", async () => {
    const store = await deploy();
    assert.equal(await store.read("gameCount"), 0n);

    const receipt = await store.write(studio, "publishGame", [PRICE, 700, "ipfs://ndp.json"]);
    const [ev] = store.events(receipt, "GamePublished");
    assert.deepEqual(ev.args, { id: 1n, studio, price: PRICE, royaltyBps: 700, uri: "ipfs://ndp.json" });

    assert.equal(await publish(store, alice, 0n, 0, "ipfs://free.json"), 2n);
    assert.equal(await store.read("gameCount"), 2n);
    assert.deepEqual(await store.read("games", [1n]), [studio, PRICE, 700, true, "ipfs://ndp.json"]);
    assert.deepEqual(await store.read("games", [2n]), [alice, 0n, 0, true, "ipfs://free.json"]);
    assert.equal(await store.read("uri", [1n]), "ipfs://ndp.json");
  });

  it("caps the royalty at 15%", async () => {
    const store = await deploy();
    assert.equal(await publish(store, studio, PRICE, 1500), 1n);
    await expectRevert(store.write(studio, "publishGame", [PRICE, 1501, "x"]), "RoyaltyTooHigh");
  });

  it("falls back to the base uri when a game has no uri", async () => {
    const store = await deploy({ baseUri: "ipfs://base/{id}.json" });
    await publish(store, studio, PRICE, 0, "");
    assert.equal(await store.read("uri", [1n]), "ipfs://base/{id}.json");
    assert.equal(await store.read("uri", [99n]), "ipfs://base/{id}.json");
  });

  it("lets only the studio update price and active", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE, 500);

    const receipt = await store.write(studio, "updateGame", [id, 1234n, false]);
    assert.deepEqual(store.events(receipt, "GameUpdated")[0].args, { id, price: 1234n, active: false });
    const [, price, royaltyBps, active] = await store.read("games", [id]);
    assert.deepEqual([price, royaltyBps, active], [1234n, 500, false]);

    await expectRevert(store.write(alice, "updateGame", [id, 1n, true]), "NotStudio");
    await expectRevert(store.write(alice, "updateGame", [42n, 1n, true]), "NotStudio"); // unknown id
  });
});

describe("buy", () => {
  it("mints one license and credits fee/studio split to owed (no ETH pushed)", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE, 700);
    const studioEthBefore = await balanceOf(studio);

    const receipt = await store.write(alice, "buy", [id], PRICE);
    assert.deepEqual(store.events(receipt, "Purchased")[0].args, { id, buyer: alice, price: PRICE });

    const fee = (PRICE * 1000n) / BPS; // default 10%
    assert.equal(fee, parseEther("0.0012"));
    assert.equal(await store.read("balanceOf", [alice, id]), 1n);
    assert.equal(await store.read("owed", [treasury]), fee);
    assert.equal(await store.read("owed", [studio]), PRICE - fee);
    assert.equal(await balanceOf(store.address), PRICE); // held until withdraw
    assert.equal(await balanceOf(studio), studioEthBefore); // pull payments only
  });

  it("rounds the platform fee down and gives the remainder to the studio", async () => {
    const store = await deploy();
    const id = await publish(store, studio, 1001n);
    await store.write(alice, "buy", [id], 1001n);
    assert.equal(await store.read("owed", [treasury]), 100n);
    assert.equal(await store.read("owed", [studio]), 901n);
  });

  it("lets a player buy multiple copies", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE);
    await store.write(alice, "buy", [id], PRICE);
    await store.write(alice, "buy", [id], PRICE);
    assert.equal(await store.read("balanceOf", [alice, id]), 2n);
  });

  it("reverts on the wrong value", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE);
    await expectRevert(store.write(alice, "buy", [id], PRICE - 1n), "WrongValue", [PRICE, PRICE - 1n]);
    await expectRevert(store.write(alice, "buy", [id], PRICE + 1n), "WrongValue", [PRICE, PRICE + 1n]);
    await expectRevert(store.write(alice, "buy", [id], 0n), "WrongValue", [PRICE, 0n]);
  });

  it("reverts for inactive and unknown games", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE);
    await store.write(studio, "updateGame", [id, PRICE, false]);
    await expectRevert(store.write(alice, "buy", [id], PRICE), "GameNotActive");
    await expectRevert(store.write(alice, "buy", [99n], 0n), "GameNotActive");

    await store.write(studio, "updateGame", [id, PRICE, true]);
    await store.write(alice, "buy", [id], PRICE);
    assert.equal(await store.read("balanceOf", [alice, id]), 1n);
  });

  it("handles free games", async () => {
    const store = await deploy();
    const id = await publish(store, studio, 0n);
    await store.write(alice, "buy", [id], 0n);
    assert.equal(await store.read("balanceOf", [alice, id]), 1n);
    assert.equal(await store.read("owed", [treasury]), 0n);
    assert.equal(await store.read("owed", [studio]), 0n);
    await expectRevert(store.write(bob, "buy", [id], 1n), "WrongValue", [0n, 1n]);
  });
});

describe("resale market", () => {
  // studio publishes a game (8% royalty); alice owns one copy.
  async function setup(royaltyBps = 800) {
    const store = await deploy();
    const id = await publish(store, studio, PRICE, royaltyBps);
    await store.write(alice, "buy", [id], PRICE);
    return { store, id };
  }

  it("list moves the license into escrow", async () => {
    const { store, id } = await setup();
    const listPrice = parseEther("0.02");
    const receipt = await store.write(alice, "list", [id, listPrice]);

    assert.deepEqual(store.events(receipt, "Listed")[0].args, { listingId: 1n, gameId: id, seller: alice, price: listPrice });
    assert.equal(await store.read("listingCount"), 1n);
    assert.deepEqual(await store.read("listings", [1n]), [alice, id, listPrice, true]);
    assert.equal(await store.read("balanceOf", [alice, id]), 0n);
    assert.equal(await store.read("balanceOf", [store.address, id]), 1n);
  });

  it("cannot list a license you do not hold", async () => {
    const { store, id } = await setup();
    await expectRevert(store.write(bob, "list", [id, 1n]), "ERC1155InsufficientBalance");
  });

  it("cancel returns the license, and only the seller can cancel", async () => {
    const { store, id } = await setup();
    await store.write(alice, "list", [id, PRICE]);

    await expectRevert(store.write(bob, "cancel", [1n]), "NotSeller");
    const receipt = await store.write(alice, "cancel", [1n]);
    assert.deepEqual(store.events(receipt, "Cancelled")[0].args, { listingId: 1n });

    assert.equal(await store.read("balanceOf", [alice, id]), 1n);
    assert.equal(await store.read("balanceOf", [store.address, id]), 0n);
    assert.equal((await store.read("listings", [1n]))[3], false);
    await expectRevert(store.write(alice, "cancel", [1n]), "ListingNotActive");
    await expectRevert(store.write(bob, "buyListing", [1n], PRICE), "ListingNotActive");
  });

  it("buyListing splits royalty / fee / seller exactly and moves the license", async () => {
    const { store, id } = await setup(800);
    const listPrice = parseEther("0.02");
    await store.write(alice, "list", [id, listPrice]);

    const before = {
      studio: await store.read("owed", [studio]),
      treasury: await store.read("owed", [treasury]),
      alice: await store.read("owed", [alice]),
    };
    const receipt = await store.write(bob, "buyListing", [1n], listPrice);

    const royalty = parseEther("0.0016"); // 8%
    const fee = parseEther("0.002"); // 10%
    const sellerCut = parseEther("0.0164"); // the rest
    assert.equal(royalty + fee + sellerCut, listPrice);
    assert.equal((await store.read("owed", [studio])) - before.studio, royalty);
    assert.equal((await store.read("owed", [treasury])) - before.treasury, fee);
    assert.equal((await store.read("owed", [alice])) - before.alice, sellerCut);

    assert.deepEqual(store.events(receipt, "Sold")[0].args, {
      listingId: 1n,
      gameId: id,
      seller: alice,
      buyer: bob,
      price: listPrice,
      royalty,
      fee,
    });
    assert.equal(await store.read("balanceOf", [bob, id]), 1n);
    assert.equal(await store.read("balanceOf", [store.address, id]), 0n);
    assert.deepEqual(await store.read("listings", [1n]), [alice, id, listPrice, false]);
    // Contract holds exactly what it owes: primary sale + resale.
    assert.equal(await balanceOf(store.address), PRICE + listPrice);
  });

  it("resale royalty still applies when the game is no longer sold new", async () => {
    const { store, id } = await setup(1500);
    await store.write(studio, "updateGame", [id, PRICE, false]);
    await store.write(alice, "list", [id, 10_000n]);
    const receipt = await store.write(bob, "buyListing", [1n], 10_000n);
    const { royalty, fee } = store.events(receipt, "Sold")[0].args;
    assert.deepEqual([royalty, fee], [1500n, 1000n]);
    assert.equal(await store.read("owed", [alice]), 7500n);
  });

  it("can't buy a closed listing, a missing one, or with the wrong value", async () => {
    const { store, id } = await setup();
    await store.write(alice, "list", [id, PRICE]);
    await expectRevert(store.write(bob, "buyListing", [1n], PRICE - 1n), "WrongValue", [PRICE, PRICE - 1n]);

    await store.write(bob, "buyListing", [1n], PRICE);
    await expectRevert(store.write(carol, "buyListing", [1n], PRICE), "ListingNotActive");
    await expectRevert(store.write(alice, "cancel", [1n]), "ListingNotActive");
    await expectRevert(store.write(carol, "buyListing", [2n], 0n), "ListingNotActive");
  });

  it("licenses stay freely transferable outside the market", async () => {
    const { store, id } = await setup();
    await store.write(alice, "safeTransferFrom", [alice, carol, id, 1n, "0x"]);
    assert.equal(await store.read("balanceOf", [carol, id]), 1n);
    // and the new owner can list it
    await store.write(carol, "list", [id, PRICE]);
    assert.deepEqual(await store.read("listings", [1n]), [carol, id, PRICE, true]);
  });
});

describe("withdraw", () => {
  it("pays out the owed balance and zeroes it", async () => {
    const store = await deploy();
    const id = await publish(store, studio, PRICE);
    await store.write(alice, "buy", [id], PRICE);
    const fee = (PRICE * 1000n) / BPS;

    const ethBefore = await balanceOf(studio);
    const receipt = await store.write(studio, "withdraw");
    assert.deepEqual(store.events(receipt, "Withdrawn")[0].args, { account: studio, amount: PRICE - fee });
    assert.equal(await balanceOf(studio), ethBefore + PRICE - fee - gasCost(receipt));
    assert.equal(await store.read("owed", [studio]), 0n);
    await expectRevert(store.write(studio, "withdraw"), "NothingToWithdraw");

    const tBefore = await balanceOf(treasury);
    const r2 = await store.write(treasury, "withdraw");
    assert.equal(await balanceOf(treasury), tBefore + fee - gasCost(r2));
    assert.equal(await balanceOf(store.address), 0n);
  });

  it("reverts with nothing owed", async () => {
    const store = await deploy();
    await expectRevert(store.write(alice, "withdraw"), "NothingToWithdraw");
  });

  it("is reentrancy-safe", async () => {
    const store = await deploy();
    const attacker = await deployFixture("ReentrantWithdrawer.sol", "ReentrantWithdrawer", [store.address]);
    await attacker.write(deployer, "publish", [PRICE]);
    await store.write(alice, "buy", [1n], PRICE);
    // Someone else's 1 ETH sale, so the store holds far more than the attacker is owed:
    // a vulnerable withdraw() would pay the attacker several times over.
    const other = await publish(store, studio, parseEther("1"));
    await store.write(bob, "buy", [other], parseEther("1"));
    const owed = await store.read("owed", [attacker.address]);
    assert.equal(owed, PRICE - (PRICE * 1000n) / BPS);
    const storeEth = await balanceOf(store.address);

    // Re-entry bubbles up -> the payout call fails -> the whole withdraw reverts, balance intact.
    await expectRevert(attacker.write(deployer, "attack"), "TransferFailed");
    assert.equal(await store.read("owed", [attacker.address]), owed);

    // Re-entry swallowed -> paid exactly once.
    await attacker.write(deployer, "setSwallow", [true]);
    await attacker.write(deployer, "attack");
    assert.equal(await attacker.read("reentrySucceeded"), false);
    assert.equal(await attacker.read("received"), owed);
    assert.equal(await balanceOf(attacker.address), owed);
    assert.equal(await store.read("owed", [attacker.address]), 0n);
    assert.equal(await balanceOf(store.address), storeEth - owed); // everyone else's funds untouched
  });
});

describe("owner admin", () => {
  it("setFee is owner-only, capped at 15%, and applies to later sales", async () => {
    const store = await deploy();
    assert.equal(await store.read("owner"), deployer);
    assert.equal(await store.read("feeBps"), 1000);

    await expectRevert(store.write(alice, "setFee", [500]), "OwnableUnauthorizedAccount", [alice]);
    await expectRevert(store.write(deployer, "setFee", [1501]), "FeeTooHigh");
    const receipt = await store.write(deployer, "setFee", [1500]);
    assert.deepEqual(store.events(receipt, "FeeUpdated")[0].args, { bps: 1500 });
    await store.write(deployer, "setFee", [250]);
    assert.equal(await store.read("feeBps"), 250);

    const id = await publish(store, studio, 10_000n);
    await store.write(alice, "buy", [id], 10_000n);
    assert.equal(await store.read("owed", [treasury]), 250n);
    assert.equal(await store.read("owed", [studio]), 9750n);
  });

  it("setTreasury is owner-only, rejects zero, and redirects later fees", async () => {
    const store = await deploy();
    await expectRevert(store.write(alice, "setTreasury", [alice]), "OwnableUnauthorizedAccount", [alice]);
    await expectRevert(store.write(deployer, "setTreasury", [zeroAddress]), "ZeroAddress");

    const id = await publish(store, studio, 10_000n);
    await store.write(alice, "buy", [id], 10_000n);
    const receipt = await store.write(deployer, "setTreasury", [newTreasury]);
    assert.deepEqual(store.events(receipt, "TreasuryUpdated")[0].args, { treasury: newTreasury });
    assert.equal(await store.read("treasury"), newTreasury);
    await store.write(bob, "buy", [id], 10_000n);

    assert.equal(await store.read("owed", [treasury]), 1000n); // earned before the switch
    assert.equal(await store.read("owed", [newTreasury]), 1000n);
  });

  it("constructor rejects a zero treasury", async () => {
    await assert.rejects(deploy({ treasury: zeroAddress }));
  });
});

describe("ERC-2981", () => {
  it("royaltyInfo reports the studio and per-game royalty", async () => {
    const store = await deploy();
    await publish(store, studio, PRICE, 800);
    await publish(store, alice, 0n, 0);
    assert.deepEqual(await store.read("royaltyInfo", [1n, parseEther("1")]), [studio, parseEther("0.08")]);
    assert.deepEqual(await store.read("royaltyInfo", [1n, 999n]), [studio, 79n]); // rounds down
    assert.deepEqual(await store.read("royaltyInfo", [2n, parseEther("1")]), [alice, 0n]);
    assert.deepEqual(await store.read("royaltyInfo", [77n, parseEther("1")]), [zeroAddress, 0n]);
  });

  it("supportsInterface: ERC-165, ERC-1155, ERC-1155 metadata, ERC-2981", async () => {
    const store = await deploy();
    for (const iface of ["0x01ffc9a7", "0xd9b67a26", "0x0e89341c", "0x2a55205a"]) {
      assert.equal(await store.read("supportsInterface", [iface]), true, iface);
    }
    assert.equal(await store.read("supportsInterface", ["0xffffffff"]), false);
  });
});
