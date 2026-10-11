// Client for the gamepad_store Anchor program (program/). Imports only @solana/kit so the seed script
// can load it straight from Node too. Layouts and discriminators mirror program/programs/gamepad-store/src/lib.rs.
import {
  AccountRole, addDecoderSizePrefix, addEncoderSizePrefix, getAddressDecoder, getAddressEncoder, getBase58Decoder,
  getBase64Encoder, getBooleanDecoder, getBooleanEncoder, getProgramDerivedAddress, getStructDecoder, getStructEncoder,
  getU16Decoder, getU16Encoder, getU32Decoder, getU32Encoder, getU64Decoder, getU64Encoder, getU8Decoder,
  getUtf8Decoder, getUtf8Encoder, type Address, type Base58EncodedBytes, type Decoder, type Encoder, type Instruction,
} from "@solana/kit";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
export const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111" as Address;

const IX = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  setFee: [18, 154, 24, 18, 237, 214, 19, 80],
  publishGame: [225, 95, 31, 36, 126, 167, 53, 223],
  updateGame: [159, 61, 132, 131, 3, 234, 209, 220],
  buy: [102, 6, 61, 18, 1, 218, 235, 234],
  list: [54, 174, 193, 67, 17, 41, 132, 38],
  cancel: [232, 219, 223, 41, 219, 236, 220, 190],
  buyListing: [115, 149, 42, 108, 44, 49, 140, 153],
} as const;
export const ACCOUNT = {
  Store: [130, 48, 247, 244, 182, 191, 30, 26],
  Game: [27, 90, 166, 125, 74, 100, 121, 18],
  License: [248, 152, 195, 100, 185, 108, 176, 231],
  Listing: [218, 32, 50, 73, 43, 134, 26, 58],
} as const;

/* ---------------- accounts ---------------- */

export type StoreAccount = { authority: Address; treasury: Address; feeBps: number; gameCount: bigint; listingCount: bigint };
export type GameAccount = { id: bigint; studio: Address; price: bigint; royaltyBps: number; active: boolean; uri: string };
export type LicenseAccount = { owner: Address; gameId: bigint; count: number };
export type ListingAccount = { id: bigint; seller: Address; gameId: bigint; price: bigint };

const str = { enc: addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder()), dec: addDecoderSizePrefix(getUtf8Decoder(), getU32Decoder()) };

const storeDecoder = getStructDecoder([
  ["authority", getAddressDecoder()], ["treasury", getAddressDecoder()], ["feeBps", getU16Decoder()],
  ["gameCount", getU64Decoder()], ["listingCount", getU64Decoder()], ["bump", getU8Decoder()],
]);
const gameDecoder = getStructDecoder([
  ["id", getU64Decoder()], ["studio", getAddressDecoder()], ["price", getU64Decoder()], ["royaltyBps", getU16Decoder()],
  ["active", getBooleanDecoder()], ["bump", getU8Decoder()], ["uri", str.dec],
]);
const licenseDecoder = getStructDecoder([["owner", getAddressDecoder()], ["gameId", getU64Decoder()], ["count", getU32Decoder()], ["bump", getU8Decoder()]]);
const listingDecoder = getStructDecoder([["id", getU64Decoder()], ["seller", getAddressDecoder()], ["gameId", getU64Decoder()], ["price", getU64Decoder()], ["bump", getU8Decoder()]]);

/** Decodes an account after checking its 8-byte Anchor discriminator; undefined when it is a different account. */
function decodeAs<T>(kind: keyof typeof ACCOUNT, decoder: Decoder<T>, data: Uint8Array): T | undefined {
  const d = ACCOUNT[kind];
  if (data.length < 8 || d.some((b, i) => data[i] !== b)) return undefined;
  return decoder.decode(data, 8);
}
export const decodeStore = (data: Uint8Array) => decodeAs("Store", storeDecoder, data) as StoreAccount | undefined;
export const decodeGame = (data: Uint8Array) => decodeAs("Game", gameDecoder, data) as GameAccount | undefined;
export const decodeLicense = (data: Uint8Array) => decodeAs("License", licenseDecoder, data) as LicenseAccount | undefined;
export const decodeListing = (data: Uint8Array) => decodeAs("Listing", listingDecoder, data) as ListingAccount | undefined;

/** Base64 account data as returned by the RPC, as bytes. */
export const bytesOf = (data: readonly [string, string] | string) => new Uint8Array(getBase64Encoder().encode(typeof data === "string" ? data : data[0]));

/** getProgramAccounts filters: every account of one kind, optionally only those whose first field is `owner`. */
export function filtersFor(kind: keyof typeof ACCOUNT, owner?: Address, ownerOffset = 8) {
  const b58 = getBase58Decoder();
  const f: { memcmp: { offset: bigint; bytes: Base58EncodedBytes; encoding: "base58" } }[] = [
    { memcmp: { offset: 0n, bytes: b58.decode(new Uint8Array(ACCOUNT[kind])) as Base58EncodedBytes, encoding: "base58" } },
  ];
  if (owner) f.push({ memcmp: { offset: BigInt(ownerOffset), bytes: owner as unknown as Base58EncodedBytes, encoding: "base58" } });
  return f;
}

/* ---------------- addresses ---------------- */

