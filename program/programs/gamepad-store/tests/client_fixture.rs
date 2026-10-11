//! A golden file shared with the web client. The program's own instruction builders write every instruction
//! (accounts, roles and data) and one encoded account of each kind for fixed inputs; e2e/program.spec.ts checks
//! that src/web3/storeProgram.ts builds and reads exactly the same bytes.
//! After changing the program, regenerate with: UPDATE_FIXTURE=1 cargo test --test client_fixture

use anchor_lang::{AccountSerialize, InstructionData, ToAccountMetas};
use gamepad_store::{accounts as acc, instruction as ix, Game, License, Listing, Store};
use anchor_lang::{system_program, solana_program::bpf_loader_upgradeable};
use solana_sdk::{instruction::AccountMeta, pubkey::Pubkey};

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../client-fixture.json");

fn pda(seeds: &[&[u8]]) -> Pubkey { Pubkey::find_program_address(seeds, &gamepad_store::ID).0 }
fn key(n: u8) -> Pubkey { Pubkey::new_from_array([n; 32]) }
fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

fn entry(name: &str, metas: Vec<AccountMeta>, data: Vec<u8>) -> String {
    let accounts: Vec<String> = metas.iter()
        .map(|m| format!(r#"[{:?}, {}, {}]"#, m.pubkey.to_string(), m.is_signer, m.is_writable))
        .collect();
    format!("    {name:?}: {{ \"accounts\": [{}], \"data\": {:?} }}", accounts.join(", "), hex(&data))
}

fn account<T: AccountSerialize>(name: &str, a: &T) -> String {
    let mut b = Vec::new();
    a.try_serialize(&mut b).unwrap();
    format!("    {name:?}: {:?}", hex(&b))
}

#[test]
fn client_fixture() {
    let (buyer, studio, treasury, seller, authority) = (key(1), key(2), key(3), key(4), key(5));
    let store = pda(&[b"store"]);
    let game = |id: u64| pda(&[b"game", &id.to_le_bytes()]);
    let license = |id: u64, o: &Pubkey| pda(&[b"license", &id.to_le_bytes(), o.as_ref()]);
    let listing = |id: u64| pda(&[b"listing", &id.to_le_bytes()]);
    let sys = system_program::ID;
    let program_data = Pubkey::find_program_address(&[gamepad_store::ID.as_ref()], &bpf_loader_upgradeable::ID).0;

    let ixs = [
        entry("initialize", acc::Initialize { store, authority, system_program: sys, program_data }.to_account_metas(None),
            ix::Initialize { fee_bps: 1000, treasury }.data()),
        entry("publishGame", acc::PublishGame { store, game: game(17), studio, system_program: sys, bootstrap_authority: None }.to_account_metas(None),
            ix::PublishGame { price: 250_000_000, royalty_bps: 800, uri: "ipfs://pending/ndp.json".into() }.data()),
        entry("publishBootstrapGame", acc::PublishGame { store, game: game(1), studio, system_program: sys, bootstrap_authority: Some(authority) }.to_account_metas(None),
            ix::PublishGame { price: 250_000_000, royalty_bps: 800, uri: "ipfs://pending/ndp.json".into() }.data()),
        entry("updateGame", acc::UpdateGame { game: game(3), studio }.to_account_metas(None),
            ix::UpdateGame { game_id: 3, price: 120_000_000, active: false }.data()),
        entry("buy", acc::Buy { store, game: game(2), license: license(2, &buyer), buyer, studio, treasury, system_program: sys }.to_account_metas(None),
            ix::Buy { game_id: 2, expected_price: 250_000_000 }.data()),
        entry("list", acc::List { store, license: license(2, &seller), listing: listing(9), seller, system_program: sys }.to_account_metas(None),
            ix::List { game_id: 2, price: 200_000_000 }.data()),
        entry("cancel", acc::Cancel { listing: listing(9), license: license(2, &seller), seller }.to_account_metas(None),
            ix::Cancel { listing_id: 9 }.data()),
        entry("buyListing", acc::BuyListing {
            store, listing: listing(9), game: game(2), buyer_license: license(2, &buyer),
            buyer, seller, studio, treasury, system_program: sys,
        }.to_account_metas(None), ix::BuyListing { listing_id: 9 }.data()),
    ];
    let accounts = [
        account("store", &Store { authority, treasury, fee_bps: 1000, game_count: 16, listing_count: 9, bump: 254 }),
        account("game", &Game { id: 2, studio, price: 250_000_000, royalty_bps: 800, active: true, bump: 253, uri: "ipfs://pending/hcr.json".into() }),
        account("license", &License { owner: buyer, game_id: 2, count: 3, bump: 252 }),
        account("listing", &Listing { id: 9, seller, game_id: 2, price: 200_000_000, bump: 251 }),
    ];
    let json = format!(
        "{{\n  \"program\": {:?},\n  \"keys\": {{ \"buyer\": {:?}, \"studio\": {:?}, \"treasury\": {:?}, \"seller\": {:?}, \"authority\": {:?} }},\n  \"instructions\": {{\n{}\n  }},\n  \"accounts\": {{\n{}\n  }}\n}}\n",
        gamepad_store::ID.to_string(), buyer.to_string(), studio.to_string(), treasury.to_string(), seller.to_string(), authority.to_string(),
        ixs.join(",\n"), accounts.join(",\n"),
    );
    if std::env::var("UPDATE_FIXTURE").is_ok() {
        std::fs::write(FIXTURE, &json).unwrap();
    }
    let saved = std::fs::read_to_string(FIXTURE).unwrap_or_default();
    assert_eq!(saved, json, "program/client-fixture.json is stale: run UPDATE_FIXTURE=1 cargo test --test client_fixture");
}