const u64 = getU64Encoder();
const addr = getAddressEncoder();
const pda = async (programAddress: Address, seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"]) =>
  (await getProgramDerivedAddress({ programAddress, seeds }))[0];

export const storePda = (program: Address) => pda(program, ["store"]);
export const programDataPda = (program: Address) => pda(UPGRADEABLE_LOADER, [addr.encode(program)]);
export const gamePda = (program: Address, id: bigint | number) => pda(program, ["game", u64.encode(BigInt(id))]);
export const licensePda = (program: Address, gameId: bigint | number, owner: Address) => pda(program, ["license", u64.encode(BigInt(gameId)), addr.encode(owner)]);
export const listingPda = (program: Address, id: bigint | number) => pda(program, ["listing", u64.encode(BigInt(id))]);

/* ---------------- instructions ---------------- */

const w = (a: Address) => ({ address: a, role: AccountRole.WRITABLE });
const r = (a: Address) => ({ address: a, role: AccountRole.READONLY });
const ws = (a: Address) => ({ address: a, role: AccountRole.WRITABLE_SIGNER });
const rs = (a: Address) => ({ address: a, role: AccountRole.READONLY_SIGNER });

function data<T extends object>(disc: readonly number[], enc?: Encoder<T>, args?: T): Uint8Array {
  const body = enc && args ? enc.encode(args) : new Uint8Array();
  const out = new Uint8Array(8 + body.length);
  out.set(disc); out.set(body, 8);
  return out;
}

const feeArgs = getStructEncoder([["feeBps", getU16Encoder()], ["treasury", getAddressEncoder()]]);
const publishArgs = getStructEncoder([["price", getU64Encoder()], ["royaltyBps", getU16Encoder()], ["uri", str.enc]]);
const updateArgs = getStructEncoder([["gameId", getU64Encoder()], ["price", getU64Encoder()], ["active", getBooleanEncoder()]]);
const buyArgs = getStructEncoder([["gameId", getU64Encoder()], ["expectedPrice", getU64Encoder()]]);
const listArgs = getStructEncoder([["gameId", getU64Encoder()], ["price", getU64Encoder()]]);
const idArg = getStructEncoder([["id", getU64Encoder()]]);

export async function initializeIx(program: Address, authority: Address, feeBps: number, treasury: Address): Promise<Instruction> {
  return { programAddress: program, accounts: [w(await storePda(program)), ws(authority), r(SYSTEM_PROGRAM), r(await programDataPda(program))], data: data(IX.initialize, feeArgs, { feeBps, treasury }) };
}

/** Publishes the store's next game; `nextId` is the store's game_count + 1. */
export async function publishGameIx(program: Address, studio: Address, nextId: bigint, a: { price: bigint; royaltyBps: number; uri: string }, bootstrapAuthority?: Address): Promise<Instruction> {
  return {
    programAddress: program,
    accounts: [w(await storePda(program)), w(await gamePda(program, nextId)), ws(studio), r(SYSTEM_PROGRAM), bootstrapAuthority ? rs(bootstrapAuthority) : r(program)],
    data: data(IX.publishGame, publishArgs, a),
  };
}

export async function updateGameIx(program: Address, studio: Address, gameId: bigint, price: bigint, active: boolean): Promise<Instruction> {
  return { programAddress: program, accounts: [w(await gamePda(program, gameId)), rs(studio)], data: data(IX.updateGame, updateArgs, { gameId, price, active }) };
}

/** Buys a new copy. `expectedPrice` makes the purchase fail instead of charging more if the studio changed the price. */
export async function buyIx(program: Address, a: { buyer: Address; gameId: bigint; studio: Address; treasury: Address; expectedPrice: bigint }): Promise<Instruction> {
  return {
    programAddress: program,
    accounts: [
      r(await storePda(program)), r(await gamePda(program, a.gameId)), w(await licensePda(program, a.gameId, a.buyer)),
      ws(a.buyer), w(a.studio), w(a.treasury), r(SYSTEM_PROGRAM),
    ],
    data: data(IX.buy, buyArgs, { gameId: a.gameId, expectedPrice: a.expectedPrice }),
  };
}

/** Lists one copy for resale; `nextId` is the store's listing_count + 1. */
export async function listIx(program: Address, a: { seller: Address; gameId: bigint; price: bigint; nextId: bigint }): Promise<Instruction> {
  return {
    programAddress: program,
    accounts: [
      w(await storePda(program)), w(await licensePda(program, a.gameId, a.seller)), w(await listingPda(program, a.nextId)),
      ws(a.seller), r(SYSTEM_PROGRAM),
    ],
    data: data(IX.list, listArgs, { gameId: a.gameId, price: a.price }),
  };
}

export async function cancelIx(program: Address, a: { seller: Address; listingId: bigint; gameId: bigint }): Promise<Instruction> {
  return {
    programAddress: program,
    accounts: [w(await listingPda(program, a.listingId)), w(await licensePda(program, a.gameId, a.seller)), ws(a.seller)],
    data: data(IX.cancel, idArg, { id: a.listingId }),
  };
}

export async function buyListingIx(program: Address, a: { buyer: Address; listingId: bigint; gameId: bigint; seller: Address; studio: Address; treasury: Address }): Promise<Instruction> {
  return {
    programAddress: program,
    accounts: [
      r(await storePda(program)), w(await listingPda(program, a.listingId)), r(await gamePda(program, a.gameId)),
      w(await licensePda(program, a.gameId, a.buyer)), ws(a.buyer), w(a.seller), w(a.studio), w(a.treasury), r(SYSTEM_PROGRAM),
    ],
    data: data(IX.buyListing, idArg, { id: a.listingId }),
  };
}
